"""
Daily OHLCV collector.

Writes provider-sourced daily price bars into Railway PostgreSQL price_history.
Provider is selected by PRICE_PROVIDER:
  - ib_internal (default): local IB Gateway historical bars for internal use
  - stooq: explicit dev/backfill provider
"""

import logging
import os

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from common import load_watchlist
from providers.ib_price_provider import IBPriceProvider
from providers.stooq_price_provider import StooqPriceProvider

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
PRICE_PROVIDER = os.getenv('PRICE_PROVIDER', 'ib_internal').strip().lower()
PRICE_HISTORY_LIMIT = int(os.getenv('PRICE_HISTORY_LIMIT', '60'))


def load_symbols():
    """Load collection symbols from SYMBOLS override or collector/watchlist.txt."""
    raw_symbols = os.getenv('SYMBOLS')
    if raw_symbols:
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
    if PRICE_PROVIDER == 'ib_internal':
        return IBPriceProvider()
    if PRICE_PROVIDER == 'stooq':
        return StooqPriceProvider()
    raise ValueError(f'Unknown PRICE_PROVIDER={PRICE_PROVIDER}')


def upsert_price_rows(conn, rows):
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
    conn.commit()
    return len(rows)


def run():
    log.info('=== Price Collector starting ===')
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    watchlist = load_symbols()
    provider = make_provider()
    conn = psycopg2.connect(DB_URL)
    log.info(f'Loaded {len(watchlist)} symbols; provider={provider.source}')

    total_written = 0
    failed = []

    for symbol in watchlist:
        try:
            rows = provider.fetch_daily_bars(symbol, PRICE_HISTORY_LIMIT)
            if not rows:
                raise ValueError('no bars returned')
            written = upsert_price_rows(conn, rows)
            total_written += written
            log.info(f'{symbol}: wrote {written} rows')
        except Exception as exc:
            log.error(f'{symbol}: price fetch failed: {exc}')
            failed.append(symbol)

    conn.close()
    log.info(f'=== Done: {total_written} rows written, {len(failed)} failed ===')
    if failed:
        log.warning(f'Failed symbols: {failed}')


if __name__ == '__main__':
    run()
