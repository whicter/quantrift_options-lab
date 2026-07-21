"""Retention pruning for high-churn snapshot tables.

These tables are materialized snapshots, not source facts: every product read
uses only the latest (scan: MAX(snapshot_ts); weekly/unusual: last few days), so
old rows carry no product value and only grow the database. Two prune roots
cover the bloat because of foreign keys:

  * option_chain_snapshots (snapshot_ts): deleting a row ON DELETE CASCADE also
    removes its option_contract_snapshots, gex_snapshots, gex_by_strike_snapshots
    and option_oi_delta_snapshots -- the four largest option tables at once.
  * scanner_results_snapshots (created_at): standalone, no FK, pruned directly.

Retention windows are chosen to exceed the longest consumer look-back:
  * option_chain_snapshots: 7 days (weekly reads ~5 trading days of GEX/OI).
  * scanner_results_snapshots: 3 days (scan/alerts read only the latest batch).

Deletes are batched and per-call capped so the first cleanup of a large backlog
drains over several cycles instead of taking one long lock on Railway. Best
effort: a prune failure is logged and never aborts the collector cycle.

CLI: python prune_snapshots.py
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
BATCH_SIZE = max(int(os.getenv('SNAPSHOT_PRUNE_BATCH_SIZE', '5000')), 1)
MAX_ROWS_PER_CALL = max(int(os.getenv('SNAPSHOT_PRUNE_MAX_ROWS_PER_CALL', '50000')), BATCH_SIZE)

# table -> (timestamp_column, retention_days). Order matters only cosmetically.
RETENTION = {
    'option_chain_snapshots': ('snapshot_ts', int(os.getenv('OPTION_CHAIN_RETENTION_DAYS', '7'))),
    'scanner_results_snapshots': ('created_at', int(os.getenv('SCANNER_RESULTS_RETENTION_DAYS', '3'))),
}


def prune_table(conn, table: str, ts_column: str, retention_days: int,
                batch_size: int = BATCH_SIZE, max_rows: int = MAX_ROWS_PER_CALL) -> int:
    """Delete rows older than retention_days in bounded batches. Returns count.

    ctid-batched so each statement locks few rows; committed per batch so a
    Railway hiccup mid-drain still makes progress. Stops at max_rows so a huge
    first cleanup is spread across cycles rather than one long transaction.
    """
    if retention_days <= 0:
        return 0
    deleted = 0
    while deleted < max_rows:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                DELETE FROM {table}
                WHERE ctid IN (
                    SELECT ctid FROM {table}
                    WHERE {ts_column} < NOW() - (%s::int * INTERVAL '1 day')
                    LIMIT %s
                )
                """,
                (retention_days, min(batch_size, max_rows - deleted)),
            )
            batch = cur.rowcount
        conn.commit()
        deleted += batch
        if batch == 0:
            break
    if deleted:
        log.info('pruned %s rows from %s older than %s days', deleted, table, retention_days)
    return deleted


def run() -> dict:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    conn = psycopg2.connect(DB_URL)
    results: dict = {}
    try:
        for table, (ts_column, days) in RETENTION.items():
            try:
                results[table] = prune_table(conn, table, ts_column, days)
            except Exception as exc:  # noqa: BLE001 - pruning must never break the cycle
                conn.rollback()
                log.warning('prune %s failed: %s', table, exc)
                results[table] = None
    finally:
        conn.close()
    return results


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        datefmt='%Y-%m-%d %H:%M:%S')
    print(run())
