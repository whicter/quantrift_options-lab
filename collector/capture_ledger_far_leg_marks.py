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

Two passes, cheapest first:

1. Read marks out of chain snapshots ALREADY persisted for that trading day.
   Zero provider calls. Measured 2026-08-14: 41 of 48 far legs.
2. Quote whatever is left directly from IB, by explicit contract identity. The
   gap exists because a diagonal's far leg is deliberately deep ITM
   (stock-replacement construction) and falls outside the +/-5% strike window
   the chain collector keeps; all 7 misses that day were far ITM. Widening that
   window is NOT the alternative -- it bounds `option_contract_snapshots` and
   `option_oi_delta_snapshots`, two thirds of the database, and the 2026-07-30
   volume-full outage came from exactly that. A settlement date needs 4 to 147
   contracts, against the 120-240 one ordinary chain sweep already costs.

Pass 2 is skipped outside the regular session: with no quote stream IB does not
fail fast, it burns IB_OPTION_STREAM_TIMEOUT per contract and returns nothing.

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
from run_refresh_worker import is_regular_us_session

configure_collector(__file__)
log = logging.getLogger(__name__)

# IB client id. 42 is the option chain, 12 price, 55 news, 44 borrow, and 96
# belongs to the other project sharing this gateway -- a collision makes the
# gateway drop one of the two connections.
IB_CLIENT_ID = int(os.getenv('LEDGER_MARKS_IB_CLIENT_ID', '46'))

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


def quote_from_ib(legs: list[dict]) -> dict[tuple, dict]:
    """Pass 2: quote the legs the day's snapshots did not cover, from IB directly.

    Grouped by symbol so each one costs a single gateway connection. Failures are
    isolated per symbol: IB refusing one name must not cost the marks of the
    others, since every one of them is a one-shot observation.

    Only a two-sided market becomes a mark, exactly as in pass 1. IB's own
    quality caveat applies -- thin contracts have been measured at 111% spread --
    but a wide real market is still the best observation available for closing
    that leg, and the stored bid/ask lets any later analysis filter on it.
    """
    from providers.ib_option_chain_provider import IbOptionChainProvider

    by_symbol: dict[str, list[dict]] = {}
    for leg in legs:
        by_symbol.setdefault(leg['symbol'], []).append(leg)

    quotes: dict[tuple, dict] = {}
    for symbol, symbol_legs in sorted(by_symbol.items()):
        specs = [(l['expiry'], float(l['strike']), l['option_right']) for l in symbol_legs]
        try:
            provider = IbOptionChainProvider(client_id=IB_CLIENT_ID)
            snapshots = provider.fetch_named_contracts(symbol, specs)
        except Exception as exc:  # noqa: BLE001 -- one symbol must not sink the rest
            log.warning('%s: IB far-leg quote failed: %s', symbol, exc)
            continue
        for snap in snapshots:
            bid, ask = snap.bid, snap.ask
            if bid is None or ask is None or bid <= 0 or ask < bid:
                continue
            quotes[(symbol, snap.expiry, float(snap.strike), snap.right)] = {
                'bid': bid, 'ask': ask, 'mark': (bid + ask) / 2, 'source': 'ib_internal',
            }
    return quotes


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

        # Pass 1: whatever the day's own snapshots already hold, for free.
        from_snapshots: dict[int, dict] = {}
        gap: list[dict] = []
        for index, leg in enumerate(legs):
            quote = fetch_mark_from_snapshots(conn, leg, settlement_date)
            if quote:
                from_snapshots[index] = quote
            else:
                gap.append(leg)

        # Pass 2: the remainder, quoted from IB by explicit contract identity.
        # Only inside the session, and only when today is genuinely the
        # settlement date -- backfilling a past date would quote a different
        # day's market and pass it off as that day's close, which is the
        # look-ahead this whole table exists to prevent.
        ib_quotes: dict[tuple, dict] = {}
        if gap and not dry_run and settlement_date == market_date_today() and is_regular_us_session():
            log.info('pass 2: quoting %d far leg(s) directly from IB', len(gap))
            ib_quotes = quote_from_ib(gap)
        elif gap:
            log.info(
                'pass 2 skipped for %d far leg(s) (dry_run=%s, is_today=%s, session_open=%s)',
                len(gap), dry_run, settlement_date == market_date_today(), is_regular_us_session(),
            )

        records: list[tuple] = []
        misses: list[dict] = []
        for index, leg in enumerate(legs):
            quote = from_snapshots.get(index) or ib_quotes.get(
                (leg['symbol'], leg['expiry'], float(leg['strike']), leg['option_right'])
            )
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
            'settlement_date=%s far_legs=%d priced=%d (snapshots=%d ib=%d) missing=%d written=%d%s',
            settlement_date, len(legs), priced, len(from_snapshots), len(ib_quotes), len(misses), written,
            ' (dry-run)' if dry_run else '',
        )
        if misses:
            # Named, never a bare count, and never truncated silently: a miss
            # cannot be recovered on any later date, so the operator needs the
            # contract identity rather than a number.
            shown = [f"{m['symbol']} {m['expiry']} {m['strike']}{m['option_right']}" for m in misses[:50]]
            suffix = f' (+{len(misses) - 50} more)' if len(misses) > 50 else ''
            log.warning(
                'unpriced far legs (permanently unrecoverable after today): %s%s',
                ', '.join(shown), suffix,
            )
        return {
            'status': 'ok',
            'settlement_date': settlement_date.isoformat(),
            'legs': len(legs),
            'priced': priced,
            'from_snapshots': len(from_snapshots),
            'from_ib': len(ib_quotes),
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
