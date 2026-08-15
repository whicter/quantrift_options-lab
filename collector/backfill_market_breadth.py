"""Backfill market_breadth_daily over the provider's available history.

`collect_market_breadth.py` writes one session per run and is scheduled for the
current one. The Rebound Monitor's Phase 1 exit gate needs historical event
validation -- returns and MA20-retention over the 5/10/20 sessions following a
trigger, walk-forward split, with the base rate disclosed -- and that is not
possible against the 11 sessions collected since 2026-07-30. This fills the gap.

Bounded by what the plan actually serves, not by ambition: grouped daily is a
rolling two-year window (measured 2026-08-15: 2024-08-16 returns 200,
2024-02-16 and everything older returns 403). Asking for more just collects
403s.

Resumable by construction. Each session is an independent
`collect_market_breadth.run(target_date=...)`, days already present are skipped,
and the writer is idempotent on market_date -- so an interrupted run is restarted
by invoking this again with the same arguments. That matters at ~2 minutes per
session: the whole range is a multi-hour job and will meet a laptop sleep, a
dropped connection or a rate-limit penalty somewhere in the middle.

Pacing is deliberately left at the provider default. The `breadth` pacing scope
is our own bookkeeping; Polygon meters the account, so a backfill that outruns
the shared limiter earns 429s for the option/GEX lane as well. A slow backfill
is a cost; a throttled production refresh is an outage.
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import date, datetime, timedelta
from typing import Any

import psycopg2

import collect_market_breadth as breadth
from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

# Measured 2026-08-15 against the current Options plan. Re-probe before widening:
# the window rolls forward, so the true floor moves with the calendar.
DEFAULT_START = os.getenv('BREADTH_BACKFILL_START', '2024-08-16')


def existing_dates(conn) -> set[date]:
    with conn.cursor() as cur:
        cur.execute('SELECT market_date FROM market_breadth_daily')
        return {row[0] for row in cur.fetchall()}


def weekday_range(start: date, end: date) -> list[date]:
    """Weekdays in [start, end], newest first.

    Holidays are not modelled. A closed session simply has no grouped-daily
    response, and the collector's own walk-back reports that and moves on --
    encoding a holiday calendar here would be a second source of truth for
    something the provider already answers.

    Newest first so the most useful history lands earliest: if the run is cut
    short, what survives is the stretch adjacent to the data we already have,
    which is contiguous and immediately usable rather than a floating island.
    """
    days = []
    cursor = end
    while cursor >= start:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    return days


def run(
    start: date,
    end: date,
    *,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    conn = psycopg2.connect(database_url)
    try:
        have = existing_dates(conn)
    finally:
        conn.close()

    candidates = [d for d in weekday_range(start, end) if d not in have]
    if limit:
        candidates = candidates[:limit]

    if dry_run:
        log.info(
            'would backfill %s session(s) from %s to %s (%s already present)',
            len(candidates), start, end, len(have),
        )
        return {'status': 'dry_run', 'pending': len(candidates), 'have': len(have)}

    written = skipped = failed = 0
    started = time.time()
    for index, day in enumerate(candidates, start=1):
        try:
            result = breadth.run(target_date=day)
            status = result.get('status')
            # The collector walks back to the newest session at or before the
            # requested date, so a holiday resolves to the prior trading day and
            # returns a market_date we did not ask for. That is a correct write,
            # just not the one requested -- count it as skipped so the tally
            # reflects sessions actually added for the dates we walked.
            if result.get('market_date') != day.isoformat():
                skipped += 1
            elif status == 'written':
                written += 1
            else:
                skipped += 1
        except Exception as exc:  # noqa: BLE001 - one bad session must not end the run
            failed += 1
            log.warning('backfill %s failed: %s', day, exc)

        if index % 10 == 0 or index == len(candidates):
            elapsed = time.time() - started
            rate = elapsed / index
            remaining = (len(candidates) - index) * rate
            log.info(
                'backfill %s/%s (written=%s skipped=%s failed=%s) '
                '%.1f min elapsed, ~%.1f min remaining',
                index, len(candidates), written, skipped, failed,
                elapsed / 60, remaining / 60,
            )

    result = {
        'status': 'ok',
        'requested': len(candidates),
        'written': written,
        'skipped': skipped,
        'failed': failed,
        'minutes': round((time.time() - started) / 60, 1),
    }
    log.info('Breadth backfill complete: %s', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Backfill market_breadth_daily')
    parser.add_argument('--start', default=DEFAULT_START)
    # Default to today rather than "the day before the earliest row". The range
    # is filtered against what is already stored, so asking for the whole window
    # fills every hole in it -- including any left by an earlier partial run.
    # Anchoring on the earliest row instead would silently stop at the first
    # isolated session anyone happened to write ahead of the block.
    parser.add_argument('--end', default=None, help='default: today')
    parser.add_argument('--limit', type=int, default=None, help='cap sessions this invocation')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    start = datetime.strptime(args.start, '%Y-%m-%d').date()
    end = datetime.strptime(args.end, '%Y-%m-%d').date() if args.end else date.today()

    print(run(start, end, limit=args.limit, dry_run=args.dry_run))
