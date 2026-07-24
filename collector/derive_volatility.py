from __future__ import annotations

import logging
import math
import os
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from common import load_watchlist
from implied_vol import atm_iv_from_call_put, constant_maturity_atm_iv

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
IV_RANK_MIN_OBSERVATIONS = int(os.getenv('IV_RANK_MIN_OBSERVATIONS', '252'))
ANNUALIZATION_DAYS = int(os.getenv('HV_ANNUALIZATION_DAYS', '252'))
# Phase 3: forward daily IV uses the same constant-30-day maturity as the
# historical backfill (`polygon_backfill_bs`), so the spliced 252-day series has
# no method seam. Flip IV_CM30_ENABLED=false to fall back to the legacy floating
# 30-45 DTE single-ATM observation (`polygon_derived`).
IV_CM30_ENABLED = os.getenv('IV_CM30_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')
IV_CM30_TARGET_DAYS = float(os.getenv('IV_CM30_TARGET_DAYS', '30'))
IV_CM30_DTE_MIN = int(os.getenv('IV_CM30_DTE_MIN', '12'))
IV_CM30_DTE_MAX = int(os.getenv('IV_CM30_DTE_MAX', '50'))
IV_CM30_SOURCE = 'polygon_snapshot_cm30'


def annualized_hv(closes: list[float], window: int, annualization_days: int = 252) -> float | None:
    if len(closes) < window + 1:
        return None
    returns = [math.log(current / previous) for previous, current in zip(closes[-window - 1:-1], closes[-window:])]
    return statistics.stdev(returns) * math.sqrt(annualization_days)


def build_hv_rows(symbol: str, prices: list[tuple[date, float]]) -> list[dict]:
    closes: list[float] = []
    rows: list[dict] = []
    for metric_date, close in prices:
        if close <= 0:
            continue
        closes.append(float(close))
        hv30 = annualized_hv(closes, 30, ANNUALIZATION_DAYS)
        hv60 = annualized_hv(closes, 60, ANNUALIZATION_DAYS)
        hv90 = annualized_hv(closes, 90, ANNUALIZATION_DAYS)
        if hv30 is None and hv60 is None and hv90 is None:
            continue
        rows.append({
            'symbol': symbol,
            'metric_date': metric_date,
            'hv30': hv30,
            'hv60': hv60,
            'hv90': hv90,
            'hv30_observations': 30 if hv30 is not None else None,
            'hv60_observations': 60 if hv60 is not None else None,
            'hv90_observations': 90 if hv90 is not None else None,
            'hv_source': 'polygon_derived',
        })
    return rows


def calculate_iv_rank(values: list[float], min_observations: int = 252) -> dict:
    count = len(values)
    if count < min_observations:
        return {'iv_rank': None, 'iv_percentile': None, 'count': count, 'ready': False}
    current = values[-1]
    low = min(values)
    high = max(values)
    iv_rank = 50.0 if high == low else (current - low) / (high - low) * 100
    percentile = sum(value <= current for value in values) / count * 100
    return {
        'iv_rank': round(iv_rank, 2),
        'iv_percentile': round(percentile, 2),
        'count': count,
        'ready': True,
    }


def fetch_polygon_prices(conn, symbols: list[str]) -> dict[str, list[tuple[date, float]]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, date, close
            FROM price_history
            WHERE symbol = ANY(%s) AND source = 'polygon_licensed'
            ORDER BY symbol, date
            """,
            (symbols,),
        )
        result: dict[str, list[tuple[date, float]]] = defaultdict(list)
        for symbol, metric_date, close in cur.fetchall():
            result[symbol].append((metric_date, float(close)))
        return dict(result)


def fetch_atm_observations(conn, symbols: list[str]) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH daily_snapshots AS (
              SELECT DISTINCT ON (symbol, (snapshot_ts AT TIME ZONE 'America/New_York')::date)
                id, symbol,
                (snapshot_ts AT TIME ZONE 'America/New_York')::date AS metric_date,
                underlying_price, source
              FROM option_chain_snapshots
              WHERE symbol = ANY(%s)
                AND source = 'polygon_licensed'
                AND contract_count > 0
              ORDER BY symbol, (snapshot_ts AT TIME ZONE 'America/New_York')::date, snapshot_ts DESC
            ),
            ranked AS (
              SELECT
                s.symbol, s.metric_date, s.id AS snapshot_id, s.source,
                c.iv AS atm_iv, c.expiry AS atm_expiry, c.strike AS atm_strike,
                (c.expiry - s.metric_date)::int AS atm_dte,
                ROW_NUMBER() OVER (
                  PARTITION BY s.id
                  ORDER BY ABS(c.strike - s.underlying_price),
                           ABS((c.expiry - s.metric_date) - 37),
                           c.expiry, c.strike
                ) AS rn
              FROM daily_snapshots s
              JOIN option_contract_snapshots c ON c.snapshot_id = s.id
              WHERE c.option_right = 'C'
                AND c.iv IS NOT NULL
                AND (c.expiry - s.metric_date) BETWEEN 30 AND 45
            )
            SELECT symbol, metric_date, snapshot_id, source,
                   atm_iv, atm_expiry, atm_strike, atm_dte
            FROM ranked
            WHERE rn = 1
            ORDER BY symbol, metric_date
            """,
            (symbols,),
        )
        columns = [description[0] for description in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def _f(value) -> float | None:
    return float(value) if value is not None else None


def build_cm30_rows(raw_rows: list[dict], target_days: float = IV_CM30_TARGET_DAYS) -> list[dict]:
    """Collapse per-expiry ATM call/put IV rows into one constant-30d IV per
    symbol-day. Pure so the interpolation + provenance logic is unit-testable.

    ``raw_rows`` are ATM-strike rows (one per snapshot+expiry) carrying
    ``dte``, ``call_iv``, ``put_iv`` and provenance columns. Groups by
    (symbol, metric_date), interpolates to ``target_days`` in total variance,
    and anchors provenance to the expiry nearest the target that has a usable
    ATM IV. Symbol-days with no usable IV are dropped.
    """
    grouped: dict[tuple[str, date], list[dict]] = defaultdict(list)
    for row in raw_rows:
        grouped[(row['symbol'], row['metric_date'])].append(row)

    rows: list[dict] = []
    for (symbol, metric_date), expiries in grouped.items():
        expiry_points = [(e['dte'], _f(e['call_iv']), _f(e['put_iv'])) for e in expiries]
        cm30 = constant_maturity_atm_iv(expiry_points, target_days)
        if cm30 is None:
            continue
        usable = [e for e in expiries if atm_iv_from_call_put(_f(e['call_iv']), _f(e['put_iv'])) is not None]
        anchor = min(usable, key=lambda e: (abs(e['dte'] - target_days), e['dte']))
        rows.append({
            'symbol': symbol,
            'metric_date': metric_date,
            'snapshot_id': anchor['snapshot_id'],
            'source': anchor['source'],
            'atm_iv': cm30,
            'atm_expiry': anchor['expiry'],
            'atm_strike': anchor['strike'],
            'atm_dte': anchor['dte'],
            'iv_source': IV_CM30_SOURCE,
        })
    return rows


def fetch_cm30_observations(
    conn,
    symbols: list[str],
    dte_min: int = IV_CM30_DTE_MIN,
    dte_max: int = IV_CM30_DTE_MAX,
    target_days: float = IV_CM30_TARGET_DAYS,
) -> list[dict]:
    """Forward constant-30d ATM IV per symbol-day from Polygon snapshot IV.

    For each daily snapshot it takes, per bracketing expiry, the ATM strike's
    call and put snapshot IV (no BS inversion -- snapshots already carry IV),
    then interpolates to a constant target maturity. This matches the historical
    backfill's maturity convention and removes the seam a floating-DTE ATM IV
    injects into the IV-Rank series.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH daily_snapshots AS (
              SELECT DISTINCT ON (symbol, (snapshot_ts AT TIME ZONE 'America/New_York')::date)
                id, symbol,
                (snapshot_ts AT TIME ZONE 'America/New_York')::date AS metric_date,
                underlying_price, source
              FROM option_chain_snapshots
              WHERE symbol = ANY(%s)
                AND source = 'polygon_licensed'
                AND contract_count > 0
                AND underlying_price IS NOT NULL AND underlying_price > 0
              ORDER BY symbol, (snapshot_ts AT TIME ZONE 'America/New_York')::date, snapshot_ts DESC
            ),
            strike_iv AS (
              SELECT s.symbol, s.metric_date, s.id AS snapshot_id, s.source, s.underlying_price,
                     c.expiry, (c.expiry - s.metric_date)::int AS dte, c.strike,
                     MAX(c.iv) FILTER (WHERE c.option_right = 'C') AS call_iv,
                     MAX(c.iv) FILTER (WHERE c.option_right = 'P') AS put_iv
              FROM daily_snapshots s
              JOIN option_contract_snapshots c ON c.snapshot_id = s.id
              WHERE c.iv IS NOT NULL AND c.iv > 0
                AND (c.expiry - s.metric_date) BETWEEN %s AND %s
              GROUP BY s.symbol, s.metric_date, s.id, s.source, s.underlying_price, c.expiry, c.strike
            ),
            atm AS (
              SELECT strike_iv.*,
                     ROW_NUMBER() OVER (
                       PARTITION BY snapshot_id, expiry
                       ORDER BY ABS(strike - underlying_price), strike
                     ) AS rn
              FROM strike_iv
            )
            SELECT symbol, metric_date, snapshot_id, source, expiry, dte, strike, call_iv, put_iv
            FROM atm
            WHERE rn = 1
            ORDER BY symbol, metric_date, dte
            """,
            (symbols, dte_min, dte_max),
        )
        columns = [description[0] for description in cur.description]
        raw_rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    return build_cm30_rows(raw_rows, target_days)


def upsert_hv_rows(conn, rows: list[dict]) -> int:
    if not rows:
        return 0
    columns = [
        'symbol', 'metric_date', 'hv30', 'hv60', 'hv90',
        'hv30_observations', 'hv60_observations', 'hv90_observations', 'hv_source',
    ]
    values = [tuple(row[column] for column in columns) for row in rows]
    with conn.cursor() as cur:
        execute_values(
            cur,
            f"""
            INSERT INTO volatility_history ({', '.join(columns)}) VALUES %s
            ON CONFLICT (symbol, metric_date) DO UPDATE SET
              hv30 = EXCLUDED.hv30,
              hv60 = EXCLUDED.hv60,
              hv90 = EXCLUDED.hv90,
              hv30_observations = EXCLUDED.hv30_observations,
              hv60_observations = EXCLUDED.hv60_observations,
              hv90_observations = EXCLUDED.hv90_observations,
              hv_source = EXCLUDED.hv_source,
              updated_at = NOW()
            """,
            values,
        )
    conn.commit()
    return len(rows)


def upsert_atm_rows(conn, rows: list[dict]) -> int:
    if not rows:
        return 0
    columns = [
        'symbol', 'metric_date', 'atm_iv', 'atm_expiry', 'atm_strike',
        'atm_dte', 'atm_snapshot_id', 'iv_source',
    ]
    values = [(
        row['symbol'], row['metric_date'], row['atm_iv'], row['atm_expiry'],
        row['atm_strike'], row['atm_dte'], row['snapshot_id'],
        row.get('iv_source', 'polygon_derived'),
    ) for row in rows]
    with conn.cursor() as cur:
        execute_values(
            cur,
            f"""
            INSERT INTO volatility_history ({', '.join(columns)}) VALUES %s
            ON CONFLICT (symbol, metric_date) DO UPDATE SET
              atm_iv = EXCLUDED.atm_iv,
              atm_expiry = EXCLUDED.atm_expiry,
              atm_strike = EXCLUDED.atm_strike,
              atm_dte = EXCLUDED.atm_dte,
              atm_snapshot_id = EXCLUDED.atm_snapshot_id,
              iv_source = EXCLUDED.iv_source,
              updated_at = NOW()
            """,
            values,
        )
    conn.commit()
    return len(rows)


def update_iv_rank_readiness(conn, symbols: list[str]) -> dict[str, dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, metric_date, atm_iv
            FROM volatility_history
            WHERE symbol = ANY(%s) AND atm_iv IS NOT NULL
            ORDER BY symbol, metric_date
            """,
            (symbols,),
        )
        observations: dict[str, list[tuple[date, float]]] = defaultdict(list)
        for symbol, metric_date, atm_iv in cur.fetchall():
            observations[symbol].append((metric_date, float(atm_iv)))

    statuses = {}
    with conn.cursor() as cur:
        for symbol in symbols:
            values = observations.get(symbol, [])
            result = calculate_iv_rank([value for _, value in values], IV_RANK_MIN_OBSERVATIONS)
            statuses[symbol] = result
            if not values:
                continue
            latest_date = values[-1][0]
            cur.execute(
                """
                UPDATE volatility_history
                SET iv_rank = %s,
                    iv_percentile = %s,
                    iv_observation_count = %s,
                    iv_rank_ready = %s,
                    updated_at = NOW()
                WHERE symbol = %s AND metric_date = %s
                """,
                (result['iv_rank'], result['iv_percentile'], result['count'], result['ready'], symbol, latest_date),
            )
    conn.commit()
    return statuses


def run(backfill: bool | None = None, symbols: list[str] | None = None) -> dict:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    symbols = symbols or load_watchlist()
    conn = psycopg2.connect(DB_URL)
    try:
        price_histories = fetch_polygon_prices(conn, symbols)
        if backfill is None:
            backfill = os.getenv('VOLATILITY_BACKFILL', 'false').strip().lower() in ('1', 'true', 'yes')
        hv_rows = []
        for symbol in symbols:
            symbol_rows = build_hv_rows(symbol, price_histories.get(symbol, []))
            hv_rows.extend(symbol_rows if backfill else symbol_rows[-1:])
        hv_written = upsert_hv_rows(conn, hv_rows)
        atm_rows = fetch_cm30_observations(conn, symbols) if IV_CM30_ENABLED else fetch_atm_observations(conn, symbols)
        atm_written = upsert_atm_rows(conn, atm_rows)
        statuses = update_iv_rank_readiness(conn, symbols)
    finally:
        conn.close()

    ready_count = sum(status['ready'] for status in statuses.values())
    summary = {
        'symbols': len(symbols),
        'hv_rows': hv_written,
        'atm_rows': atm_written,
        'iv_rank_ready': ready_count,
        'backfill': backfill,
    }
    log.info('Derived volatility summary: %s', summary)
    return summary


if __name__ == '__main__':
    run()
