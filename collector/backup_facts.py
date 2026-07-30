"""Logical backup of the irreplaceable fact tables.

Deliberately NOT a whole-database dump. This database is ~97% regenerable
snapshot churn (option_contract_snapshots / option_oi_delta_snapshots /
scanner_results_snapshots are rematerialized continuously and pruned on a
retention window), and backing those up wastes time and space for rows that
are worthless hours later. What cannot be rebuilt is backed up here:

  * candidate_ledger      -- point-in-time record of what the model recommended,
                             scored at expiry. Impossible to reconstruct: you
                             cannot go back and ask the model what it thought.
  * volatility_history    -- the 252-observation IV Rank series. Rebuildable
    / iv_history             from Polygon in principle, but measured at ~3 min
                             per symbol, so a full universe re-backfill is ~15h
                             of wall clock plus the API spend.
  * price_history         -- daily bars are cheap to refetch; the 30m series is
    / price_history_30m      NOT, because the provider lookback window is finite
                             (PRICE_30M_LOOKBACK_DAYS), so bars older than that
                             window cannot be recovered once lost.
  * news_articles         -- IB tickNews only pushes current headlines; there is
                             no historical replay (this is the whole reason the
                             R3.2 collector exists in its current form).
  * external_flow_events  -- WebSocket stream, no historical backfill endpoint.
  * symbol_universe       -- small, and reconstructing scan_enabled/metadata
                             state from watchlist.txt alone loses disable
                             reasons and on-demand registrations.

Written as gzipped CSV via COPY so it needs no pg_dump binary (the server is
Postgres 18 and an older client-side pg_dump refuses to dump it) and stays
restorable with plain `COPY ... FROM`.

CLI: python backup_facts.py [--out DIR]
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
DEFAULT_OUT = os.getenv('FACT_BACKUP_DIR', str(Path.home() / 'quantrift-backups'))
# Keep this many timestamped backup runs; older ones are removed.
KEEP_RUNS = max(int(os.getenv('FACT_BACKUP_KEEP', '14')), 1)

TABLES = [
    'candidate_ledger',
    'volatility_history',
    'iv_history',
    'price_history',
    'price_history_30m',
    'news_articles',
    'external_flow_events',
    'symbol_universe',
]


def backup_table(conn, table: str, out_dir: Path) -> dict:
    """COPY one table to a gzipped CSV. Returns row/byte counts for verification."""
    target = out_dir / f'{table}.csv.gz'
    buffer = io.StringIO()
    with conn.cursor() as cur:
        cur.copy_expert(f'COPY {table} TO STDOUT WITH CSV HEADER', buffer)
    payload = buffer.getvalue()
    with gzip.open(target, 'wt', encoding='utf-8') as handle:
        handle.write(payload)
    # -1 for the header line; a table with no rows still writes its header.
    rows = max(payload.count('\n') - 1, 0)
    return {'rows': rows, 'bytes': target.stat().st_size}


def prune_old_runs(root: Path, keep: int) -> list:
    """Drop all but the newest `keep` run directories. Best effort."""
    runs = sorted([p for p in root.iterdir() if p.is_dir() and p.name.startswith('20')])
    removed = []
    for stale in runs[:-keep] if len(runs) > keep else []:
        try:
            for child in stale.iterdir():
                child.unlink()
            stale.rmdir()
            removed.append(stale.name)
        except OSError as exc:
            log.warning('could not remove old backup %s: %s', stale, exc)
    return removed


def run(out_root: str | None = None) -> dict:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    root = Path(out_root or DEFAULT_OUT)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out_dir = root / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = psycopg2.connect(DB_URL)
    result: dict = {'run': stamp, 'dir': str(out_dir), 'tables': {}}
    try:
        for table in TABLES:
            try:
                result['tables'][table] = backup_table(conn, table, out_dir)
            except Exception as exc:  # noqa: BLE001 - one bad table must not lose the rest
                conn.rollback()
                log.error('backup %s failed: %s', table, exc)
                result['tables'][table] = {'error': str(exc)}
    finally:
        conn.close()

    result['total_bytes'] = sum(v.get('bytes', 0) for v in result['tables'].values())
    result['failed'] = [t for t, v in result['tables'].items() if 'error' in v]
    (out_dir / 'manifest.json').write_text(json.dumps(result, indent=2))
    result['pruned'] = prune_old_runs(root, KEEP_RUNS)
    return result


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        datefmt='%Y-%m-%d %H:%M:%S')
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=None)
    outcome = run(parser.parse_args().out)
    print(json.dumps(outcome, indent=2))
