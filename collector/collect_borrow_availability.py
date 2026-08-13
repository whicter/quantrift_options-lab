"""Daily capture of shortable-share availability.

The value is in the trend, not the level: a name whose lendable pool halves in
a week is tightening. Two free sources, combined here:

  * IB gateway (generic tick 236) -- shortable shares and availability level,
    per symbol, live.
  * IBKR's public securities-lending file -- the borrow FEE, which the API
    never sends and which Ortex/S3 charge four figures a year for. Reached on
    ftp2.interactivebrokers.com; ftp3, which every reference names, no longer
    accepts connections and times out in a way that reads like a firewall.

A snapshot taken the day someone asks the question is worth very little, which
is why this runs daily rather than on demand.

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
from providers import ib_borrow_fee_provider

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


def merge_fee_rates(rows: list[Any]) -> dict[str, Any]:
    """Overlay IBKR's published fee file onto the API's availability readings.

    Two sources for overlapping facts, kept deliberately: the API answers per
    symbol in real time, the file carries the fee the API never sends. Where
    both give share counts they corroborate each other -- measured 2026-08-13,
    SLS 24,871 (API) against 20,000 (file), BSP 2,970 against 2,000 -- so a
    wide disagreement is a parsing warning, not a number to average.

    Best effort: the availability capture is the job, and the fee overlay must
    not be able to take it down.
    """
    try:
        fees, as_of = ib_borrow_fee_provider.fetch()
    except Exception as exc:  # noqa: BLE001
        log.warning('IBKR fee file unavailable (%s); availability captured without it', exc)
        return {'fee_rows': 0, 'fee_as_of': None, 'matched': 0}
    by_symbol = {f.symbol: f for f in fees}
    matched = 0
    for row in rows:
        fee = by_symbol.get(row.symbol)
        if fee is None:
            continue
        row.fee_rate = fee.fee_rate
        row.rebate_rate = fee.rebate_rate
        if fee.available_shares is not None:
            row.file_available_shares = fee.available_shares
        matched += 1
    return {'fee_rows': len(fees), 'fee_as_of': as_of.isoformat() if as_of else None,
            'matched': matched}


def persist(conn, market_date: date, rows: list[Any]) -> int:
    payload = [
        (r.symbol, market_date, r.shortable_shares, r.shortable_level, r.status,
         getattr(r, 'fee_rate', None), getattr(r, 'rebate_rate', None),
         getattr(r, 'file_available_shares', None), 'ib_internal')
        for r in rows
    ]
    if not payload:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO borrow_availability_history
              (symbol, market_date, shortable_shares, shortable_level, status,
               fee_rate, rebate_rate, file_available_shares, source)
            VALUES %s
            ON CONFLICT (symbol, market_date) DO UPDATE SET
              shortable_shares = EXCLUDED.shortable_shares,
              shortable_level = EXCLUDED.shortable_level,
              status = EXCLUDED.status,
              fee_rate = COALESCE(EXCLUDED.fee_rate, borrow_availability_history.fee_rate),
              rebate_rate = COALESCE(EXCLUDED.rebate_rate, borrow_availability_history.rebate_rate),
              file_available_shares = COALESCE(EXCLUDED.file_available_shares,
                                               borrow_availability_history.file_available_shares),
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
        fee_info = merge_fee_rates(rows)
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
        'fee_matched': fee_info['matched'],
        'fee_file_as_of': fee_info['fee_as_of'],
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
