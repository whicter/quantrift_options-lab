"""Short interest and short volume, FINRA-sourced through Polygon.

Licence note, because it decides the whole design: FINRA's own terms forbid
both building a derived database and any use inside a fee-charging product, so
direct access is not an option for this project. Polygon redistributes the same
FINRA data under its own licence, which is why this collector points there and
must keep pointing there.

Two datasets that must not be conflated:

  short_interest  bi-weekly settlement snapshot -- accumulated positioning.
                  Carries the API's own days_to_cover, which needs no float.
  short_volume    daily T+1 -- shares sold short during the session. Mostly
                  market-maker inventory that closes the same day, so a high
                  ratio reads as activity, not as accumulated bearish bets.

Both endpoints return the whole market in one page (22k and 15k tickers when
measured on 2026-08-09), so this is two API calls, not one per symbol. Writes
are restricted to symbols in symbol_universe -- storing 22k tickers to serve
~330 would be most of a table for none of the product.

CLI: python collect_short_interest.py [--skip-interest] [--skip-volume]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any

from datetime import date, timedelta

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
API_KEY = os.getenv('POLYGON_API_KEY', '').strip()
BASE = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io')
SOURCE = 'polygon_finra'
PAGE_LIMIT = int(os.getenv('SHORT_DATA_PAGE_LIMIT', '50000'))
MAX_PAGES = int(os.getenv('SHORT_DATA_MAX_PAGES', '10'))
# Short interest settles bi-weekly, so 60 days keeps ~4 settlements and still
# fills in after a missed run. Short volume is daily T+1; 10 days is the same
# idea at the daily cadence.
SHORT_INTEREST_LOOKBACK_DAYS = int(os.getenv('SHORT_INTEREST_LOOKBACK_DAYS', '60'))
SHORT_VOLUME_LOOKBACK_DAYS = int(os.getenv('SHORT_VOLUME_LOOKBACK_DAYS', '10'))


# This is a BYPASS path: it does not go through the shared provider_rate_limits
# gate that paces the main collector, so it carries its own retry -- the same
# treatment backfill_iv_history.py needed. Polygon's paid plan has no monthly
# quota but does rate-limit per second, and a cursor loop over a full-market
# endpoint hits that within a couple of pages (observed on the first run here).
MAX_RETRIES = int(os.getenv('SHORT_DATA_MAX_RETRIES', '5'))
BACKOFF_BASE_SECONDS = float(os.getenv('SHORT_DATA_BACKOFF_BASE_SECONDS', '8'))
BACKOFF_MAX_SECONDS = float(os.getenv('SHORT_DATA_BACKOFF_MAX_SECONDS', '60'))
PAGE_DELAY_SECONDS = float(os.getenv('SHORT_DATA_PAGE_DELAY_SECONDS', '1.5'))


def _open(url: str, what: str) -> dict:
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES - 1:
                wait = min(BACKOFF_BASE_SECONDS * (attempt + 1), BACKOFF_MAX_SECONDS)
                log.warning('%s: HTTP %s, backing off %.0fs (attempt %s/%s)',
                            what, exc.code, wait, attempt + 1, MAX_RETRIES)
                time.sleep(wait)
                continue
            body = ''
            try:
                body = exc.read().decode()[:200]
            except Exception:  # noqa: BLE001 - error detail is best effort
                pass
            raise RuntimeError(f'{what} returned HTTP {exc.code}: {body}') from exc
    raise RuntimeError(f'{what}: retries exhausted')


def _get(path: str, params: dict[str, Any]) -> dict:
    query = '&'.join(f'{k}={v}' for k, v in {**params, 'apiKey': API_KEY}.items())
    return _open(f'{BASE}{path}?{query}', path)


def fetch_all(path: str, params: dict[str, Any]) -> list[dict]:
    """Follow next_url, bounded and paced. An unbounded cursor loop against a
    full-market endpoint is how a collector quietly turns into a runaway."""
    results: list[dict] = []
    body = _get(path, {**params, 'limit': PAGE_LIMIT})
    results.extend(body.get('results') or [])
    pages = 1
    while body.get('next_url') and pages < MAX_PAGES:
        time.sleep(PAGE_DELAY_SECONDS)
        body = _open(f"{body['next_url']}&apiKey={API_KEY}", f'{path} page {pages + 1}')
        results.extend(body.get('results') or [])
        pages += 1
    if body.get('next_url'):
        log.warning('%s: stopped at %s pages with a cursor still open; '
                    'rows beyond this are not collected', path, pages)
    return results


def universe_symbols(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute('SELECT symbol FROM symbol_universe WHERE active')
        return {r[0] for r in cur.fetchall()}


def _num(value: Any) -> Any:
    return value if isinstance(value, (int, float)) else None


def collect_short_interest(conn, universe: set[str]) -> dict[str, Any]:
    # A date lower bound is mandatory, not an optimisation. Unfiltered, the
    # endpoint returns full history back to 2017 ordered by ticker, so a bounded
    # page walk collects the complete history of the first few dozen tickers
    # alphabetically and never reaches the rest -- the first run here pulled
    # 500k rows covering 47 of 329 universe symbols. `sort`/`order` are ignored
    # by this endpoint; the date filter is the only lever that works.
    since = (date.today() - timedelta(days=SHORT_INTEREST_LOOKBACK_DAYS)).isoformat()
    rows = fetch_all('/stocks/v1/short-interest', {'settlement_date.gte': since})
    kept = [
        (r['ticker'], r['settlement_date'], _num(r.get('short_interest')),
         _num(r.get('avg_daily_volume')), _num(r.get('days_to_cover')), SOURCE)
        for r in rows
        if r.get('ticker') in universe and r.get('settlement_date')
    ]
    if kept:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO short_interest_history
                  (ticker, settlement_date, short_interest, avg_daily_volume,
                   days_to_cover, source)
                VALUES %s
                ON CONFLICT (ticker, settlement_date) DO UPDATE SET
                  short_interest = EXCLUDED.short_interest,
                  avg_daily_volume = EXCLUDED.avg_daily_volume,
                  days_to_cover = EXCLUDED.days_to_cover,
                  source = EXCLUDED.source
                """,
                kept, page_size=len(kept),
            )
            written = cur.rowcount
        conn.commit()
    else:
        written = 0
    return {'fetched': len(rows), 'in_universe': len(kept), 'written': written}


def collect_short_volume(conn, universe: set[str]) -> dict[str, Any]:
    since = (date.today() - timedelta(days=SHORT_VOLUME_LOOKBACK_DAYS)).isoformat()
    rows = fetch_all('/stocks/v1/short-volume', {'date.gte': since})
    kept = [
        (r['ticker'], r['date'], _num(r.get('total_volume')), _num(r.get('short_volume')),
         _num(r.get('short_volume_ratio')), _num(r.get('exempt_volume')),
         _num(r.get('non_exempt_volume')), SOURCE)
        for r in rows
        if r.get('ticker') in universe and r.get('date')
    ]
    if kept:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO short_volume_history
                  (ticker, market_date, total_volume, short_volume, short_volume_ratio,
                   exempt_volume, non_exempt_volume, source)
                VALUES %s
                ON CONFLICT (ticker, market_date) DO UPDATE SET
                  total_volume = EXCLUDED.total_volume,
                  short_volume = EXCLUDED.short_volume,
                  short_volume_ratio = EXCLUDED.short_volume_ratio,
                  exempt_volume = EXCLUDED.exempt_volume,
                  non_exempt_volume = EXCLUDED.non_exempt_volume,
                  source = EXCLUDED.source
                """,
                kept, page_size=len(kept),
            )
            written = cur.rowcount
        conn.commit()
    else:
        written = 0
    return {'fetched': len(rows), 'in_universe': len(kept), 'written': written}


def attach_to_squeeze_watch(conn) -> int:
    """Fill today's squeeze_watch rows with the latest settled short interest.

    Only common stock is touched. ETF short interest routinely exceeds 100% of
    shares outstanding because creation/redemption makes supply elastic and
    market makers hold a bona-fide naked-short exemption -- measured 2026-08-09,
    XBI at 114% and KBE at 66%. Those are not squeeze pressure, and carrying
    them into a squeeze table would be a category error.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE squeeze_watch w
               SET days_to_cover = si.days_to_cover
              FROM (
                SELECT DISTINCT ON (ticker) ticker, days_to_cover
                FROM short_interest_history
                ORDER BY ticker, settlement_date DESC
              ) si
              JOIN symbol_universe u ON u.symbol = si.ticker
             WHERE w.symbol = si.ticker
               AND u.asset_type = 'stock'
               AND w.resolved_at IS NULL
            """
        )
        n = cur.rowcount
    conn.commit()
    return n


def run(skip_interest: bool = False, skip_volume: bool = False) -> dict[str, Any]:
    if not DB_URL:
        raise RuntimeError('DATABASE_URL is required')
    if not API_KEY:
        raise RuntimeError('POLYGON_API_KEY is required')
    conn = psycopg2.connect(DB_URL)
    result: dict[str, Any] = {}
    try:
        universe = universe_symbols(conn)
        result['universe'] = len(universe)
        if not skip_interest:
            result['short_interest'] = collect_short_interest(conn, universe)
        if not skip_volume:
            result['short_volume'] = collect_short_volume(conn, universe)
        result['squeeze_watch_updated'] = attach_to_squeeze_watch(conn)
    finally:
        conn.close()
    log.info('short data collection: %s', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Collect FINRA short interest/volume via Polygon')
    parser.add_argument('--skip-interest', action='store_true')
    parser.add_argument('--skip-volume', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.skip_interest, args.skip_volume), indent=2))
