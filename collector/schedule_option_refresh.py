from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

from common import load_watchlist


load_dotenv(Path(__file__).with_name('.env'))

log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
REFRESH_PROVIDER = os.getenv('OPTION_REFRESH_PROVIDER', 'tt_internal').strip().lower()
REFRESH_BATCH_SIZE = max(int(os.getenv('OPTION_REFRESH_BATCH_SIZE', '2')), 1)
MAX_AGE_MINUTES = max(int(os.getenv('OPTION_REFRESH_MAX_AGE_MINUTES', '60')), 1)
RETRY_COOLDOWN_MINUTES = max(int(os.getenv('OPTION_REFRESH_RETRY_COOLDOWN_MINUTES', '30')), 1)


def select_candidates(
    symbols: list[str],
    latest_snapshots: dict[str, datetime],
    recent_jobs: set[str],
    now: datetime,
    max_age_minutes: int,
    limit: int,
) -> list[str]:
    cutoff = now - timedelta(minutes=max_age_minutes)
    eligible = [
        symbol
        for symbol in symbols
        if symbol not in recent_jobs
        and (
            symbol not in latest_snapshots
            or latest_snapshots[symbol] is None
            or latest_snapshots[symbol] < cutoff
        )
    ]
    return sorted(
        eligible,
        key=lambda symbol: (
            symbol in latest_snapshots and latest_snapshots[symbol] is not None,
            latest_snapshots.get(symbol) or datetime.min.replace(tzinfo=timezone.utc),
            symbols.index(symbol),
        ),
    )[:limit]


def load_refresh_state(conn, symbols: list[str]) -> tuple[dict[str, datetime], set[str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (symbol) symbol, snapshot_ts
            FROM option_chain_snapshots
            WHERE symbol = ANY(%s)
            ORDER BY symbol, snapshot_ts DESC
            """,
            (symbols,),
        )
        latest_snapshots = {symbol: snapshot_ts for symbol, snapshot_ts in cur.fetchall()}

        cur.execute(
            """
            SELECT DISTINCT symbol
            FROM provider_fetch_jobs
            WHERE symbol = ANY(%s)
              AND job_type = 'option_chain_snapshot'
              AND (
                status IN ('queued', 'running')
                OR created_at >= NOW() - (%s::int * INTERVAL '1 minute')
              )
            """,
            (symbols, RETRY_COOLDOWN_MINUTES),
        )
        recent_jobs = {row[0] for row in cur.fetchall()}
    return latest_snapshots, recent_jobs


def enqueue_candidates(conn, symbols: list[str]) -> int:
    inserted = 0
    with conn.cursor() as cur:
        for symbol in symbols:
            cur.execute(
                """
                INSERT INTO provider_fetch_jobs (
                  symbol, job_type, provider, status, attempts, request_params
                )
                SELECT %s, 'option_chain_snapshot', %s, 'queued', 0, %s
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM provider_fetch_jobs
                  WHERE symbol = %s
                    AND job_type = 'option_chain_snapshot'
                    AND status IN ('queued', 'running')
                )
                """,
                (
                    symbol,
                    REFRESH_PROVIDER,
                    Json({'reason': 'watchlist_auto_refresh'}),
                    symbol,
                ),
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted


def run() -> dict[str, Any]:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    symbols = load_watchlist()
    conn = psycopg2.connect(DB_URL)
    try:
        latest_snapshots, recent_jobs = load_refresh_state(conn, symbols)
        candidates = select_candidates(
            symbols,
            latest_snapshots,
            recent_jobs,
            datetime.now(timezone.utc),
            MAX_AGE_MINUTES,
            REFRESH_BATCH_SIZE,
        )
        inserted = enqueue_candidates(conn, candidates)
    finally:
        conn.close()

    result = {'selected': candidates, 'inserted': inserted, 'provider': REFRESH_PROVIDER}
    log.info('Option refresh scheduler selected=%s inserted=%s provider=%s', candidates, inserted, REFRESH_PROVIDER)
    return result


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )
    run()
