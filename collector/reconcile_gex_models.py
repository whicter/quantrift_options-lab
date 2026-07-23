"""Backfill derived GEX when a stored option snapshot uses an older model version.

This reads PostgreSQL only. It never calls an option-data provider, so a GEX
model upgrade cannot leave otherwise usable watchlist chains unavailable.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv

import compute_gex
from common import load_watchlist


load_dotenv(Path(__file__).with_name('.env'))

log = logging.getLogger(__name__)
DB_URL = os.getenv('DATABASE_URL')
RECONCILE_BATCH_SIZE = max(int(os.getenv('GEX_MODEL_RECONCILE_BATCH_SIZE', '100')), 1)


def needs_recompute(raw_metrics: dict[str, Any] | None) -> bool:
    return not isinstance(raw_metrics, dict) or raw_metrics.get('model_version') != compute_gex.GEX_MODEL_VERSION


def load_candidates(conn, symbols: list[str], limit: int) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH latest_chain AS (
              SELECT DISTINCT ON (symbol) *
              FROM option_chain_snapshots
              WHERE symbol = ANY(%s)
              ORDER BY symbol, snapshot_ts DESC
            )
            SELECT c.*, g.raw_metrics AS gex_raw_metrics
            FROM latest_chain c
            LEFT JOIN gex_snapshots g ON g.snapshot_id = c.id
            WHERE COALESCE(g.raw_metrics->>'model_version', '') <> %s
            ORDER BY c.snapshot_ts ASC, c.symbol ASC
            LIMIT %s
            """,
            (symbols, compute_gex.GEX_MODEL_VERSION, limit),
        )
        columns = [description[0] for description in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def run() -> dict[str, Any]:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    conn = psycopg2.connect(DB_URL)
    written = 0
    skipped: list[tuple[str, str]] = []
    try:
        candidates = load_candidates(conn, load_watchlist(), RECONCILE_BATCH_SIZE)
        for snapshot in candidates:
            try:
                contracts = compute_gex.load_contracts(conn, snapshot['id'])
                metrics = compute_gex.compute_for_snapshot(snapshot, contracts)
                compute_gex.persist_gex(conn, metrics)
                written += 1
            except Exception as exc:
                conn.rollback()
                skipped.append((snapshot['symbol'], str(exc)))
                log.warning('GEX reconciliation skipped %s: %s', snapshot['symbol'], exc)
    finally:
        conn.close()

    result = {'selected': written + len(skipped), 'written': written, 'skipped': skipped}
    log.info('GEX model reconciliation selected=%s written=%s skipped=%s', result['selected'], written, len(skipped))
    return result


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    run()
