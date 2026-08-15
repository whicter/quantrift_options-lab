"""Integrity check for the market_breadth_daily series.

Written for the 2026-08 backfill but not specific to it: any consumer that reads
more than one row -- the Rebound Monitor's historical event validation, a
cumulative A/D display -- depends on properties no single-row write can
establish. This checks them.

The failure this guards against is not a missing row, which is obvious. It is a
series that *looks* continuous while `previous_market_date` points somewhere
other than the preceding stored session, so a cumulative sum silently
double-counts or skips a day. Breadth is a differenced quantity; a broken chain
does not announce itself in any single row.

Exit status is 0 only when every check passes, so this can gate a backfill or run
from cron.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import date, timedelta
from typing import Any

import psycopg2

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

MIN_COUNT = int(os.getenv('MARKET_BREADTH_MIN_COUNT', '2000'))
MIN_COVERAGE_PCT = float(os.getenv('MARKET_BREADTH_MIN_COVERAGE_PCT', '90'))

ROW_SQL = """
    SELECT market_date, previous_market_date, counted, coverage_pct,
           advances, declines, unchanged
    FROM market_breadth_daily
    ORDER BY market_date
"""


def business_days(start: date, end: date) -> list[date]:
    """Weekdays in [start, end]. Holidays are not modelled -- see check_gaps."""
    out, cursor = [], start
    while cursor <= end:
        if cursor.weekday() < 5:
            out.append(cursor)
        cursor += timedelta(days=1)
    return out


def check_chain(rows: list[tuple]) -> list[str]:
    """Every row's previous_market_date must be the preceding stored session.

    This is the check that matters. A cumulative A/D line is a running sum of
    differences against each row's stated previous close; if that pointer skips a
    stored session or repeats one, the sum drifts and nothing about the
    individual rows looks wrong.
    """
    problems = []
    for index in range(1, len(rows)):
        stated = rows[index][1]
        actual = rows[index - 1][0]
        if stated != actual:
            problems.append(
                f'{rows[index][0]}: previous_market_date={stated} '
                f'but the preceding stored session is {actual}'
            )
    return problems


def check_quality(rows: list[tuple]) -> list[str]:
    problems = []
    for market_date, _, counted, coverage, *_ in rows:
        if counted is None or counted < MIN_COUNT:
            problems.append(f'{market_date}: counted={counted} below {MIN_COUNT}')
        if coverage is None or float(coverage) < MIN_COVERAGE_PCT:
            problems.append(f'{market_date}: coverage={coverage} below {MIN_COVERAGE_PCT}')
    return problems


def check_arithmetic(rows: list[tuple]) -> list[str]:
    """advances + declines + unchanged must equal counted.

    Cheap, and it catches a partially-written row that passed the quality gate on
    `counted` alone.
    """
    problems = []
    for market_date, _, counted, _, adv, dec, unch in rows:
        parts = sum(v or 0 for v in (adv, dec, unch))
        if counted is not None and parts != counted:
            problems.append(f'{market_date}: {adv}+{dec}+{unch}={parts} != counted {counted}')
    return problems


def check_gaps(rows: list[tuple]) -> tuple[list[date], list[str]]:
    """Weekdays inside the stored range with no row.

    Reported, never failed. US market holidays are weekdays with no session, and
    this module deliberately does not carry a holiday calendar -- that would be a
    second source of truth for something the provider already answers by not
    returning data. Roughly 9-10 per year is normal; a cluster is not.
    """
    stored = {r[0] for r in rows}
    missing = [d for d in business_days(rows[0][0], rows[-1][0]) if d not in stored]
    notes = []
    if missing:
        by_year: dict[int, int] = {}
        for d in missing:
            by_year[d.year] = by_year.get(d.year, 0) + 1
        notes.append('missing weekdays by year: ' + ', '.join(
            f'{year}={count}' for year, count in sorted(by_year.items())))
    return missing, notes


def run() -> dict[str, Any]:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(ROW_SQL)
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return {'status': 'empty', 'sessions': 0}

    chain = check_chain(rows)
    quality = check_quality(rows)
    arithmetic = check_arithmetic(rows)
    missing, gap_notes = check_gaps(rows)

    coverages = [float(r[3]) for r in rows if r[3] is not None]
    counts = [r[2] for r in rows if r[2] is not None]

    result = {
        'status': 'ok' if not (chain or quality or arithmetic) else 'failed',
        'sessions': len(rows),
        'range': [rows[0][0].isoformat(), rows[-1][0].isoformat()],
        'coverage_min': round(min(coverages), 1) if coverages else None,
        'coverage_median': round(sorted(coverages)[len(coverages) // 2], 1) if coverages else None,
        'counted_min': min(counts) if counts else None,
        'chain_breaks': chain,
        'quality_failures': quality,
        'arithmetic_failures': arithmetic,
        'missing_weekdays': len(missing),
        'gap_notes': gap_notes,
    }
    level = log.info if result['status'] == 'ok' else log.error
    level('Breadth series verification: %s', {
        k: v for k, v in result.items()
        if k not in ('chain_breaks', 'quality_failures', 'arithmetic_failures')
    })
    for label, items in (('chain', chain), ('quality', quality), ('arithmetic', arithmetic)):
        for item in items[:20]:
            log.error('  %s: %s', label, item)
        if len(items) > 20:
            log.error('  %s: ... and %s more', label, len(items) - 20)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Verify the market_breadth_daily series')
    parser.add_argument('--json', action='store_true', help='emit the result as JSON')
    args = parser.parse_args()
    outcome = run()
    print(json.dumps(outcome, indent=2) if args.json else outcome)
    sys.exit(0 if outcome.get('status') == 'ok' else 1)
