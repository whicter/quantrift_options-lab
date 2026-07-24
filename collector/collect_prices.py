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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

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

MARKET_TIMEZONE = ZoneInfo('America/New_York')
# ET hour after which the just-closed session's Polygon EOD daily aggregate is
# reliably finalized. Before this the current day's bar may still be pending, so
# the freshness guard does not yet demand it (the 13:35 PT run is only ~35 min
# after the 16:00 ET close). The evening run (18:35 PT = 21:35 ET) clears it.
PRICE_EOD_SETTLE_HOUR_ET = int(os.getenv('PRICE_EOD_SETTLE_HOUR_ET', '20'))

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


def settled_market_date(now_et: datetime, settle_hour: int = PRICE_EOD_SETTLE_HOUR_ET) -> date:
    """Most recent trading date whose daily bar should be finalized by ``now_et``.

    Before ``settle_hour`` ET the current session's EOD aggregate may still be
    pending at the provider, so we do not demand today's bar until the evening
    run. Weekends step back to Friday. US market holidays are NOT modeled, so on
    a holiday this may name a date with no real bar -- that only yields a benign
    WARNING from the freshness guard, never a failure.
    """
    d = now_et.date()
    if now_et.hour < settle_hour:
        d -= timedelta(days=1)
    while d.weekday() >= 5:  # Saturday=5, Sunday=6
        d -= timedelta(days=1)
    return d


def symbols_behind(latest_by_symbol: dict[str, date | None], expected: date) -> list[str]:
    """Symbols whose newest stored daily bar is missing or older than expected."""
    return sorted(sym for sym, latest in latest_by_symbol.items() if latest is None or latest < expected)


def check_price_freshness(conn, symbols, source, now_et: datetime | None = None) -> list[str]:
    """Warn when the newest stored daily bar lags the expected settled date.

    A missed or late-finalized run used to go unnoticed until the next weekday
    (the Friday 2026-07-17 bar was absent until Monday). This turns that silent
    gap into an observable WARNING; it never raises, so it cannot fail the run.
    """
    if not symbols:
        return []
    now_et = now_et or datetime.now(timezone.utc).astimezone(MARKET_TIMEZONE)
    expected = settled_market_date(now_et)
    with conn.cursor() as cur:
        cur.execute(
            'SELECT symbol, MAX(date) FROM price_history WHERE source = %s AND symbol = ANY(%s) GROUP BY symbol',
            (source, list(symbols)),
        )
        latest = {row[0]: row[1] for row in cur.fetchall()}
    latest_by_symbol = {sym: latest.get(sym) for sym in symbols}
    behind = symbols_behind(latest_by_symbol, expected)
    if behind:
        log.warning(
            f'price freshness: {len(behind)}/{len(symbols)} symbols behind expected {expected}; '
            f'sample={behind[:10]}'
        )
    else:
        log.info(f'price freshness: all {len(symbols)} symbols current to {expected}')
    return behind


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

    try:
        check_price_freshness(conn, watchlist, provider.source)
    except Exception as exc:  # observability only -- never fail the run on the guard
        log.warning(f'price freshness check skipped: {exc}')

    conn.close()
    log.info(
        f'=== Done: daily={total_daily_written}; 30m={total_30m_written}; '
        f'{len(failed)} symbols failed ==='
    )
    if failed:
        log.warning(f'Failed symbols: {failed}')
        raise RuntimeError(f'price collection failed for {len(failed)} symbols: {failed}')
    if os.getenv('DERIVED_VOLATILITY_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes'):
        import derive_volatility
        derive_volatility.run(backfill=False)


if __name__ == '__main__':
    run()
