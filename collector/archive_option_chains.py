"""Durable, per-session archive of the raw option chain before the prune takes it.

`option_chain_snapshots` and its `option_contract_snapshots` children are deleted
after `OPTION_CHAIN_RETENTION_DAYS` (7). That retention is correct for serving --
products read only the latest row -- and fatal for research, because the
contract-level chain is the INPUT every derived product is computed from. Once a
session's chain is gone, no amount of money buys it back:

  * Polygon sells no historical NBBO on our tier at all, and the quote-bearing
    rows came from an IB live subscription that only ever existed in the moment.
  * Greeks, IV and open interest are as-of-the-snapshot values; a later fetch
    answers a different question.

`gex_history` / `gex_strike_history` were carved out of the same prune for
exactly this reason, but they saved the scalars and the per-strike GEX, not the
chain they were computed from. So a model change -- a different GEX formulation,
an IV-surface study, re-scoring candidate selection -- can only ever be tested
against data collected after the change. This closes that.

Shape differs deliberately from `backup_facts.py`. That dumps whole tables daily
and keeps the last N runs, which suits slowly-growing durable tables. Here the
source is a 7-day sliding window, so the archive is **partitioned by market date
and append-only**: a session is written once and never rewritten, and a run
backfills every session still inside the window. A missed run therefore heals
itself for up to 7 days; past that the session is gone for good, which is why
the summary names the sessions it could no longer reach.

Only sessions STRICTLY BEFORE today (New York) are archived. Today is still
accumulating, and writing it once then skipping it forever would freeze a
partial session into the archive permanently.

CLI: python archive_option_chains.py [--out DIR] [--dry-run] [--days N]
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
from collector_runtime import configure_logging, load_collector_env, exit_if_already_running

load_collector_env(__file__)

log = logging.getLogger(__name__)

MARKET_TIMEZONE = ZoneInfo('America/New_York')
DB_URL = os.getenv('DATABASE_URL')
# Defaults beside the existing fact backups on the external volume.
DEFAULT_OUT = os.getenv(
    'CHAIN_ARCHIVE_DIR',
    str(Path(os.getenv('FACT_BACKUP_DIR', str(Path.home() / 'quantrift-backups'))).parent
        / 'chain-archive'),
)
# How far back a run will look for sessions it has not archived yet. Slightly
# wider than the prune window so a gap is visible in the summary before it
# becomes unrecoverable, rather than silently scrolling out of view.
LOOKBACK_DAYS = max(int(os.getenv('CHAIN_ARCHIVE_LOOKBACK_DAYS', '10')), 1)

TABLES = {
    'chains': """
        COPY (
          SELECT * FROM option_chain_snapshots
          WHERE (snapshot_ts AT TIME ZONE 'America/New_York')::date = '{d}'
          ORDER BY id
        ) TO STDOUT WITH CSV HEADER
    """,
    'contracts': """
        COPY (
          SELECT c.* FROM option_contract_snapshots c
          JOIN option_chain_snapshots o ON o.id = c.snapshot_id
          WHERE (o.snapshot_ts AT TIME ZONE 'America/New_York')::date = '{d}'
          ORDER BY c.snapshot_id, c.id
        ) TO STDOUT WITH CSV HEADER
    """,
}


def ensure_writable_root(root: Path) -> Path:
    """Refuse to create an archive path on an unmounted external volume.

    macOS happily creates `/Volumes/X9_Pro/...` on the BOOT disk when the drive
    is absent, and the real volume then mounts over the top and hides it. The
    archive would look like it was working while writing to a directory nobody
    will ever read, and the sessions it believed it had captured would be gone
    from the database by the time anyone noticed. This is a documented hazard on
    this machine (`docs/ARCHITECTURE.md` §49), so the check is a hard failure,
    not a warning.
    """
    parts = root.resolve().parts
    if len(parts) > 2 and parts[1] == 'Volumes':
        volume = Path(parts[0]) / parts[1] / parts[2]
        if not volume.is_mount():
            raise RuntimeError(
                f'{volume} is not mounted; refusing to create {root} on the boot disk. '
                'Mount the volume and re-run -- the archive is not optional data.'
            )
    root.mkdir(parents=True, exist_ok=True)
    return root


def session_dir(root: Path, day: date) -> Path:
    return root / f'{day.year:04d}' / day.isoformat()


def archived_sessions(root: Path) -> set[date]:
    """Sessions already captured, judged by a complete manifest.

    A directory without `manifest.json` is a run that died partway; it is
    re-archived rather than trusted, because a truncated capture that looks
    finished is worse than an obvious gap.
    """
    done: set[date] = set()
    if not root.exists():
        return done
    for year_dir in root.iterdir():
        if not year_dir.is_dir():
            continue
        for day_dir in year_dir.iterdir():
            if not day_dir.is_dir() or not (day_dir / 'manifest.json').is_file():
                continue
            try:
                done.add(date.fromisoformat(day_dir.name))
            except ValueError:
                continue
    return done


def sessions_present(conn, since: date, before: date) -> dict[date, dict]:
    """Market dates still in the database, with the bounds that reveal truncation."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT (snapshot_ts AT TIME ZONE 'America/New_York')::date AS market_date,
                   COUNT(*)::int,
                   MIN(snapshot_ts), MAX(snapshot_ts)
            FROM option_chain_snapshots
            WHERE (snapshot_ts AT TIME ZONE 'America/New_York')::date >= %s
              AND (snapshot_ts AT TIME ZONE 'America/New_York')::date < %s
            GROUP BY 1 ORDER BY 1
            """,
            (since, before),
        )
        return {
            row[0]: {'chains': row[1], 'first': row[2], 'last': row[3]}
            for row in cur.fetchall()
        }


def write_table(conn, sql: str, target: Path) -> dict:
    """COPY one table slice to gzipped CSV, then verify by reading it back.

    Counting rows from the buffer would only prove what we meant to write. The
    file is re-read so a truncated or unreadable capture fails here, while the
    source rows still exist, rather than at restore time when they do not.
    """
    buffer = io.StringIO()
    with conn.cursor() as cur:
        cur.copy_expert(sql, buffer)
    payload = buffer.getvalue()
    with gzip.open(target, 'wt', encoding='utf-8') as handle:
        handle.write(payload)

    digest = hashlib.sha256()
    verified = 0
    with gzip.open(target, 'rt', encoding='utf-8') as handle:
        for i, line in enumerate(handle):
            digest.update(line.encode('utf-8'))
            if i:
                verified += 1
    expected = max(payload.count('\n') - 1, 0)
    if verified != expected:
        raise RuntimeError(f'{target.name}: wrote {expected} rows, read back {verified}')
    return {'rows': verified, 'bytes': target.stat().st_size, 'sha256': digest.hexdigest()}


def archive_session(conn, root: Path, day: date, meta: dict, dry_run: bool) -> dict:
    out_dir = session_dir(root, day)
    if dry_run:
        return {'market_date': day.isoformat(), 'skipped': 'dry-run', **meta}

    out_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, template in TABLES.items():
        files[name] = write_table(conn, template.format(d=day.isoformat()),
                                  out_dir / f'{name}.csv.gz')

    manifest = {
        'market_date': day.isoformat(),
        'archived_at': datetime.now(tz=MARKET_TIMEZONE).isoformat(),
        'chain_snapshots_in_db': meta['chains'],
        'first_snapshot_ts': meta['first'].isoformat(),
        'last_snapshot_ts': meta['last'].isoformat(),
        'files': files,
        # The source is a sliding window, so a session captured near its edge may
        # already have lost its early hours. Both facts are recorded rather than
        # inferred later: a weekend legitimately holds a handful of on-demand
        # snapshots, while a weekday holding a handful was clipped by the prune,
        # and the row count alone cannot tell those apart.
        'is_trading_weekday': day.weekday() < 5,
        'possibly_truncated': (
            day.weekday() < 5
            and meta['chains'] < int(os.getenv('CHAIN_ARCHIVE_FULL_SESSION_MIN', '400'))
        ),
    }
    # Written last: its presence is what marks the session done.
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def run(out_dir: str | None = None, dry_run: bool = False, days: int | None = None) -> dict:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    root = ensure_writable_root(Path(out_dir or DEFAULT_OUT))
    lookback = days or LOOKBACK_DAYS
    today = datetime.now(tz=MARKET_TIMEZONE).date()
    since = today - timedelta(days=lookback)

    conn = psycopg2.connect(DB_URL)
    try:
        present = sessions_present(conn, since, today)
        done = archived_sessions(root)
        pending = [d for d in sorted(present) if d not in done]

        log.info(
            'chain archive: %d session(s) in the last %d days, %d already archived, %d to write',
            len(present), lookback, len(present) - len(pending), len(pending),
        )
        results = []
        for day in pending:
            meta = present[day]
            try:
                manifest = archive_session(conn, root, day, meta, dry_run)
                results.append(manifest)
                log.info(
                    'archived %s: %d chains, %s contract rows, %.1f MB%s',
                    day, meta['chains'],
                    manifest.get('files', {}).get('contracts', {}).get('rows', '?'),
                    sum(f['bytes'] for f in manifest.get('files', {}).values()) / 1e6
                    if not dry_run else 0.0,
                    ' (DRY RUN)' if dry_run else '',
                )
            except Exception as exc:  # noqa: BLE001 - one bad session must not lose the rest
                conn.rollback()
                log.error('archive %s failed: %s', day, exc)
                results.append({'market_date': day.isoformat(), 'error': str(exc)})

        # A session that has left the retention window unarchived is gone. Say so
        # once, loudly, instead of letting it disappear from the listing.
        unreachable = [
            d for d in (since + timedelta(days=i) for i in range(lookback))
            if d.weekday() < 5 and d not in present and d not in done and d < today
        ]
        if unreachable:
            log.warning(
                'chain archive: %d weekday session(s) are no longer in the database and were '
                'never archived -- permanently lost: %s',
                len(unreachable), ', '.join(d.isoformat() for d in unreachable),
            )
        return {'archived': results, 'unreachable': [d.isoformat() for d in unreachable]}
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default=None, help='archive root directory')
    parser.add_argument('--dry-run', action='store_true', help='report without writing')
    parser.add_argument('--days', type=int, default=None, help='lookback window in days')
    args = parser.parse_args()
    configure_logging()
    summary = run(out_dir=args.out, dry_run=args.dry_run, days=args.days)
    log.info('chain archive summary: %s', json.dumps(summary, default=str))


if __name__ == '__main__':
    _lock = exit_if_already_running('chain-archive')
    main()
