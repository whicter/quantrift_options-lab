"""
Materialize scanner rows from existing PostgreSQL snapshots.

This job does not call IB, TT, or any external data provider. It reads the
latest IV, price, option-chain GEX, and strike-level positioning snapshots,
then writes one scanner row per active persisted-universe symbol to scanner_results_snapshots.
"""

import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json, execute_values

from common import load_watchlist

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
SCAN_KEY = os.getenv('SCAN_KEY', 'watchlist_v1')
OPTIONS_STALE_MINUTES = int(os.getenv('OPTIONS_STALE_MINUTES', '15'))
USE_DERIVED_VOLATILITY = os.getenv('USE_DERIVED_VOLATILITY', 'true').strip().lower() in ('1', 'true', 'yes')


def load_symbols(conn=None):
    raw_symbols = os.getenv('SYMBOLS')
    if raw_symbols:
        seen = set()
        symbols = []
        for part in raw_symbols.split(','):
            symbol = part.strip().upper()
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
        return symbols
    if conn is not None:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT symbol FROM symbol_universe WHERE active = TRUE AND scan_enabled = TRUE ORDER BY symbol"
                )
                symbols = [row[0] for row in cur.fetchall()]
                if symbols:
                    return symbols
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
    return load_watchlist()


def fetch_rows(conn, symbols):
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH watchlist AS (
              SELECT UNNEST(%s::text[]) AS symbol
            ),
            settings AS (
              SELECT %s::boolean AS use_derived
            ),
            latest_iv AS (
              SELECT DISTINCT ON (symbol)
                symbol, date, iv30, hv30, hv60, hv90, iv_rank, iv_percentile,
                iv_hv_diff, earnings_date, source
              FROM iv_history
              WHERE symbol = ANY(%s)
              ORDER BY symbol, date DESC
            ),
            latest_hv AS (
              SELECT DISTINCT ON (symbol)
                symbol, metric_date, hv30, hv60, hv90, hv_source
              FROM volatility_history
              WHERE symbol = ANY(%s) AND hv30 IS NOT NULL
              ORDER BY symbol, metric_date DESC
            ),
            latest_atm AS (
              SELECT DISTINCT ON (symbol)
                symbol, metric_date, atm_iv, atm_expiry, atm_strike,
                iv_source, iv_rank_ready, iv_observation_count
              FROM volatility_history
              WHERE symbol = ANY(%s) AND atm_iv IS NOT NULL
              ORDER BY symbol, metric_date DESC
            ),
            latest_derived_rank AS (
              SELECT DISTINCT ON (symbol)
                symbol, metric_date, iv_rank, iv_percentile, iv_source,
                iv_observation_count
              FROM volatility_history
              WHERE symbol = ANY(%s) AND iv_rank_ready = TRUE
              ORDER BY symbol, metric_date DESC
            ),
            latest_price AS (
              SELECT DISTINCT ON (symbol)
                symbol, date AS price_date, close AS price_close, volume AS underlying_volume,
                close * volume AS underlying_dollar_volume, source AS price_source
              FROM price_history
              WHERE symbol = ANY(%s)
              ORDER BY symbol, date DESC
            ),
            price_global AS (
              SELECT MAX(price_date) AS latest_price_date
              FROM latest_price
            ),
            latest_gex AS (
              SELECT DISTINCT ON (g.symbol)
                g.symbol, g.snapshot_ts AS gex_snapshot_ts, g.source AS gex_source,
                g.global_gex, g.local_gamma, g.gamma_flip, g.gamma_regime,
                g.call_wall, g.put_wall, g.max_pain, g.pcr_oi, g.pcr_volume,
                g.confidence AS gex_confidence, c.underlying_price,
                EXTRACT(EPOCH FROM (NOW() - g.snapshot_ts)) / 60.0 AS gex_age_minutes
              FROM gex_snapshots g
              JOIN option_chain_snapshots c ON c.id = g.snapshot_id
              WHERE g.symbol = ANY(%s)
              ORDER BY g.symbol, g.snapshot_ts DESC
            ),
            latest_chain AS (
              SELECT DISTINCT ON (symbol) symbol, id AS latest_snapshot_id
              FROM option_chain_snapshots
              WHERE symbol = ANY(%s)
              ORDER BY symbol, snapshot_ts DESC
            ),
            option_totals AS (
              SELECT
                symbol,
                SUM(COALESCE(call_oi, 0) + COALESCE(put_oi, 0)) AS total_oi,
                SUM(COALESCE(call_volume, 0) + COALESCE(put_volume, 0)) AS total_volume,
                MAX(GREATEST(COALESCE(call_oi, 0), COALESCE(put_oi, 0))) AS max_strike_oi,
                MAX(GREATEST(COALESCE(call_volume, 0), COALESCE(put_volume, 0))) AS max_strike_volume
              FROM gex_by_strike_snapshots
              WHERE snapshot_id IN (SELECT latest_snapshot_id FROM latest_chain)
              GROUP BY symbol
            ),
            latest_oi_delta_batch AS (
              SELECT symbol, MAX(snapshot_ts) AS snapshot_ts
              FROM option_oi_delta_snapshots
              WHERE symbol = ANY(%s)
              GROUP BY symbol
            ),
            unusual_totals AS (
              SELECT
                d.symbol,
                COUNT(*) FILTER (WHERE d.is_unusual)::int AS unusual_oi_count,
                MAX(ABS(d.oi_delta)) AS max_oi_delta,
                MAX(d.volume_oi_ratio) AS max_volume_oi_ratio,
                CASE
                  WHEN COUNT(*) = 0 THEN 'missing'
                  WHEN COUNT(*) FILTER (WHERE d.status = 'confirmed') > 0 THEN 'confirmed'
                  WHEN COUNT(*) FILTER (WHERE d.status = 'stale') > 0 THEN 'stale'
                  WHEN COUNT(*) FILTER (WHERE d.status = 'baseline') > 0 THEN 'baseline'
                  ELSE 'missing'
                END AS unusual_status
              FROM option_oi_delta_snapshots d
              JOIN latest_oi_delta_batch b
                ON b.symbol = d.symbol AND b.snapshot_ts = d.snapshot_ts
              GROUP BY d.symbol
            )
            SELECT
              watchlist.symbol,
              NOW() AS scanner_snapshot_ts,
              GREATEST(latest_iv.date, latest_hv.metric_date, latest_atm.metric_date) AS date,
              CASE WHEN settings.use_derived THEN COALESCE(latest_atm.atm_iv, latest_iv.iv30) ELSE latest_iv.iv30 END AS iv30,
              CASE WHEN settings.use_derived THEN COALESCE(latest_hv.hv30, latest_iv.hv30) ELSE latest_iv.hv30 END AS hv30,
              CASE WHEN settings.use_derived THEN COALESCE(latest_derived_rank.iv_rank, latest_iv.iv_rank) ELSE latest_iv.iv_rank END AS iv_rank,
              CASE WHEN settings.use_derived THEN COALESCE(latest_derived_rank.iv_percentile, latest_iv.iv_percentile) ELSE latest_iv.iv_percentile END AS iv_percentile,
              CASE
                WHEN (CASE WHEN settings.use_derived THEN COALESCE(latest_atm.atm_iv, latest_iv.iv30) ELSE latest_iv.iv30 END) IS NOT NULL
                  AND (CASE WHEN settings.use_derived THEN COALESCE(latest_hv.hv30, latest_iv.hv30) ELSE latest_iv.hv30 END) IS NOT NULL
                THEN (CASE WHEN settings.use_derived THEN COALESCE(latest_atm.atm_iv, latest_iv.iv30) ELSE latest_iv.iv30 END)
                   - (CASE WHEN settings.use_derived THEN COALESCE(latest_hv.hv30, latest_iv.hv30) ELSE latest_iv.hv30 END)
                ELSE NULL
              END AS iv_hv_diff,
              latest_atm.atm_iv, latest_atm.atm_expiry, latest_atm.atm_strike,
              CASE WHEN settings.use_derived AND latest_atm.atm_iv IS NOT NULL THEN latest_atm.iv_source ELSE latest_iv.source END AS iv_source,
              CASE WHEN settings.use_derived AND latest_hv.hv30 IS NOT NULL THEN latest_hv.hv_source ELSE latest_iv.source END AS hv_source,
              CASE WHEN settings.use_derived AND latest_derived_rank.iv_rank IS NOT NULL THEN latest_derived_rank.iv_source ELSE latest_iv.source END AS iv_rank_source,
              CASE WHEN settings.use_derived THEN COALESCE(latest_atm.iv_rank_ready, FALSE) ELSE FALSE END AS iv_rank_ready,
              CASE WHEN settings.use_derived THEN COALESCE(latest_atm.iv_observation_count, 0) ELSE 0 END AS iv_observation_count,
              latest_iv.earnings_date,
              CASE
                WHEN settings.use_derived AND (latest_atm.atm_iv IS NOT NULL OR latest_hv.hv30 IS NOT NULL) THEN 'hybrid'
                ELSE latest_iv.source
              END AS source,
              latest_price.price_close, latest_price.price_date, latest_price.price_source,
              latest_price.underlying_volume, latest_price.underlying_dollar_volume,
              CASE
                WHEN latest_price.price_date IS NULL THEN 'missing'
                WHEN latest_price.price_date < price_global.latest_price_date THEN 'stale'
                ELSE 'covered'
              END AS price_status,
              latest_gex.gex_snapshot_ts, latest_gex.gex_source,
              CASE
                WHEN latest_gex.gex_snapshot_ts IS NULL THEN 'missing'
                WHEN latest_gex.gex_age_minutes > %s THEN 'stale'
                ELSE 'fresh'
              END AS gex_status,
              latest_gex.global_gex, latest_gex.local_gamma, latest_gex.gamma_flip,
              latest_gex.gamma_regime, latest_gex.call_wall, latest_gex.put_wall,
              latest_gex.max_pain, latest_gex.pcr_oi, latest_gex.pcr_volume,
              latest_gex.gex_confidence,
              option_totals.total_oi, option_totals.total_volume,
              option_totals.total_volume / NULLIF(option_totals.total_oi, 0) AS volume_oi_ratio,
              option_totals.max_strike_oi, option_totals.max_strike_volume,
              unusual_totals.unusual_oi_count,
              unusual_totals.max_oi_delta,
              unusual_totals.max_volume_oi_ratio,
              unusual_totals.unusual_status,
              CASE
                WHEN COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NULL THEN NULL
                WHEN latest_gex.call_wall IS NULL THEN NULL
                ELSE ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.call_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100
              END AS call_wall_distance_pct,
              CASE
                WHEN COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NULL THEN NULL
                WHEN latest_gex.put_wall IS NULL THEN NULL
                ELSE ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.put_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100
              END AS put_wall_distance_pct,
              (
                COALESCE(CASE WHEN settings.use_derived THEN latest_derived_rank.iv_rank END, latest_iv.iv_rank, 0)
                + CASE
                    WHEN latest_gex.gamma_regime = 'negative' THEN 20
                    WHEN latest_gex.gamma_regime = 'positive' THEN 10
                    ELSE 0
                  END
                + CASE
                    WHEN latest_gex.call_wall IS NOT NULL
                      AND COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NOT NULL
                      AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.call_wall)
                          / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= 3
                    THEN 10 ELSE 0
                  END
                + CASE
                    WHEN latest_gex.put_wall IS NOT NULL
                      AND COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NOT NULL
                      AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.put_wall)
                          / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= 3
                    THEN 10 ELSE 0
                  END
              ) AS signal_score
            FROM watchlist
            LEFT JOIN latest_iv ON latest_iv.symbol = watchlist.symbol
            LEFT JOIN latest_hv ON latest_hv.symbol = watchlist.symbol
            LEFT JOIN latest_atm ON latest_atm.symbol = watchlist.symbol
            LEFT JOIN latest_derived_rank ON latest_derived_rank.symbol = watchlist.symbol
            LEFT JOIN latest_price ON latest_price.symbol = watchlist.symbol
            LEFT JOIN latest_gex ON latest_gex.symbol = watchlist.symbol
            LEFT JOIN option_totals ON option_totals.symbol = watchlist.symbol
            LEFT JOIN unusual_totals ON unusual_totals.symbol = watchlist.symbol
            CROSS JOIN price_global
            CROSS JOIN settings
            ORDER BY watchlist.symbol
            """,
            (
                symbols, USE_DERIVED_VOLATILITY,
                symbols, symbols, symbols, symbols,
                symbols, symbols, symbols, symbols,
                OPTIONS_STALE_MINUTES,
            ),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def as_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def rsi(values, period=14):
    if len(values) <= period:
        return None
    gains = []
    losses = []
    for prev, current in zip(values[-period - 1:-1], values[-period:]):
        change = current - prev
        gains.append(max(change, 0))
        losses.append(max(-change, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def fetch_price_histories(conn, symbols, limit=220):
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
              SELECT
                symbol, date, close,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
              FROM price_history
              WHERE symbol = ANY(%s)
            )
            SELECT symbol, date, close
            FROM ranked
            WHERE rn <= %s
            ORDER BY symbol, date ASC
            """,
            (symbols, limit),
        )
        histories = {}
        for symbol, date, close in cur.fetchall():
            histories.setdefault(symbol, []).append({
                'date': date,
                'close': as_float(close),
            })
        return histories


def derive_trend(history):
    closes = [bar['close'] for bar in history if bar.get('close') is not None]
    if len(closes) < 5:
        return {
            'trend_score': None,
            'trend_label': '趋势数据不足',
            'trend_signal': 'missing',
            'trend_change_5d': None,
            'trend_rsi14': None,
            'trend_ma20': None,
            'trend_ma50': None,
            'trend_ma200': None,
        }

    latest = closes[-1]
    prev = closes[-6] if len(closes) >= 6 else closes[0]
    ma20 = sma(closes, 20)
    ma50 = sma(closes, 50)
    ma200 = sma(closes, 200)
    rsi14 = rsi(closes, 14)
    change5d = ((latest / prev) - 1) * 100 if prev else 0

    above20 = latest >= ma20 if ma20 is not None else True
    above50 = latest >= ma50 if ma50 is not None else above20
    rsi_bullish = True if rsi14 is None else 50 <= rsi14 <= 75
    score = sum([
        1 if above20 else -1,
        1 if above50 else -1,
        1 if change5d > 1 else -1 if change5d < -1 else 0,
        1 if rsi_bullish else 0 if rsi14 and rsi14 > 75 else -1,
    ])

    if score >= 3:
        label = '多头趋势'
        signal = 'bullish'
    elif score <= -3:
        label = '空头趋势'
        signal = 'bearish'
    elif above20:
        label = '震荡偏强'
        signal = 'neutral_bullish'
    else:
        label = '震荡偏弱'
        signal = 'neutral_bearish'

    return {
        'trend_score': score,
        'trend_label': label,
        'trend_signal': signal,
        'trend_change_5d': change5d,
        'trend_rsi14': rsi14,
        'trend_ma20': ma20,
        'trend_ma50': ma50,
        'trend_ma200': ma200,
    }


def attach_trends(rows, histories):
    for row in rows:
        row.update(derive_trend(histories.get(row['symbol'], [])))
    return rows


def attach_universe_metadata(conn, rows):
    symbols = [row['symbol'] for row in rows]
    if not symbols:
        return rows
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, name, asset_type, sector, market_cap, optionable
            FROM symbol_universe
            WHERE symbol = ANY(%s)
            """,
            (symbols,),
        )
        metadata = {
            symbol: {
                'universe_name': name,
                'asset_type': asset_type,
                'sector': sector,
                'market_cap': market_cap,
                'optionable': optionable,
            }
            for symbol, name, asset_type, sector, market_cap, optionable in cur.fetchall()
        }
    for row in rows:
        row.update(metadata.get(row['symbol'], {}))
    return rows


def insert_rows(conn, rows):
    if not rows:
        return 0

    cols = [
        'scan_key', 'symbol', 'snapshot_ts', 'source',
        'metric_date', 'iv30', 'hv30', 'iv_rank', 'iv_percentile', 'iv_hv_diff', 'earnings_date',
        'atm_iv', 'atm_expiry', 'atm_strike', 'iv_source', 'hv_source',
        'iv_rank_source', 'iv_rank_ready', 'iv_observation_count',
        'price_close', 'price_date', 'price_source', 'price_status',
        'underlying_volume', 'underlying_dollar_volume',
        'universe_name', 'asset_type', 'sector', 'market_cap', 'optionable',
        'gex_snapshot_ts', 'gex_source', 'gex_status', 'global_gex', 'local_gamma',
        'gamma_flip', 'gamma_regime', 'call_wall', 'put_wall', 'max_pain',
        'pcr_oi', 'pcr_volume', 'gex_confidence', 'total_oi', 'total_volume',
        'volume_oi_ratio', 'max_strike_oi', 'max_strike_volume',
        'call_wall_distance_pct', 'put_wall_distance_pct', 'signal_score',
        'trend_score', 'trend_label', 'trend_signal', 'trend_change_5d',
        'trend_rsi14', 'trend_ma20', 'trend_ma50', 'trend_ma200',
        'unusual_oi_count', 'max_oi_delta', 'max_volume_oi_ratio', 'unusual_status',
        'payload', 'freshness', 'is_stale', 'refresh_status',
    ]

    values = []
    for row in rows:
        source = row.get('source') or row.get('gex_source') or row.get('price_source') or 'unavailable'
        payload = {
            'metric_date': row.get('date').isoformat() if row.get('date') else None,
            'gex_snapshot_ts': row.get('gex_snapshot_ts').isoformat() if row.get('gex_snapshot_ts') else None,
            'price_date': row.get('price_date').isoformat() if row.get('price_date') else None,
            'iv_source': row.get('iv_source'),
            'hv_source': row.get('hv_source'),
            'iv_rank_source': row.get('iv_rank_source'),
            'iv_rank_ready': bool(row.get('iv_rank_ready')),
            'iv_observation_count': row.get('iv_observation_count') or 0,
        }
        freshness = 'fresh'
        is_stale = False
        if not row.get('date') and not row.get('gex_snapshot_ts') and not row.get('price_date'):
            freshness = 'missing'
            is_stale = True
        elif row.get('gex_status') == 'stale' or row.get('price_status') == 'stale':
            freshness = 'stale'
            is_stale = True

        values.append((
            SCAN_KEY,
            row['symbol'],
            row['scanner_snapshot_ts'],
            source,
            row.get('date'),
            row.get('iv30'),
            row.get('hv30'),
            row.get('iv_rank'),
            row.get('iv_percentile'),
            row.get('iv_hv_diff'),
            row.get('earnings_date'),
            row.get('atm_iv'),
            row.get('atm_expiry'),
            row.get('atm_strike'),
            row.get('iv_source'),
            row.get('hv_source'),
            row.get('iv_rank_source'),
            bool(row.get('iv_rank_ready')),
            row.get('iv_observation_count') or 0,
            row.get('price_close'),
            row.get('price_date'),
            row.get('price_source'),
            row.get('price_status') or 'missing',
            row.get('underlying_volume'),
            row.get('underlying_dollar_volume'),
            row.get('universe_name'),
            row.get('asset_type'),
            row.get('sector'),
            row.get('market_cap'),
            row.get('optionable'),
            row.get('gex_snapshot_ts'),
            row.get('gex_source'),
            row.get('gex_status') or 'missing',
            row.get('global_gex'),
            row.get('local_gamma'),
            row.get('gamma_flip'),
            row.get('gamma_regime'),
            row.get('call_wall'),
            row.get('put_wall'),
            row.get('max_pain'),
            row.get('pcr_oi'),
            row.get('pcr_volume'),
            row.get('gex_confidence'),
            row.get('total_oi'),
            row.get('total_volume'),
            row.get('volume_oi_ratio'),
            row.get('max_strike_oi'),
            row.get('max_strike_volume'),
            row.get('call_wall_distance_pct'),
            row.get('put_wall_distance_pct'),
            row.get('signal_score'),
            row.get('trend_score'),
            row.get('trend_label'),
            row.get('trend_signal'),
            row.get('trend_change_5d'),
            row.get('trend_rsi14'),
            row.get('trend_ma20'),
            row.get('trend_ma50'),
            row.get('trend_ma200'),
            row.get('unusual_oi_count') or 0,
            row.get('max_oi_delta'),
            row.get('max_volume_oi_ratio'),
            row.get('unusual_status') or 'missing',
            Json(payload),
            freshness,
            is_stale,
            'none',
        ))

    update_cols = [col for col in cols if col not in ('scan_key', 'symbol', 'snapshot_ts')]
    update_set = ', '.join(f'{col} = EXCLUDED.{col}' for col in update_cols)

    with conn.cursor() as cur:
        execute_values(
            cur,
            f"""
            INSERT INTO scanner_results_snapshots ({', '.join(cols)})
            VALUES %s
            ON CONFLICT (scan_key, symbol, snapshot_ts) DO UPDATE SET {update_set}
            """,
            values,
        )
    conn.commit()
    return len(values)


def run():
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    conn = psycopg2.connect(DB_URL)
    try:
        symbols = load_symbols(conn)
        if not symbols:
            log.warning('No symbols configured; nothing to materialize')
            return
        rows = fetch_rows(conn, symbols)
        rows = attach_trends(rows, fetch_price_histories(conn, symbols))
        rows = attach_universe_metadata(conn, rows)
        written = insert_rows(conn, rows)
        log.info('Materialized %s scanner rows for scan_key=%s', written, SCAN_KEY)
    finally:
        conn.close()


if __name__ == '__main__':
    run()
