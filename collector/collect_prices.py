"""
Daily OHLCV collector.

Writes provider-sourced daily price bars into Railway PostgreSQL price_history.
Provider is selected by PRICE_PROVIDER:
  - polygon (default): licensed daily and 30-minute aggregates
  - ib_internal: local IB Gateway historical bars for internal fallback
  - stooq: explicit dev/backfill provider
"""

import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from common import load_watchlist
from providers.ib_price_provider import IBPriceProvider
from providers.polygon_price_provider import PolygonPriceProvider
from providers.stooq_price_provider import StooqPriceProvider

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
PRICE_PROVIDER = os.getenv('PRICE_PROVIDER', 'polygon').strip().lower()
PRICE_HISTORY_LIMIT = int(os.getenv('PRICE_HISTORY_LIMIT', '400'))
PRICE_30M_LOOKBACK_DAYS = int(os.getenv('PRICE_30M_LOOKBACK_DAYS', '35'))


def load_symbols():
    """Load collection symbols from SYMBOLS override or collector/watchlist.txt."""
    raw_symbols = os.getenv('SYMBOLS')
    if raw_symbols:
        if raw_symbols.strip().lower() in {'watchlist', 'all'}:
            return load_watchlist()
        symbols = []
        seen = set()
        for part in raw_symbols.split(','):
            symbol = part.strip().upper()
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
        return symbols
    return load_watchlist()


def make_provider():
    if PRICE_PROVIDER in ('polygon', 'polygon_licensed'):
        return PolygonPriceProvider()
    if PRICE_PROVIDER == 'ib_internal':
        return IBPriceProvider()
    if PRICE_PROVIDER == 'stooq':
        return StooqPriceProvider()
    raise ValueError(f'Unknown PRICE_PROVIDER={PRICE_PROVIDER}')


def upsert_price_rows(conn, rows, commit=True):
    if not rows:
        return 0

    cols = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'source']
    values = [tuple(getattr(row, col) for col in cols) for row in rows]
    update_cols = [col for col in cols if col not in ('symbol', 'date')]
    update_set = ', '.join(f'{col} = EXCLUDED.{col}' for col in update_cols)

    sql = f"""
        INSERT INTO price_history ({', '.join(cols)})
        VALUES %s
        ON CONFLICT (symbol, date) DO UPDATE SET {update_set}
    """

    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    if commit:
        conn.commit()
    return len(rows)


def upsert_30m_rows(conn, rows, commit=True):
    if not rows:
        return 0

    cols = ['symbol', 'bar_ts', 'open', 'high', 'low', 'close', 'volume', 'vwap', 'trade_count', 'source']
    values = [tuple(getattr(row, col) for col in cols) for row in rows]
    update_cols = [col for col in cols if col not in ('symbol', 'bar_ts')]
    update_set = ', '.join(f'{col} = EXCLUDED.{col}' for col in update_cols)
    sql = f"""
        INSERT INTO price_history_30m ({', '.join(cols)})
        VALUES %s
        ON CONFLICT (symbol, bar_ts) DO UPDATE SET {update_set}
    """

    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    if commit:
        conn.commit()
    return len(rows)


def fetch_price_rows(provider, symbol):
    daily_rows = provider.fetch_daily_bars(symbol, PRICE_HISTORY_LIMIT)
    fetch_30m = getattr(provider, 'fetch_30m_bars', None)
    intraday_rows = fetch_30m(symbol, PRICE_30M_LOOKBACK_DAYS) if callable(fetch_30m) else []
    if not daily_rows:
        raise ValueError('no daily bars returned')
    if provider.source == 'polygon_licensed' and not intraday_rows:
        raise ValueError('no 30-minute bars returned')
    return daily_rows, intraday_rows


def run():
    log.info('=== Price Collector starting ===')
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    watchlist = load_symbols()
    provider = make_provider()
    conn = psycopg2.connect(DB_URL)
    log.info(f'Loaded {len(watchlist)} symbols; provider={provider.source}')

    total_daily_written = 0
    total_30m_written = 0
    failed = []

    for symbol in watchlist:
        try:
            daily_rows, intraday_rows = fetch_price_rows(provider, symbol)
            daily_written = upsert_price_rows(conn, daily_rows, commit=False)
            intraday_written = upsert_30m_rows(conn, intraday_rows, commit=False)
            conn.commit()
            total_daily_written += daily_written
            total_30m_written += intraday_written
            log.info(f'{symbol}: wrote daily={daily_written}; 30m={intraday_written}')
        except Exception as exc:
            conn.rollback()
            log.error(f'{symbol}: price fetch failed: {exc}')
            failed.append(symbol)

    conn.close()
    log.info(
        f'=== Done: daily={total_daily_written}; 30m={total_30m_written}; '
        f'{len(failed)} symbols failed ==='
    )
    if failed:
        log.warning(f'Failed symbols: {failed}')
        raise RuntimeError(f'price collection failed for {len(failed)} symbols: {failed}')


if __name__ == '__main__':
    run()
