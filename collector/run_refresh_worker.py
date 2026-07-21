"""
Refresh worker for queued provider_fetch_jobs.

The API only enqueues jobs. This worker is the execution boundary for provider
calls and snapshot materialization.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json


def _json_safe(value):
    """Fallback encoder for job summaries: dates/Decimals/etc. -> str.

    Job summaries are written via psycopg2 Json (json.dumps under the hood), so a
    raw datetime.date or Decimal in a summary would raise "Object of type date is
    not JSON serializable" and fail the whole job (observed 2026-07-21 on stale
    metrics jobs). Stringifying unknown types keeps the job from failing on a
    bookkeeping field.
    """
    return str(value)


def _job_json(summary):
    return Json(summary or {}, dumps=lambda obj: json.dumps(obj, default=_json_safe))

import collect
import collect_options
import collect_prices
import compute_gex
import derive_volatility
import materialize_oi_delta
import materialize_scan
import symbol_data_state

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
WORKER_BATCH_SIZE = int(os.getenv('REFRESH_WORKER_BATCH_SIZE', '10'))
WORKER_MAX_ATTEMPTS = int(os.getenv('REFRESH_WORKER_MAX_ATTEMPTS', '3'))
RUNNING_JOB_TIMEOUT_MINUTES = int(os.getenv('REFRESH_WORKER_RUNNING_TIMEOUT_MINUTES', '15'))
# Polygon's paid plan is unlimited, so this cap is only a runaway-loop backstop,
# never a cost throttle. The default MUST stay far above real daily usage
# (~1-3k requests): `reserve_budget` upserts request_budget on every reservation,
# so any process that runs the worker with this env UNSET clobbers the shared
# provider_request_usage row down to the default. A low default (the old 1000)
# meant a second runtime (e.g. the Railway refresh cycle) could silently cap
# production at 1000 and starve the entire market session -- observed 2026-07-21.
PROVIDER_DAILY_BUDGET = int(os.getenv('PROVIDER_DAILY_BUDGET', '1000000'))
TT_CIRCUIT_OPEN = os.getenv('TT_CIRCUIT_OPEN', '').strip().lower() in ('1', 'true', 'yes')
SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal', 'polygon_licensed'}
# Polygon remains the primary chain source.  When a snapshot has no executable
# quote, use the locally subscribed IB Gateway before considering any other
# transitional provider.
DEFAULT_OPTION_FALLBACK_PROVIDERS = 'ib_internal'
NON_RETRYABLE_ERROR_PREFIXES = (
    'unsupported option provider for worker:',
    'tastytrade auth unavailable:',
    'tastytrade metrics auth unavailable:',
    'provider auth unavailable for this worker run:',
    'provider unavailable for this worker run:',
    'option quote unavailable:',
    # A spent daily budget does not replenish until the next budget day, so
    # retrying the same job 3x only multiplies failures against the wall.
    'provider budget exhausted:',
)


def fetch_jobs(conn) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE provider_fetch_jobs
            SET status = 'running',
                attempts = attempts + 1,
                started_at = NOW(),
                last_error = NULL
            WHERE id IN (
              SELECT id
              FROM provider_fetch_jobs
              WHERE status = 'queued'
                AND attempts < %s
              ORDER BY COALESCE((request_params->>'priority')::int, 0) DESC,
                       created_at ASC
              LIMIT %s
              FOR UPDATE SKIP LOCKED
            )
            RETURNING id, symbol, job_type, provider, attempts, request_params
            """,
            (WORKER_MAX_ATTEMPTS, WORKER_BATCH_SIZE),
        )
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
    conn.commit()
    return [dict(zip(cols, row)) for row in rows]


def deduplicate_queued_jobs(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
              SELECT id,
                     ROW_NUMBER() OVER (
                       PARTITION BY symbol, job_type, provider
                       ORDER BY created_at DESC, id DESC
                     ) AS queue_rank
              FROM provider_fetch_jobs
              WHERE status = 'queued'
            )
            UPDATE provider_fetch_jobs AS jobs
            SET status = 'succeeded',
                result_summary = '{"deduplicated": true}'::jsonb,
                last_error = 'superseded by newer queued refresh job',
                finished_at = NOW()
            FROM ranked
            WHERE jobs.id = ranked.id
              AND ranked.queue_rank > 1
            """
        )
        count = cur.rowcount
    conn.commit()
    return count


def fail_unrunnable_queued_jobs(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE provider_fetch_jobs
            SET status = 'failed',
                last_error = CASE
                  WHEN attempts >= %s THEN 'maximum worker attempts exhausted'
                  ELSE 'invalid queued refresh symbol'
                END,
                finished_at = NOW()
            WHERE status = 'queued'
              AND (
                attempts >= %s
                OR (
                  NOT (symbol ~ '^[A-Z][A-Z0-9.-]{0,9}$')
                  AND NOT (job_type = 'scanner_materialize' AND symbol = '__SCAN__')
                )
              )
            """,
            (WORKER_MAX_ATTEMPTS, WORKER_MAX_ATTEMPTS),
        )
        count = cur.rowcount
    conn.commit()
    return count


def recover_stale_running_jobs(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE provider_fetch_jobs
            SET status = 'queued',
                last_error = 'recovered stale running job after worker timeout',
                finished_at = NOW()
            WHERE status = 'running'
              AND started_at < NOW() - (%s::int * INTERVAL '1 minute')
              AND attempts < %s
            """,
            (RUNNING_JOB_TIMEOUT_MINUTES, WORKER_MAX_ATTEMPTS),
        )
        count = cur.rowcount
    conn.commit()
    return count


def finish_job(conn, job_id: int, status: str, summary: dict | None = None, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE provider_fetch_jobs
            SET status = %s,
                result_summary = %s,
                last_error = %s,
                finished_at = NOW()
            WHERE id = %s
            """,
            (status, _job_json(summary), error, job_id),
        )
    conn.commit()


def reserve_budget(conn, provider: str, job_type: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO provider_request_usage (provider, usage_date, job_type, request_count, request_budget)
            VALUES (%s, CURRENT_DATE, %s, 0, %s)
            ON CONFLICT (provider, usage_date, job_type) DO UPDATE SET
              request_budget = EXCLUDED.request_budget,
              updated_at = NOW()
            RETURNING request_count, request_budget
            """,
            (provider, job_type, PROVIDER_DAILY_BUDGET),
        )
        request_count, request_budget = cur.fetchone()
        if request_budget and request_count >= request_budget:
            raise RuntimeError(f'provider budget exhausted: provider={provider}, job_type={job_type}, budget={request_budget}')
        cur.execute(
            """
            UPDATE provider_request_usage
            SET request_count = request_count + 1,
                updated_at = NOW()
            WHERE provider = %s
              AND usage_date = CURRENT_DATE
              AND job_type = %s
            """,
            (provider, job_type),
        )
    conn.commit()


def run_scanner_materialize() -> dict[str, Any]:
    materialize_scan.run()
    return {'materialized': True, 'scan_key': materialize_scan.SCAN_KEY}


class PendingDerivations:
    """Global derivations requested by jobs in the current batch.

    OI delta and scanner materialization read every symbol, so their cost does
    not depend on which job asked for them. Running them per job made a batch of
    N option snapshots recompute the whole scanner N times. Jobs record what they
    invalidated here and the batch runs each derivation once at the end.
    """

    def __init__(self) -> None:
        self.oi_delta = False
        self.scan = False
        # Explicit scanner_materialize jobs finish only once the deferred run
        # reports its real outcome, so a failure is never recorded as success.
        self.scan_job_ids: list[int] = []

    def request_oi_delta(self) -> None:
        self.oi_delta = True

    def request_scan(self, job_id: int | None = None) -> None:
        self.scan = True
        if job_id is not None:
            self.scan_job_ids.append(job_id)


def run_pending_derivations(conn, pending: PendingDerivations) -> dict[str, Any]:
    summary: dict[str, Any] = {'oi_delta': 'skipped', 'scan': 'skipped'}

    if pending.oi_delta:
        try:
            materialize_oi_delta.run()
            summary['oi_delta'] = 'materialized'
        except Exception as exc:
            summary['oi_delta'] = 'failed'
            summary['oi_delta_error'] = str(exc)
            log.error('batch OI delta materialization failed: %s', exc)

    if pending.scan:
        try:
            materialize_scan.run()
            summary['scan'] = 'materialized'
        except Exception as exc:
            summary['scan'] = 'failed'
            summary['scan_error'] = str(exc)
            log.error('batch scanner materialization failed: %s', exc)

    for job_id in pending.scan_job_ids:
        if summary['scan'] == 'materialized':
            finish_job(conn, job_id, 'succeeded', summary={'materialized': True, 'scan_key': materialize_scan.SCAN_KEY})
            log.info('job %s succeeded: scanner_materialize', job_id)
        else:
            finish_job(conn, job_id, 'failed', error=summary.get('scan_error', 'scanner materialization did not run'))
            log.error('job %s failed: scanner_materialize', job_id)

    return summary


def load_chain_snapshot_by_id(conn, snapshot_id: int) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM option_chain_snapshots
            WHERE id = %s
            """,
            (snapshot_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))


def option_fallback_providers(primary_provider: str) -> list[str]:
    raw = os.getenv('OPTION_FALLBACK_PROVIDERS', DEFAULT_OPTION_FALLBACK_PROVIDERS)
    providers = []
    for part in raw.split(','):
        provider = part.strip().lower()
        if not provider or provider == primary_provider or provider in providers:
            continue
        if provider in SUPPORTED_OPTION_PROVIDERS:
            providers.append(provider)
    return providers


def option_provider_sequence(primary_provider: str, blocked_providers: set[str] | None = None) -> list[str]:
    blocked_providers = blocked_providers or set()
    providers = [primary_provider, *option_fallback_providers(primary_provider)]
    return [
        provider for provider in providers
        if not (provider == 'tt_internal' and 'tastytrade' in blocked_providers)
    ]


# A daily close is only an acceptable "current price" when it is genuinely
# recent (yesterday's close overnight, or today's after the session). Four days
# was catastrophic: a Thursday close was still served as spot the following
# Monday, so a symbol that refreshes every 5 minutes showed a 4-day-old price.
# Keep this at 1 day; when the daily close is older the provider fetches a fresh
# price (delayed intraday during the session, else /prev prior close) instead.
SPOT_HINT_MAX_AGE_DAYS = max(int(os.getenv('OPTION_SPOT_HINT_MAX_AGE_DAYS', '1')), 0)


def latest_db_spot(conn, symbol: str, max_age_days: int = SPOT_HINT_MAX_AGE_DAYS) -> float | None:
    """Most recent licensed daily close for a symbol, if fresh enough to be spot.

    Returns None when missing or stale, so the caller falls back to /prev rather
    than centering the option chain on an out-of-date price.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT close
            FROM price_history
            WHERE symbol = %s
              AND source = 'polygon_licensed'
              AND close IS NOT NULL
              AND date >= (NOW() AT TIME ZONE 'America/New_York')::date - %s::int
            ORDER BY date DESC
            LIMIT 1
            """,
            (symbol, max_age_days),
        )
        row = cur.fetchone()
    return float(row[0]) if row and row[0] is not None else None


def fetch_and_persist_option_snapshot(
    conn,
    symbol: str,
    provider_name: str,
    provider_cache: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    provider_cache = provider_cache if provider_cache is not None else {}
    provider = provider_cache.get(provider_name)
    if provider is None:
        collect_options.OPTION_PROVIDER = provider_name
        provider = collect_options.make_provider()
        provider_cache[provider_name] = provider
    # Only Polygon fetches a separate underlying request; tt/ib carry spot in
    # their own chain payloads, so the hint is provider-specific.
    if provider_name == 'polygon_licensed':
        spot_hint = latest_db_spot(conn, symbol)
        snapshot = provider.fetch_option_chain(symbol, spot_hint=spot_hint)
    else:
        snapshot = provider.fetch_option_chain(symbol)
    snapshot_id = collect_options.persist_snapshot(conn, snapshot)
    return snapshot_id, snapshot


def has_usable_option_quotes(snapshot: Any) -> bool:
    return any(
        contract.bid is not None
        and contract.ask is not None
        and contract.ask > 0
        and contract.ask >= contract.bid
        for contract in snapshot.contracts
    )


def finalize_option_snapshot(conn, snapshot_id: int, pending: PendingDerivations | None = None) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    try:
        chain_snapshot = load_chain_snapshot_by_id(conn, snapshot_id)
        if not chain_snapshot:
            raise RuntimeError(f'chain snapshot not found after insert: {snapshot_id}')
        contracts = compute_gex.load_contracts(conn, snapshot_id)
        metrics = compute_gex.compute_for_snapshot(chain_snapshot, contracts)
        gex_id = compute_gex.persist_gex(conn, metrics)
        summary['gex_id'] = gex_id
        summary['gex_confidence'] = metrics['confidence']
    except Exception as exc:
        conn.rollback()
        summary['gex_status'] = 'skipped'
        summary['gex_error'] = str(exc)

    # Per-symbol GEX runs immediately above; the global OI delta and scanner
    # derivations are deferred to one run per batch. Callers without a batch
    # accumulator (tests, ad-hoc invocations) still get the derivations inline.
    if pending is None:
        materialize_oi_delta.run()
        summary['oi_delta_materialized'] = True
        materialize_scan.run()
        summary['scanner_materialized'] = True
    else:
        pending.request_oi_delta()
        pending.request_scan()
        summary['oi_delta_deferred'] = True
        summary['scanner_deferred'] = True
    return summary


def run_option_chain_snapshot(
    conn,
    job: dict[str, Any],
    blocked_providers: set[str] | None = None,
    provider_cache: dict[str, Any] | None = None,
    pending: PendingDerivations | None = None,
) -> dict[str, Any]:
    symbol = job['symbol']
    primary_provider = job['provider'] or os.getenv('OPTION_PROVIDER', 'tt_internal')
    require_quotes = bool((job.get('request_params') or {}).get('require_quotes'))

    if primary_provider not in SUPPORTED_OPTION_PROVIDERS:
        raise RuntimeError(f'unsupported option provider for worker: {primary_provider}')

    attempted = []
    last_exc: Exception | None = None
    for provider_name in option_provider_sequence(primary_provider, blocked_providers):
        attempted.append(provider_name)
        try:
            reserve_budget(conn, provider_name, job['job_type'])
            snapshot_id, snapshot = fetch_and_persist_option_snapshot(
                conn,
                symbol,
                provider_name,
                provider_cache,
            )
        except Exception as exc:
            conn.rollback()
            last_exc = exc
            if is_provider_unavailable(exc):
                if provider_name == 'tt_internal' and blocked_providers is not None:
                    blocked_providers.add('tastytrade')
                log.error('job %s provider %s unavailable; trying fallback: %s', job['id'], provider_name, exc)
                continue
            raise

        if require_quotes and not has_usable_option_quotes(snapshot):
            last_exc = RuntimeError(
                f'option quote unavailable: {provider_name} returned no usable bid/ask quotes'
            )
            log.warning(
                'job %s provider %s returned no usable bid/ask quotes; trying fallback',
                job['id'],
                provider_name,
            )
            continue

        summary = {
            'requested_provider': primary_provider,
            'provider': provider_name,
            'attempted_providers': attempted,
            'fallback_from': primary_provider if provider_name != primary_provider else None,
            'snapshot_id': snapshot_id,
            'contract_count': len(snapshot.contracts),
            'provider_status': snapshot.provider_status,
            'snapshot_ts': snapshot.snapshot_ts.isoformat(),
            # The provider that actually answered, which may be a fallback
            # rather than the one requested.
            'source': provider_name,
        }
        summary.update(finalize_option_snapshot(conn, snapshot_id, pending))
        return summary

    raise last_exc or RuntimeError(f'no supported option provider available for {symbol}')


def run_gex_recompute(conn, job: dict[str, Any], pending: PendingDerivations | None = None) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM option_chain_snapshots
            WHERE symbol = %s
            ORDER BY snapshot_ts DESC
            LIMIT 1
            """,
            (job['symbol'],),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"missing option chain for {job['symbol']}")
        columns = [description[0] for description in cur.description]
        snapshot = dict(zip(columns, row))
    contracts = compute_gex.load_contracts(conn, snapshot['id'])
    metrics = compute_gex.compute_for_snapshot(snapshot, contracts)
    gex_id = compute_gex.persist_gex(conn, metrics)
    summary = {
        'symbol': job['symbol'],
        'snapshot_id': snapshot['id'],
        'gex_id': gex_id,
        'model_version': compute_gex.GEX_MODEL_VERSION,
        # GEX inherits the timing and provenance of the option snapshot it was
        # computed from; it has no independent freshness.
        'snapshot_ts': snapshot['snapshot_ts'],
        'source': snapshot['source'],
    }
    if pending is None:
        materialize_scan.run()
        summary['scanner_materialized'] = True
    else:
        pending.request_scan()
        summary['scanner_deferred'] = True
    return summary


# Which data products each job type is responsible for. Used to mark every
# product a failed job owed, since the job itself reports only one outcome.
JOB_PRODUCTS: dict[str, tuple[str, ...]] = {
    'option_chain_snapshot': (
        symbol_data_state.PRODUCT_OPTION_CHAIN,
        symbol_data_state.PRODUCT_GEX,
    ),
    'gex_recompute': (symbol_data_state.PRODUCT_GEX,),
    'symbol_metrics_snapshot': (symbol_data_state.PRODUCT_METRICS,),
    'price_history_snapshot': (
        symbol_data_state.PRODUCT_PRICE_DAILY,
        symbol_data_state.PRODUCT_PRICE_30M,
    ),
}


def job_product_facts(job: dict[str, Any], summary: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Map one successful job's summary to per-product facts.

    Each product records its own timing and provenance. An option chain can land
    while its GEX is skipped for data-quality reasons, and a price job writes
    daily and 30M bars with different market dates, so neither may share a
    single per-job status.
    """
    job_type = job['job_type']

    if job_type == 'option_chain_snapshot':
        facts: dict[str, dict[str, Any]] = {
            symbol_data_state.PRODUCT_OPTION_CHAIN: {
                'snapshot_ts': summary.get('snapshot_ts'),
                'source': summary.get('source'),
            },
        }
        if summary.get('gex_id'):
            facts[symbol_data_state.PRODUCT_GEX] = {
                'snapshot_ts': summary.get('snapshot_ts'),
                'source': summary.get('source'),
            }
        elif summary.get('gex_status') == 'skipped':
            facts[symbol_data_state.PRODUCT_GEX] = {
                'error': summary.get('gex_error', 'gex computation skipped'),
            }
        return facts

    if job_type == 'gex_recompute':
        return {
            symbol_data_state.PRODUCT_GEX: {
                'snapshot_ts': summary.get('snapshot_ts'),
                'source': summary.get('source'),
            },
        }

    if job_type == 'symbol_metrics_snapshot':
        return {
            symbol_data_state.PRODUCT_METRICS: {
                'market_date': summary.get('market_date'),
                'source': summary.get('source'),
            },
        }

    if job_type == 'price_history_snapshot':
        return {
            symbol_data_state.PRODUCT_PRICE_DAILY: {
                'market_date': summary.get('daily_market_date'),
                'source': summary.get('source'),
            },
            symbol_data_state.PRODUCT_PRICE_30M: {
                'snapshot_ts': summary.get('intraday_snapshot_ts'),
                'market_date': summary.get('intraday_market_date'),
                'source': summary.get('source'),
            },
        }

    return {}


def record_job_state(
    conn,
    job: dict[str, Any],
    summary: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Mirror a job outcome into symbol_data_state.

    Best-effort by design: this table is a read-side summary and the snapshot
    tables remain the source of truth, so failing to record state must never
    turn a successful refresh into a failed job.
    """
    if job['job_type'] not in JOB_PRODUCTS:
        return
    symbol = job.get('symbol')
    if not symbol or symbol == '__SCAN__':
        return

    try:
        if error is not None:
            facts = {product: {'error': error} for product in JOB_PRODUCTS[job['job_type']]}
        else:
            facts = job_product_facts(job, summary or {})
        if facts:
            symbol_data_state.record_products(conn, symbol, facts, job_id=job.get('id'))
    except Exception as exc:
        conn.rollback()
        log.error('failed to record symbol_data_state for job %s: %s', job.get('id'), exc)


def should_retry(exc: Exception) -> bool:
    message = str(exc)
    return not any(message.startswith(prefix) for prefix in NON_RETRYABLE_ERROR_PREFIXES)


def auth_provider_for_job(job: dict[str, Any]) -> str | None:
    if job['job_type'] == 'option_chain_snapshot':
        provider = job['provider'] or os.getenv('OPTION_PROVIDER', 'tt_internal')
        return 'tastytrade' if provider == 'tt_internal' else provider
    if job['job_type'] == 'symbol_metrics_snapshot':
        return 'tastytrade'
    return None


def is_auth_unavailable(exc: Exception) -> bool:
    message = str(exc)
    return 'auth unavailable' in message or 'requires manual login' in message


def is_provider_unavailable(exc: Exception) -> bool:
    message = str(exc).lower()
    return is_auth_unavailable(exc) or any(marker in message for marker in (
        'network unavailable',
        'connecttimeout',
        'connection timed out',
        'read timed out',
        'max retries exceeded',
        'polygon_api_key is required',
    ))


def run_symbol_metrics_snapshot(conn, job: dict[str, Any]) -> dict[str, Any]:
    symbol = job['symbol']
    with conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM volatility_history WHERE symbol=%s AND iv_rank_ready=TRUE)",
            (symbol,),
        )
        if cur.fetchone()[0]:
            return {'symbol': symbol, 'source': 'derived', 'status': 'already_ready'}
    provider_name = job['provider'] if job['provider'] != 'metrics_provider' else 'tastytrade'
    reserve_budget(conn, provider_name, job['job_type'])

    try:
        session_token = collect.get_session_token()
    except SystemExit as exc:
        raise RuntimeError('tastytrade metrics auth unavailable: session renewal requires manual login') from exc
    metrics = collect.fetch_metrics(session_token, [symbol])
    item = metrics.get(symbol)
    if not item:
        raise RuntimeError(f'no metrics returned for {symbol}')

    row = collect.parse_row(symbol, item, date.today())
    collect.upsert_rows(conn, [row])
    # market_date stays a datetime.date: the symbol_data_state update consumes it
    # as a real date. finish_job serializes the summary with a date/Decimal-safe
    # encoder, so it does not need pre-stringifying here.
    return {
        'symbol': symbol,
        'date': row['date'].isoformat(),
        'market_date': row['date'],
        'source': row['source'],
    }


def run_price_history_snapshot(
    conn,
    job: dict[str, Any],
    provider_cache: dict[str, Any] | None = None,
) -> dict[str, Any]:
    symbol = job['symbol']
    provider_cache = provider_cache if provider_cache is not None else {}
    cache_key = 'price:polygon'
    provider = provider_cache.get(cache_key)
    if provider is None:
        collect_prices.PRICE_PROVIDER = 'polygon'
        provider = collect_prices.make_provider()
        provider_cache[cache_key] = provider
    reserve_budget(conn, provider.source, job['job_type'])
    daily_rows, intraday_rows = collect_prices.fetch_price_rows(provider, symbol)
    daily_written = collect_prices.upsert_price_rows(conn, daily_rows, commit=False)
    intraday_written = collect_prices.upsert_30m_rows(conn, intraday_rows, commit=False)
    conn.commit()
    derived = derive_volatility.run(backfill=False, symbols=[symbol])
    # Daily and 30M bars advance independently: an intraday feed can lag the
    # daily close. Report each one's own latest bar rather than a shared date.
    latest_daily = max((bar.date for bar in daily_rows), default=None)
    latest_intraday = max((bar.bar_ts for bar in intraday_rows), default=None)
    return {
        'symbol': symbol,
        'provider': provider.source,
        'source': provider.source,
        'daily_written': daily_written,
        'intraday_written': intraday_written,
        'daily_market_date': latest_daily,
        'intraday_snapshot_ts': latest_intraday,
        'intraday_market_date': latest_intraday.date() if latest_intraday else None,
        'derived': derived,
    }


def handle_job(
    conn,
    job: dict[str, Any],
    blocked_providers: set[str] | None = None,
    provider_cache: dict[str, Any] | None = None,
    pending: PendingDerivations | None = None,
) -> None:
    job_id = job['id']
    blocked_providers = blocked_providers if blocked_providers is not None else set()
    auth_provider = auth_provider_for_job(job)
    if (
        auth_provider
        and auth_provider in blocked_providers
        and not (job['job_type'] == 'option_chain_snapshot' and option_provider_sequence(job['provider'] or os.getenv('OPTION_PROVIDER', 'tt_internal'), blocked_providers))
    ):
        finish_job(
            conn,
            job_id,
            'failed',
            error=f'provider unavailable for this worker run: {auth_provider}',
        )
        log.error('job %s failed: provider unavailable for this worker run: %s', job_id, auth_provider)
        return

    try:
        if job['job_type'] == 'scanner_materialize':
            # The materialization itself is deferred to one batch run. The job
            # row stays 'running' until run_pending_derivations reports the real
            # outcome, so a failed materialize is never recorded as succeeded.
            if pending is None:
                summary = run_scanner_materialize()
            else:
                pending.request_scan(job_id)
                return
        elif job['job_type'] == 'option_chain_snapshot':
            summary = run_option_chain_snapshot(conn, job, blocked_providers, provider_cache, pending)
        elif job['job_type'] == 'gex_recompute':
            summary = run_gex_recompute(conn, job, pending)
        elif job['job_type'] == 'symbol_metrics_snapshot':
            summary = run_symbol_metrics_snapshot(conn, job)
        elif job['job_type'] == 'price_history_snapshot':
            summary = run_price_history_snapshot(conn, job, provider_cache)
        else:
            raise RuntimeError(f"unsupported job_type={job['job_type']}")
        finish_job(conn, job_id, 'succeeded', summary=summary)
        record_job_state(conn, job, summary=summary)
        log.info('job %s succeeded: %s', job_id, job['job_type'])
    except Exception as exc:
        conn.rollback()
        if auth_provider and is_provider_unavailable(exc):
            blocked_providers.add(auth_provider)
        status = 'queued' if should_retry(exc) and job.get('attempts', 1) < WORKER_MAX_ATTEMPTS else 'failed'
        finish_job(conn, job_id, status, error=str(exc))
        record_job_state(conn, job, error=str(exc))
        log.error('job %s %s: %s', job_id, status, exc)


def run() -> None:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    conn = psycopg2.connect(DB_URL)
    try:
        recovered = recover_stale_running_jobs(conn)
        if recovered:
            log.info('Recovered %s stale running jobs', recovered)
        deduplicated = deduplicate_queued_jobs(conn)
        if deduplicated:
            log.info('Deduplicated %s queued refresh jobs', deduplicated)
        failed_unrunnable = fail_unrunnable_queued_jobs(conn)
        if failed_unrunnable:
            log.info('Failed %s unrunnable queued refresh jobs', failed_unrunnable)
        jobs = fetch_jobs(conn)
        if not jobs:
            log.info('No queued refresh jobs')
            return
        log.info('Processing %s refresh jobs', len(jobs))
        blocked_providers: set[str] = {'tastytrade'} if TT_CIRCUIT_OPEN else set()
        provider_cache: dict[str, Any] = {}
        pending = PendingDerivations()
        for job in jobs:
            handle_job(conn, job, blocked_providers, provider_cache, pending)
        derivation_summary = run_pending_derivations(conn, pending)
        log.info('Batch derivations: %s', derivation_summary)
    finally:
        conn.close()


if __name__ == '__main__':
    run()
