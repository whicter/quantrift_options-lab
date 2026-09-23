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
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector, parse_symbols
from common import load_watchlist
from providers.ib_price_provider import IBPriceProvider
from providers.polygon_price_provider import PolygonPriceProvider, polygon_ticker
from providers.stooq_price_provider import StooqPriceProvider

configure_collector(__file__)
log = logging.getLogger(__name__)

MARKET_TIMEZONE = ZoneInfo('America/New_York')
# ET hour after which the just-closed session's daily bar can be requested.
#
# This was 20, which asserted that the 18:35 PT run (= 21:35 ET) was past the
# provider's settle. Measured 2026-09-17, it is not: the plan answers a request
# for the current session with `403 NOT_AUTHORIZED` -- "Attempted to request
# today's data before end of day" -- and that gate was observed opening at
# ~00:00 ET, i.e. on the FOLLOWING ET calendar date. Hours only run 0..23, so 24
# encodes exactly that: a session is never obtainable on its own ET date. Lower
# it only if the plan's end-of-day moves earlier.
PRICE_EOD_SETTLE_HOUR_ET = int(os.getenv('PRICE_EOD_SETTLE_HOUR_ET', '24'))

DB_URL = os.getenv('DATABASE_URL')
PRICE_PROVIDER = os.getenv('PRICE_PROVIDER', 'polygon').strip().lower()
PRICE_HISTORY_LIMIT = int(os.getenv('PRICE_HISTORY_LIMIT', '400'))
PRICE_30M_LOOKBACK_DAYS = int(os.getenv('PRICE_30M_LOOKBACK_DAYS', '35'))
# Grouped daily answers every symbol from one request, so the incremental fill
# no longer depends on where a symbol sits in the sweep. Off falls back to the
# per-symbol aggregates path for every symbol, which is the pre-2026-09-17
# behaviour.
PRICE_GROUPED_DAILY_ENABLED = os.getenv(
    'PRICE_GROUPED_DAILY_ENABLED', 'true'
).strip().lower() in ('1', 'true', 'yes')
# How many recent sessions the grouped fill covers. More than one so a missed or
# failed run heals itself without waiting for a per-symbol backfill.
PRICE_GROUPED_DAILY_SESSIONS = max(int(os.getenv('PRICE_GROUPED_DAILY_SESSIONS', '5')), 1)
# Close-to-close ratio beyond which a symbol's stored history is re-fetched in
# full. Grouped bars are split-adjusted for their own session only, so a symbol
# that splits would otherwise keep a pre-split history spliced onto a post-split
# bar -- a discontinuity that silently corrupts every moving average built on it.
PRICE_SPLIT_RATIO_THRESHOLD = float(os.getenv('PRICE_SPLIT_RATIO_THRESHOLD', '0.25'))


def load_symbols():
    """Load collection symbols from SYMBOLS override or collector/watchlist.txt."""
    raw_symbols = os.getenv('SYMBOLS')
    if raw_symbols:
        if raw_symbols.strip().lower() in {'watchlist', 'all'}:
            return load_watchlist()
        return parse_symbols(raw_symbols)
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


def fetch_price_rows(provider, symbol, want_daily: bool = True):
    """Per-symbol fetch. ``want_daily`` is False once grouped already covered it.

    Skipping the daily request is the saving: at the configured stock pacing it
    is half of every symbol's cost, and for a symbol whose history is already
    complete it re-fetches 400 bars to learn nothing the grouped fill did not
    already write.
    """
    daily_rows = provider.fetch_daily_bars(symbol, PRICE_HISTORY_LIMIT) if want_daily else []
    fetch_30m = getattr(provider, 'fetch_30m_bars', None)
    intraday_rows = fetch_30m(symbol, PRICE_30M_LOOKBACK_DAYS) if callable(fetch_30m) else []
    if want_daily and not daily_rows:
        raise ValueError('no daily bars returned')
    if provider.source == 'polygon_licensed' and not intraday_rows:
        raise ValueError('no 30-minute bars returned')
    return daily_rows, intraday_rows


def settled_market_date(now_et: datetime, settle_hour: int = PRICE_EOD_SETTLE_HOUR_ET) -> date:
    """Most recent trading date whose daily bar the provider will actually serve.

    Before ``settle_hour`` ET the current session is still refused by the plan,
    so we do not demand today's bar. At the default 24 that is every hour of the
    session's own date: the measured gate opens at ~00:00 ET the next day.
    Weekends step back to Friday. US market holidays are NOT modeled, so on
    a holiday this may name a date with no real bar -- that only yields a benign
    WARNING from the freshness guard, never a failure.
    """
    d = now_et.date()
    if now_et.hour < settle_hour:
        d -= timedelta(days=1)
    while d.weekday() >= 5:  # Saturday=5, Sunday=6
        d -= timedelta(days=1)
    return d


def recent_settled_sessions(now_et: datetime, count: int) -> list[date]:
    """The ``count`` most recent weekday sessions the provider will serve, oldest first."""
    sessions: list[date] = []
    day = settled_market_date(now_et)
    while len(sessions) < count:
        if day.weekday() < 5:
            sessions.append(day)
        day -= timedelta(days=1)
    return list(reversed(sessions))


def fill_daily_from_grouped(conn, provider, symbols, sessions) -> tuple[int, set[date]]:
    """Write the recent daily bars for every symbol, one request per session.

    This is the whole point of the grouped endpoint: the per-symbol sweep issues
    one request per symbol and runs for hours, so it straddled the moment the
    plan starts serving a session and split the universe by alphabetical
    position. Here a session either lands for every symbol or for none, and the
    answer does not depend on how long the rest of the run takes.

    A session the provider refuses is logged and skipped, not raised: the older
    sessions in the window are still worth writing, and the next run retries.
    """
    wanted = {polygon_ticker(sym): sym for sym in symbols}
    written = 0
    covered: set[date] = set()
    for session in sessions:
        try:
            bars = provider.fetch_grouped_daily(session)
        except Exception as exc:
            log.warning(f'grouped daily {session}: skipped ({exc})')
            continue
        # Persist under the name we already store, not the provider's ticker.
        rows = [
            replace(bar, symbol=wanted[ticker])
            for ticker, bar in bars.items()
            if ticker in wanted
        ]
        if not rows:
            log.warning(f'grouped daily {session}: returned {len(bars)} tickers, none ours')
            continue
        written += upsert_price_rows(conn, rows)
        covered.add(session)
        log.info(
            f'grouped daily {session}: {len(rows)}/{len(symbols)} symbols '
            f'from {len(bars)} tickers'
        )
    return written, covered


def symbols_needing_history(conn, symbols, source, earliest_session: date | None) -> list[str]:
    """Symbols whose stored history the grouped fill cannot have made correct.

    Three cases, and only these are worth a 400-day per-symbol request:

    1. Nothing stored -- grouped only ever writes the recent window, so a new
       symbol has no history to extend.
    2. A gap the grouped window does not reach: the newest stored bar predates
       the oldest session just filled, so the series has a hole in between.
    3. A close-to-close discontinuity inside the filled window. Grouped bars are
       adjusted as of their own session, so a split leaves an un-adjusted
       history spliced onto an adjusted bar. Re-fetching re-states the whole
       series on one adjustment basis. A genuine large move triggers this too;
       that costs one redundant request and changes no value.
    """
    if not symbols:
        return []
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH stored AS (
              SELECT symbol, date, close,
                     ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
              FROM price_history
              WHERE source = %s AND symbol = ANY(%s)
            )
            SELECT s.symbol,
                   MAX(s.date) FILTER (WHERE s.rn = 1) AS newest,
                   MAX(s.close) FILTER (WHERE s.rn = 1) AS newest_close,
                   MAX(s.close) FILTER (WHERE s.rn = 2) AS prior_close
            FROM stored s
            GROUP BY s.symbol
            """,
            (source, list(symbols)),
        )
        stored = {row[0]: row[1:] for row in cur.fetchall()}

    needing: list[str] = []
    for symbol in symbols:
        record = stored.get(symbol)
        if record is None:
            needing.append(symbol)
            continue
        newest, newest_close, prior_close = record
        if earliest_session is not None and (newest is None or newest < earliest_session):
            needing.append(symbol)
            continue
        if newest_close and prior_close and float(prior_close) > 0:
            ratio = abs(float(newest_close) / float(prior_close) - 1.0)
            if ratio >= PRICE_SPLIT_RATIO_THRESHOLD:
                log.info(f'{symbol}: close moved {ratio:.0%}; re-fetching full history')
                needing.append(symbol)
    return needing


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

    # Phase 1: bring every symbol's recent daily bars current in a handful of
    # requests, before the long per-symbol sweep can skew who gets them.
    backfill = set(watchlist)
    grouped_ok = PRICE_GROUPED_DAILY_ENABLED and callable(
        getattr(provider, 'fetch_grouped_daily', None)
    )
    if grouped_ok:
        sessions = recent_settled_sessions(
            datetime.now(timezone.utc).astimezone(MARKET_TIMEZONE),
            PRICE_GROUPED_DAILY_SESSIONS,
        )
        try:
            written, covered = fill_daily_from_grouped(conn, provider, watchlist, sessions)
        except Exception as exc:
            conn.rollback()
            log.error(f'grouped daily fill failed; falling back to per-symbol daily: {exc}')
            written, covered = 0, set()
        total_daily_written += written
        if covered:
            try:
                backfill = set(symbols_needing_history(
                    conn, watchlist, provider.source, min(covered)
                ))
            except Exception as exc:
                # Narrowing is an optimisation. If we cannot decide who still
                # needs history, fetch it for everyone rather than skip anyone.
                conn.rollback()
                log.warning(f'history-gap check failed; fetching daily for all symbols: {exc}')
                backfill = set(watchlist)
            log.info(
                f'grouped daily covered {len(covered)}/{len(sessions)} sessions; '
                f'{len(backfill)}/{len(watchlist)} symbols still need a full history fetch'
            )

    # Phase 2: 30-minute bars for every symbol, and the 400-day daily history
    # only for the symbols phase 1 could not make correct.
    for symbol in watchlist:
        want_daily = symbol in backfill
        try:
            daily_rows, intraday_rows = fetch_price_rows(provider, symbol, want_daily=want_daily)
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

    # Derivation runs on whatever prices DID land. It used to sit after an
    # unconditional `raise` on any failure, so a single delisted or illiquid
    # ticker -- routine in a ~300 symbol universe -- discarded HV30/60/90, ATM IV
    # and IV-Rank readiness for EVERY symbol, even though their prices were
    # already committed. The least important item was destroying the most
    # important work, and a universe this size may never have a zero-failure run.
    if os.getenv('DERIVED_VOLATILITY_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes'):
        import derive_volatility
        derive_volatility.run(backfill=False)

    # Still a non-zero exit so the operator/PM2 sees a degraded run -- but only
    # after the derivation that the successful symbols are entitled to.
    if failed:
        raise RuntimeError(f'price collection failed for {len(failed)} symbols: {failed}')


if __name__ == '__main__':
    run()
