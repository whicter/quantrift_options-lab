"""Capture the settlement-date marks a multi-expiry ledger row needs to be scored.

A diagonal or calendar cannot be settled from the underlying close alone. On the
near leg's expiry the short leg settles at intrinsic, but the far leg is still
alive and has to be CLOSED at whatever it was worth that day. That price is
observable on exactly ONE date. Miss it and the row is unscoreable forever: the
chain snapshot is pruned at 7 days, and a later quote is a different day's price,
so using one would be look-ahead of precisely the kind the ledger exists to
prevent.

Until 2026-08-13 those rows were filed `not_evaluable/multi_expiry`, which reads
as "this structure can never be scored" when it actually meant "nobody captured
the price". Measured on production the same day: 355 of 538 rows captured since
2026-08-10 were multi-expiry, and the top 20 candidates of the latest batch were
Diagonal Spreads without exception. The ledger is the only instrument that can
say whether the scoring weights work, and 60% of what it tracked -- the
top-ranked 60% -- was being written off before it was ever measured.

This script is phase one: it reads marks out of chain snapshots ALREADY persisted
for that trading day. Coverage is therefore whatever the day's collection
happened to cover; measured against 07-30..08-06 entries, roughly 45% of far legs
are present, because a diagonal's far leg is deliberately deep ITM
(stock-replacement construction) and falls outside the +/-5% strike window the
chain collector keeps. The remaining legs are reported as misses with their
contract identity, which is the work list for phase two (a targeted IB quote of
that explicit contract list -- 4 to 147 contracts per settlement date, versus the
120-240 a single ordinary chain sweep already costs).

A mark is taken ONLY from a two-sided bid/ask. `last` is a transacted price and
the snapshot's own `mark` column can be model-derived; either would make the
ledger score the model against itself. A leg we looked for and could not price is
written with mark NULL, so a miss stays a recorded fact instead of vanishing --
and NULL never reaches the evaluator, which would otherwise settle the leg at
zero and turn every unpriced diagonal into a reported loss.

Backend-only validation data. No product route, no public endpoint.

CLI: python capture_ledger_far_leg_marks.py [--date YYYY-MM-DD] [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
NEW_YORK = ZoneInfo('America/New_York')

# Only quotes carrying a real two-sided market become a mark. Sources that never
# publish NBBO cannot settle a leg no matter how complete their contract list is:
# the Polygon options tier returns structure, greeks, IV and OI with the entire
# last_quote block absent, so its rows have bid IS NULL by construction.
MARK_SOURCES_NOTE = 'two_sided_bid_ask'


def market_date_today() -> date:
    return datetime.now(NEW_YORK).date()


def load_far_legs(conn, settlement_date: date) -> list[dict]:
    """Distinct far-leg contracts of unresolved rows settling on `settlement_date`.

    Settlement is the EARLIEST expiry among a row's legs, derived from legs_json
    rather than read off candidate_ledger.expiry, so the two cannot disagree
    about which leg is the near one. Every leg expiring later is a far leg --
    written generally rather than assuming exactly two legs, since nothing stops
    a future structure from carrying three expiries.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH rows AS (
              SELECT cl.id, cl.symbol, cl.legs_json,
                     (SELECT MIN((l->>'expiry')::date)
                        FROM jsonb_array_elements(cl.legs_json) l) AS settle_on
                FROM candidate_ledger cl
               WHERE cl.outcome IS NULL
                 AND cl.single_expiry = FALSE
            )
            SELECT DISTINCT
                   r.symbol,
                   (l->>'expiry')::date            AS expiry,
                   (l->>'strike')::numeric         AS strike,
                   UPPER(l->>'right')              AS option_right
              FROM rows r, jsonb_array_elements(r.legs_json) l
             WHERE r.settle_on = %s
               AND (l->>'expiry')::date > r.settle_on
             ORDER BY 1, 2, 3, 4
            """,
            (settlement_date,),
        )
        return [
            {'symbol': s, 'expiry': e, 'strike': k, 'option_right': right}
            for s, e, k, right in cur.fetchall()
        ]


def fetch_mark_from_snapshots(conn, leg: dict, settlement_date: date) -> dict | None:
    """Best two-sided quote for one contract among that day's persisted snapshots.

    Restricted to snapshots taken ON the settlement date in New York -- a quote
    from any other session is a different day's price. Ordered latest-first so
    the closing-quality quote wins; the last intraday sweep runs near 15:59 ET
    precisely so a close-quality mark exists without an after-hours pass.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.bid, c.ask, o.source, o.snapshot_ts
              FROM option_chain_snapshots o
              JOIN option_contract_snapshots c ON c.snapshot_id = o.id
             WHERE o.symbol = %s
               AND (o.snapshot_ts AT TIME ZONE 'America/New_York')::date = %s
               AND c.expiry = %s
               AND c.strike = %s
               AND UPPER(c.option_right) = %s
               AND c.bid IS NOT NULL AND c.ask IS NOT NULL
               AND c.bid > 0 AND c.ask >= c.bid
             ORDER BY o.snapshot_ts DESC
             LIMIT 1
            """,
            (leg['symbol'], settlement_date, leg['expiry'], leg['strike'], leg['option_right']),
        )
        row = cur.fetchone()
    if not row:
        return None
    bid, ask, source, _ts = row
    return {'bid': bid, 'ask': ask, 'mark': (bid + ask) / 2, 'source': source}


def persist(conn, settlement_date: date, records: list[tuple]) -> int:
    if not records:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO ledger_far_leg_marks
              (settlement_date, symbol, expiry, strike, option_right, bid, ask, mark, source)
            VALUES %s
            ON CONFLICT (settlement_date, symbol, expiry, strike, option_right) DO UPDATE
              SET bid = EXCLUDED.bid, ask = EXCLUDED.ask, mark = EXCLUDED.mark,
                  source = EXCLUDED.source, observed_at = NOW()
             WHERE ledger_far_leg_marks.mark IS NULL
            """,
            records,
        )
        written = cur.rowcount
    conn.commit()
    return written


def run(settlement_date: date | None = None, dry_run: bool = False) -> dict:
    settlement_date = settlement_date or market_date_today()
    if not DB_URL:
        log.error('DATABASE_URL not set; cannot capture far-leg marks')
        return {'status': 'no_database'}

    conn = psycopg2.connect(DB_URL)
    try:
        legs = load_far_legs(conn, settlement_date)
        if not legs:
            log.info('settlement_date=%s no unresolved multi-expiry rows settle today', settlement_date)
            return {'status': 'empty', 'settlement_date': settlement_date.isoformat(), 'legs': 0}

        records: list[tuple] = []
        misses: list[dict] = []
        for leg in legs:
            quote = fetch_mark_from_snapshots(conn, leg, settlement_date)
            if quote:
                records.append((
                    settlement_date, leg['symbol'], leg['expiry'], leg['strike'], leg['option_right'],
                    quote['bid'], quote['ask'], quote['mark'], quote['source'],
                ))
            else:
                misses.append(leg)
                # Recorded as a looked-for-and-absent fact. Without the row a
                # miss is indistinguishable from a leg nobody ever tried to
                # price, and coverage becomes unmeasurable.
                records.append((
                    settlement_date, leg['symbol'], leg['expiry'], leg['strike'], leg['option_right'],
                    None, None, None, 'missing',
                ))

        written = 0 if dry_run else persist(conn, settlement_date, records)
        priced = len(legs) - len(misses)
        log.info(
            'settlement_date=%s far_legs=%d priced=%d missing=%d written=%d%s',
            settlement_date, len(legs), priced, len(misses), written,
            ' (dry-run)' if dry_run else '',
        )
        if misses:
            # Named, never a bare count: this list is the phase-two IB work list,
            # and a miss cannot be recovered on any later date.
            log.warning(
                'unpriced far legs (permanently unrecoverable after today): %s',
                ', '.join(
                    f"{m['symbol']} {m['expiry']} {m['strike']}{m['option_right']}" for m in misses[:50]
                ),
            )
        return {
            'status': 'ok',
            'settlement_date': settlement_date.isoformat(),
            'legs': len(legs),
            'priced': priced,
            'missing': len(misses),
            'written': written,
        }
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', help='settlement date (YYYY-MM-DD); defaults to today in New York')
    parser.add_argument('--dry-run', action='store_true', help='resolve and report without writing')
    args = parser.parse_args()
    target = date.fromisoformat(args.date) if args.date else None
    run(settlement_date=target, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
