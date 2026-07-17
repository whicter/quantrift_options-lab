"""
Refresh worker for queued provider_fetch_jobs.

The API only enqueues jobs. This worker is the execution boundary for provider
calls and snapshot materialization.
"""

from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

import collect
import collect_options
import collect_prices
import compute_gex
import derive_volatility
import materialize_oi_delta
import materialize_scan

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
PROVIDER_DAILY_BUDGET = int(os.getenv('PROVIDER_DAILY_BUDGET', '1000'))
TT_CIRCUIT_OPEN = os.getenv('TT_CIRCUIT_OPEN', '').strip().lower() in ('1', 'true', 'yes')
SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal', 'polygon_licensed'}
DEFAULT_OPTION_FALLBACK_PROVIDERS = 'tt_internal'
NON_RETRYABLE_ERROR_PREFIXES = (
    'unsupported option provider for worker:',
    'tastytrade auth unavailable:',
    'tastytrade metrics auth unavailable:',
    'provider auth unavailable for this worker run:',
    'provider unavailable for this worker run:',
    'option quote unavailable:',
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
            (status, Json(summary or {}), error, job_id),
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


def finalize_option_snapshot(conn, snapshot_id: int) -> dict[str, Any]:
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

    materialize_oi_delta.run()
    summary['oi_delta_materialized'] = True
    materialize_scan.run()
    summary['scanner_materialized'] = True
    return summary


def run_option_chain_snapshot(
    conn,
    job: dict[str, Any],
    blocked_providers: set[str] | None = None,
    provider_cache: dict[str, Any] | None = None,
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
            if provider_name == 'tt_internal' and is_provider_unavailable(exc):
                if blocked_providers is not None:
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
        }
        summary.update(finalize_option_snapshot(conn, snapshot_id))
        return summary

    raise last_exc or RuntimeError(f'no supported option provider available for {symbol}')


def run_gex_recompute(conn, job: dict[str, Any]) -> dict[str, Any]:
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
    materialize_scan.run()
    return {
        'symbol': job['symbol'],
        'snapshot_id': snapshot['id'],
        'gex_id': gex_id,
        'model_version': compute_gex.GEX_MODEL_VERSION,
    }


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
    return {
        'symbol': symbol,
        'date': row['date'].isoformat(),
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
    return {
        'symbol': symbol,
        'provider': provider.source,
        'daily_written': daily_written,
        'intraday_written': intraday_written,
        'derived': derived,
    }


def handle_job(
    conn,
    job: dict[str, Any],
    blocked_providers: set[str] | None = None,
    provider_cache: dict[str, Any] | None = None,
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
            summary = run_scanner_materialize()
        elif job['job_type'] == 'option_chain_snapshot':
            summary = run_option_chain_snapshot(conn, job, blocked_providers, provider_cache)
        elif job['job_type'] == 'gex_recompute':
            summary = run_gex_recompute(conn, job)
        elif job['job_type'] == 'symbol_metrics_snapshot':
            summary = run_symbol_metrics_snapshot(conn, job)
        elif job['job_type'] == 'price_history_snapshot':
            summary = run_price_history_snapshot(conn, job, provider_cache)
        else:
            raise RuntimeError(f"unsupported job_type={job['job_type']}")
        finish_job(conn, job_id, 'succeeded', summary=summary)
        log.info('job %s succeeded: %s', job_id, job['job_type'])
    except Exception as exc:
        conn.rollback()
        if auth_provider and is_provider_unavailable(exc):
            blocked_providers.add(auth_provider)
        status = 'queued' if should_retry(exc) and job.get('attempts', 1) < WORKER_MAX_ATTEMPTS else 'failed'
        finish_job(conn, job_id, status, error=str(exc))
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
        for job in jobs:
            handle_job(conn, job, blocked_providers, provider_cache)
    finally:
        conn.close()


if __name__ == '__main__':
    run()
