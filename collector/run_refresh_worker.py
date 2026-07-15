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
import compute_gex
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
PROVIDER_DAILY_BUDGET = int(os.getenv('PROVIDER_DAILY_BUDGET', '1000'))
SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal'}


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
              ORDER BY created_at ASC
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


def run_option_chain_snapshot(conn, job: dict[str, Any]) -> dict[str, Any]:
    symbol = job['symbol']
    provider_name = job['provider'] or os.getenv('OPTION_PROVIDER', 'tt_internal')

    if provider_name == 'licensed_options_provider':
        raise RuntimeError('licensed options provider adapter is not configured')
    if provider_name not in SUPPORTED_OPTION_PROVIDERS:
        raise RuntimeError(f'unsupported option provider for worker: {provider_name}')

    reserve_budget(conn, provider_name, job['job_type'])

    collect_options.OPTION_PROVIDER = provider_name
    provider = collect_options.make_provider()
    snapshot = provider.fetch_option_chain(symbol)
    snapshot_id = collect_options.persist_snapshot(conn, snapshot)

    summary = {
        'snapshot_id': snapshot_id,
        'contract_count': len(snapshot.contracts),
        'provider_status': snapshot.provider_status,
        'snapshot_ts': snapshot.snapshot_ts.isoformat(),
    }

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


def run_symbol_metrics_snapshot(conn, job: dict[str, Any]) -> dict[str, Any]:
    symbol = job['symbol']
    provider_name = job['provider'] if job['provider'] != 'metrics_provider' else 'tastytrade'
    reserve_budget(conn, provider_name, job['job_type'])

    session_token = collect.get_session_token()
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


def handle_job(conn, job: dict[str, Any]) -> None:
    job_id = job['id']
    try:
        if job['job_type'] == 'scanner_materialize':
            summary = run_scanner_materialize()
        elif job['job_type'] == 'option_chain_snapshot':
            summary = run_option_chain_snapshot(conn, job)
        elif job['job_type'] == 'symbol_metrics_snapshot':
            summary = run_symbol_metrics_snapshot(conn, job)
        else:
            raise RuntimeError(f"unsupported job_type={job['job_type']}")
        finish_job(conn, job_id, 'succeeded', summary=summary)
        log.info('job %s succeeded: %s', job_id, job['job_type'])
    except Exception as exc:
        conn.rollback()
        status = 'failed' if job.get('attempts', 1) >= WORKER_MAX_ATTEMPTS else 'queued'
        finish_job(conn, job_id, status, error=str(exc))
        log.error('job %s %s: %s', job_id, status, exc)


def run() -> None:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    conn = psycopg2.connect(DB_URL)
    try:
        jobs = fetch_jobs(conn)
        if not jobs:
            log.info('No queued refresh jobs')
            return
        log.info('Processing %s refresh jobs', len(jobs))
        for job in jobs:
            handle_job(conn, job)
    finally:
        conn.close()


if __name__ == '__main__':
    run()
