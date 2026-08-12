"""Capture the observable option-positioning state that a squeeze screen reads.

Writes one row per symbol per market date and makes NO judgement. Every
threshold anyone would apply today ("call/put above 2", "volume/OI above 0.2")
is an unbacked guess, and the only way to replace guesses with calibration is
to already hold samples when the question is asked. So this captures broadly
and scores later, exactly as candidate_ledger does for scanner candidates.

Two design points worth not undoing:

* It reads `option_chain_snapshots.oi_by_strike`, not `gex_strike_history`.
  The GEX chain is capped at OPTION_MAX_STRIKES_PER_SIDE=6 (~±5% on AAPL),
  which excludes the out-of-the-money call region a squeeze actually runs
  through. The oi_by_strike map is a separate OI-only fetch whose width adapts
  to the symbol's implied move -- measured 2026-08-11 at 45.8 strikes on
  average, ±17% on AAPL and ±35% on PLTR. Both live on a table pruned after
  7 days, which is why this capture has to exist at all.

* It does not gate on `gamma_regime`. compute_gex assigns call OI a positive
  dealer sign, i.e. it assumes dealers are LONG calls; the retail-call-buying
  setup this screen looks for is the opposite, so that sign may be inverted
  here. The regime is recorded as context and never used as a filter.

CLI: python capture_squeeze_watch.py [--date YYYY-MM-DD] [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import date
from typing import Any

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
MODEL_VERSION = 'squeeze-v1-observable-chain-state'
# How far above spot counts as "the runway". Wide enough to hold the OTM call
# region, narrow enough that far-tail strikes with stale OI do not dominate.
UPSIDE_WINDOW_PCT = float(os.getenv('SQUEEZE_UPSIDE_WINDOW_PCT', '10'))
# A floor, not a screen: below this there is no chain to describe.
MIN_CALL_OI_ABOVE = int(os.getenv('SQUEEZE_MIN_CALL_OI_ABOVE', '100'))


def latest_positioning(conn, market_date: date) -> list[dict[str, Any]]:
    """Latest snapshot per symbol for the date, with its wide OI map and GEX context."""
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (s.symbol)
                     s.symbol, s.snapshot_ts, s.underlying_price AS spot,
                     s.oi_by_strike
              FROM option_chain_snapshots s
              WHERE (s.snapshot_ts AT TIME ZONE 'America/New_York')::date = %s
                AND s.underlying_price > 0
                AND s.oi_by_strike IS NOT NULL
                AND jsonb_array_length(s.oi_by_strike->'points') > 0
              ORDER BY s.symbol, s.snapshot_ts DESC
            ),
            gex AS (
              SELECT DISTINCT ON (symbol)
                     symbol, gamma_regime, gamma_flip, call_wall, max_pain, confidence
              FROM gex_history
              WHERE market_date = %s
              ORDER BY symbol, snapshot_ts DESC
            ),
            flow AS (
              SELECT symbol,
                     COUNT(*) FILTER (WHERE is_unusual)        AS unusual_oi_count,
                     SUM(oi_delta) FILTER (WHERE oi_delta > 0) AS oi_added
              FROM option_oi_delta_snapshots
              WHERE (snapshot_ts AT TIME ZONE 'America/New_York')::date = %s
              GROUP BY symbol
            )
            SELECT l.symbol, l.snapshot_ts, l.spot, l.oi_by_strike,
                   g.gamma_regime, g.gamma_flip, g.call_wall, g.max_pain, g.confidence,
                   COALESCE(f.unusual_oi_count, 0), f.oi_added
            FROM latest l
            LEFT JOIN gex  g ON g.symbol = l.symbol
            LEFT JOIN flow f ON f.symbol = l.symbol
            """,
            (market_date, market_date, market_date),
        )
        cols = ('symbol', 'snapshot_ts', 'spot', 'oi_by_strike', 'gamma_regime',
                'gamma_flip', 'call_wall', 'max_pain', 'gex_confidence',
                'unusual_oi_count', 'oi_added')
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def summarize_upside(oi_map: dict, spot: float, window_pct: float = UPSIDE_WINDOW_PCT) -> dict:
    """Reduce the wide OI map to the upside-runway facts. Pure function."""
    points = (oi_map or {}).get('points') or []
    ceiling = spot * (1 + window_pct / 100)
    above = [
        p for p in points
        if p.get('strike') is not None and spot < float(p['strike']) <= ceiling
    ]
    call_oi = sum(int(p.get('call_oi') or 0) for p in above)
    put_oi = sum(int(p.get('put_oi') or 0) for p in above)
    top = max(above, key=lambda p: int(p.get('call_oi') or 0), default=None)
    top_oi = int(top['call_oi']) if top and top.get('call_oi') else 0
    top_strike = float(top['strike']) if top else None
    return {
        'oi_window_pct': (oi_map or {}).get('window_pct'),
        'strikes_above': len(above),
        'call_oi_above': call_oi,
        'put_oi_above': put_oi,
        'top_strike': top_strike,
        'top_strike_call_oi': top_oi,
        # None rather than 0 when undefined -- a real zero and "not computable"
        # must stay distinguishable once these become calibration inputs.
        'concentration': (top_oi / call_oi) if call_oi else None,
        'call_put_ratio_above': (call_oi / put_oi) if put_oi else None,
        'distance_to_top_strike_pct': ((top_strike - spot) / spot * 100) if top_strike else None,
        'map_max_pain': (oi_map or {}).get('max_pain'),
    }


def build_rows(records: list[dict[str, Any]]) -> list[tuple]:
    """Rows WITHOUT market_date; persist() supplies it so there is one source
    for the date rather than each row re-deriving it from its own timestamp."""
    rows = []
    for r in records:
        spot = float(r['spot'])
        s = summarize_upside(r['oi_by_strike'], spot)
        if s['call_oi_above'] < MIN_CALL_OI_ABOVE:
            continue
        rows.append((
            r['symbol'], r['snapshot_ts'], MODEL_VERSION, spot,
            s['oi_window_pct'], s['strikes_above'], s['call_oi_above'], s['put_oi_above'],
            s['top_strike'], s['top_strike_call_oi'], s['concentration'],
            s['call_put_ratio_above'], s['distance_to_top_strike_pct'],
            r['unusual_oi_count'], r['oi_added'],
            r['gamma_regime'], r['gamma_flip'], r['call_wall'],
            r['max_pain'] if r['max_pain'] is not None else s['map_max_pain'],
            r['gex_confidence'],
        ))
    return rows


def persist(conn, market_date: date, rows: list[tuple]) -> int:
    if not rows:
        return 0
    payload = [(r[0], market_date) + r[1:] for r in rows]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO squeeze_watch (
              symbol, market_date, snapshot_ts, model_version, spot,
              oi_window_pct, strikes_above, call_oi_above, put_oi_above,
              top_strike, top_strike_call_oi, concentration,
              call_put_ratio_above, distance_to_top_strike_pct,
              unusual_oi_count, oi_added,
              gamma_regime, gamma_flip, call_wall, max_pain, gex_confidence
            )
            VALUES %s
            ON CONFLICT (symbol, market_date) DO UPDATE SET
              snapshot_ts = EXCLUDED.snapshot_ts,
              model_version = EXCLUDED.model_version,
              spot = EXCLUDED.spot,
              oi_window_pct = EXCLUDED.oi_window_pct,
              strikes_above = EXCLUDED.strikes_above,
              call_oi_above = EXCLUDED.call_oi_above,
              put_oi_above = EXCLUDED.put_oi_above,
              top_strike = EXCLUDED.top_strike,
              top_strike_call_oi = EXCLUDED.top_strike_call_oi,
              concentration = EXCLUDED.concentration,
              call_put_ratio_above = EXCLUDED.call_put_ratio_above,
              distance_to_top_strike_pct = EXCLUDED.distance_to_top_strike_pct,
              unusual_oi_count = EXCLUDED.unusual_oi_count,
              oi_added = EXCLUDED.oi_added,
              gamma_regime = EXCLUDED.gamma_regime,
              gamma_flip = EXCLUDED.gamma_flip,
              call_wall = EXCLUDED.call_wall,
              max_pain = EXCLUDED.max_pain,
              gex_confidence = EXCLUDED.gex_confidence
            """,
            payload,
            page_size=len(payload) or 1,
        )
        # execute_values batches internally, and cur.rowcount then reports only
        # the LAST page -- 76 of 276 on the first real run. Forcing a single page
        # keeps the count truthful; a run summary that under-reports its own
        # writes is how a partial capture would pass unnoticed.
        written = cur.rowcount
    conn.commit()
    return written


def resolve_outcomes(conn, horizon_days: int = 5, max_horizon: int = 10) -> int:
    """Backfill forward returns for rows old enough to score.

    Scored from persisted daily closes only. A row without enough forward bars
    stays unresolved rather than being scored on a short window -- the same
    rule candidate_ledger uses for a missing close.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH scorable AS (
              SELECT w.symbol, w.market_date, w.spot, w.top_strike
              FROM squeeze_watch w
              WHERE w.resolved_at IS NULL
                AND (SELECT COUNT(*) FROM price_history p
                     WHERE p.symbol = w.symbol AND p.date > w.market_date) >= %s
            ),
            fwd AS (
              SELECT s.symbol, s.market_date, s.spot, s.top_strike,
                     (SELECT p.close FROM price_history p
                      WHERE p.symbol = s.symbol AND p.date > s.market_date
                      ORDER BY p.date LIMIT 1 OFFSET %s)               AS close_5d,
                     (SELECT MAX(p.high) FROM price_history p
                      WHERE p.symbol = s.symbol AND p.date > s.market_date
                        AND p.date <= s.market_date + %s)              AS max_high
              FROM scorable s
            )
            UPDATE squeeze_watch w SET
              resolved_at = NOW(),
              fwd_return_5d = CASE WHEN f.close_5d IS NOT NULL
                                   THEN (f.close_5d - f.spot) / f.spot * 100 END,
              fwd_max_return_10d = CASE WHEN f.max_high IS NOT NULL
                                        THEN (f.max_high - f.spot) / f.spot * 100 END,
              reached_top_strike = CASE WHEN f.max_high IS NOT NULL AND f.top_strike IS NOT NULL
                                        THEN f.max_high >= f.top_strike END
            FROM fwd f
            WHERE w.symbol = f.symbol AND w.market_date = f.market_date
              AND f.close_5d IS NOT NULL
            """,
            (horizon_days, horizon_days - 1, max_horizon),
        )
        n = cur.rowcount
    conn.commit()
    return n


def run(market_date: date | None = None, dry_run: bool = False) -> dict[str, Any]:
    if not DB_URL:
        raise RuntimeError('DATABASE_URL is required')
    conn = psycopg2.connect(DB_URL)
    try:
        if market_date is None:
            with conn.cursor() as cur:
                cur.execute("SELECT (NOW() AT TIME ZONE 'America/New_York')::date")
                market_date = cur.fetchone()[0]
        records = latest_positioning(conn, market_date)
        rows = build_rows(records)
        if dry_run:
            return {'market_date': str(market_date), 'candidates': len(records),
                    'rows': len(rows), 'written': 0, 'resolved': 0, 'dry_run': True}
        written = persist(conn, market_date, rows)
        resolved = resolve_outcomes(conn)
    finally:
        conn.close()
    result = {'market_date': str(market_date), 'candidates': len(records),
              'rows': len(rows), 'written': written, 'resolved': resolved}
    log.info('squeeze capture: %s', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Capture observable squeeze-relevant chain state')
    parser.add_argument('--date', default=None, help='market date YYYY-MM-DD (default: today ET)')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    md = date.fromisoformat(args.date) if args.date else None
    import json
    print(json.dumps(run(md, dry_run=args.dry_run), indent=2))
