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
import shutil
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from collector_runtime import configure_logging, load_collector_env

load_collector_env(__file__)

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
    # gex_history / gex_strike_history are irreplaceable for the same reason as
    # candidate_ledger: they record what dealer positioning WAS at a past
    # moment. Their operational sources (gex_snapshots, gex_by_strike_snapshots)
    # are destroyed within 7 days by prune_snapshots' CASCADE, so once a day
    # passes there is nothing left to recompute from.
    'gex_history',
    'gex_strike_history',
    # squeeze_watch reads option_chain_snapshots.oi_by_strike, which the 7-day
    # chain prune destroys, so a captured row can never be rebuilt afterwards --
    # the candidate_ledger case again.
    'squeeze_watch',
    # Short interest is cheap to refetch (two full-market calls) but only within
    # the provider's lookback; older settlements cannot be recovered once the
    # window moves past them, same shape as price_history_30m.
    'short_interest_history',
    'short_volume_history',
    # IB publishes today's availability and no history, so a lost row is a
    # permanent hole in exactly the trend this table exists to measure.
    'borrow_availability_history',
    # The one-shot case: a far leg can only be priced on the day its near leg
    # expires. The chain snapshot behind it is pruned within 7 days, and a quote
    # from any later session is a different day's price, so a lost row does not
    # just delay a candidate_ledger outcome -- it makes that row unscoreable for
    # good.
    'ledger_far_leg_marks',
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


def has_backup_content(run_dir: Path) -> bool:
    """True when a run directory holds at least one real backup file.

    macOS writes an AppleDouble `._name` sidecar beside every file on the exFAT
    external volume, so a directory can look populated while containing nothing
    but sidecars. Those are metadata for files that are gone, never data.
    """
    return any(
        f.is_file() and not f.name.startswith('._')
        for f in run_dir.iterdir()
    )


def prune_old_runs(root: Path, keep: int) -> list:
    """Drop all but the newest `keep` run directories, plus any empty shells.

    Two exFAT-specific hazards, both observed on this volume in 2026-08:

    `shutil.rmtree` rather than a manual iterdir loop. iterdir() is a lazy
    generator over the live directory, and deleting `name` also removes its
    AppleDouble `._name` sidecar -- so the generator could advance onto an entry
    that had just vanished and raise mid-loop, aborting the rmdir and leaving a
    partly-stripped run behind. An earlier fix added unlink(missing_ok=True),
    which covers deleting an absent file but not iterating a mutating directory.

    Shells are removed regardless of age. prune counted directories, not
    contents, so a run that died before writing anything still consumed one of
    the `keep` slots and pushed out a real backup -- KEEP=14 was holding 13
    backups and one empty 20260804T091459Z.
    """
    runs = sorted([p for p in root.iterdir() if p.is_dir() and p.name.startswith('20')])

    shells = [p for p in runs if not has_backup_content(p)]
    survivors = [p for p in runs if p not in shells]
    stale = survivors[:-keep] if len(survivors) > keep else []

    removed = []
    for target in shells + stale:
        try:
            shutil.rmtree(target)
            removed.append(target.name)
        except OSError as exc:
            log.warning('could not remove old backup %s: %s', target, exc)
    if shells:
        log.info('removed %s empty run shell(s): %s',
                 len(shells), ', '.join(p.name for p in shells))
    return removed


def assert_backup_root_usable(root: Path) -> None:
    """Fail loudly when the backup target is an unmounted removable volume.

    The default target lives on an external drive. If that drive is not
    mounted, `/Volumes/<name>` is either absent or an empty stub, and a plain
    mkdir(parents=True) would happily create a phantom directory tree that
    silently disappears the moment the real volume is remounted -- producing
    backups that appear to succeed and do not exist. A backup that lies about
    existing is worse than one that fails, so refuse to write instead.
    """
    parts = root.resolve().parts
    if len(parts) < 3 or parts[1] != 'Volumes':
        return  # not a removable-volume path; nothing to verify
    mount_point = Path(parts[0]) / parts[1] / parts[2]
    if not mount_point.is_dir():
        raise RuntimeError(
            f'backup volume {mount_point} is not mounted; refusing to write '
            f'a phantom backup tree under it')
    if not os.path.ismount(str(mount_point)):
        raise RuntimeError(
            f'{mount_point} exists but is not a mount point -- the external '
            f'drive is detached and this is a leftover stub directory')


def run(out_root: str | None = None) -> dict:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    root = Path(out_root or DEFAULT_OUT)
    assert_backup_root_usable(root)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out_dir = root / stamp

    # Connect BEFORE creating the run directory. The directory used to be made
    # first, so anything that killed the process between mkdir and the first
    # table write left a run that exists and holds nothing -- and because
    # prune_old_runs counts directories rather than contents, that shell then
    # occupied one of the KEEP_RUNS slots and displaced a real backup. Observed
    # with 20260804T091459Z, interrupted inside psycopg2.connect (the Railway
    # proxy can hang there); a second run one second later succeeded, leaving
    # two same-minute entries of which only one had data.
    conn = psycopg2.connect(DB_URL)
    out_dir.mkdir(parents=True, exist_ok=True)
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
    configure_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=None)
    outcome = run(parser.parse_args().out)
    print(json.dumps(outcome, indent=2))
