"""Daily capture of shortable-share availability.

The value is in the trend, not the level: a name whose lendable pool halves in
a week is tightening whether or not we can see the fee. IB gives availability
free over the gateway already running; the fee itself is behind Ortex/S3 or the
IBKR file server, which this network blocks. So capture the free half daily and
let the series accumulate -- a snapshot taken the day someone asks the question
is worth very little.

Not exposed to the product. IB data is `ib_internal`, an internal/transitional
source under the project's own disclosure rules, so this stays behind the same
line as the quote lane until that is revisited.

CLI: python collect_borrow_availability.py [--limit N] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import date
from typing import Any

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector
from providers.ib_borrow_provider import IbBorrowProvider

configure_collector(__file__)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
# Ordered by option activity so the names the squeeze view actually surfaces are
# covered first; a truncated run then loses the least relevant tail.
DEFAULT_LIMIT = int(os.getenv('BORROW_SYMBOL_LIMIT', '400'))


def load_symbols(conn, limit: int = DEFAULT_LIMIT) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.symbol
            FROM symbol_universe u
            LEFT JOIN (
              SELECT symbol, MAX(call_oi_above) AS oi
              FROM squeeze_watch
              WHERE market_date >= CURRENT_DATE - 7
              GROUP BY symbol
            ) s ON s.symbol = u.symbol
            WHERE u.active AND u.scan_enabled AND u.asset_type = 'stock'
            ORDER BY s.oi DESC NULLS LAST, u.symbol
            LIMIT %s
            """,
            (limit,),
        )
        return [row[0] for row in cur.fetchall()]


def persist(conn, market_date: date, rows: list[Any]) -> int:
    payload = [
        (r.symbol, market_date, r.shortable_shares, r.shortable_level, r.status, 'ib_internal')
        for r in rows
    ]
    if not payload:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO borrow_availability_history
              (symbol, market_date, shortable_shares, shortable_level, status, source)
            VALUES %s
            ON CONFLICT (symbol, market_date) DO UPDATE SET
              shortable_shares = EXCLUDED.shortable_shares,
              shortable_level = EXCLUDED.shortable_level,
              status = EXCLUDED.status,
              source = EXCLUDED.source
            """,
            payload,
            page_size=len(payload),
        )
        written = cur.rowcount
    conn.commit()
    return written


def run(limit: int = DEFAULT_LIMIT, dry_run: bool = False) -> dict[str, Any]:
    if not DB_URL:
        raise RuntimeError('DATABASE_URL is required')
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT (NOW() AT TIME ZONE 'America/New_York')::date")
            market_date = cur.fetchone()[0]
        symbols = load_symbols(conn, limit)
        if not symbols:
            return {'market_date': str(market_date), 'symbols': 0, 'written': 0}

        rows = IbBorrowProvider().fetch(symbols)
        counts: dict[str, int] = {}
        for row in rows:
            counts[row.status] = counts.get(row.status, 0) + 1

        written = 0 if dry_run else persist(conn, market_date, rows)
    finally:
        conn.close()

    result = {
        'market_date': str(market_date),
        'symbols': len(symbols),
        'written': written,
        'by_status': counts,
        'dry_run': dry_run,
    }
    log.info('borrow availability: %s', result)
    # A run where nothing came back is a gateway problem wearing the costume of
    # a quiet day; say so rather than reporting a clean zero.
    if counts.get('ok', 0) == 0 and len(symbols):
        log.warning('no symbol returned shortable data -- check the IB gateway session')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Capture IB shortable-share availability')
    parser.add_argument('--limit', type=int, default=DEFAULT_LIMIT)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.limit, args.dry_run), indent=2))
