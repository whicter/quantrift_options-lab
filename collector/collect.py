"""
IV data collector — runs daily at 4:30pm ET via cron.

Collects from Tastytrade API:
  - IV Rank, IV Percentile, IVx (iv30), HV30/60/90, IV-HV diff
  - Earnings date, term structure

Writes to Railway PostgreSQL: iv_history table.

Cron entry (Mac Studio, 4:30pm ET = 8:30pm UTC — adjust for DST):
  30 20 * * 1-5 cd /path/to/collector && /path/to/venv/bin/python collect.py >> logs/collect.log 2>&1
"""

import os
import json
import logging
from datetime import date, datetime
from typing import Optional

import requests
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

from auth import get_session_token

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

TT_BASE  = 'https://api.tastyworks.com'
DB_URL   = os.getenv('DATABASE_URL')

# All symbols to collect daily. Edit this list as your watchlist grows.
WATCHLIST = [
    'AAPL', 'SPY', 'QQQ', 'TSLA', 'MSFT',
    'XOM', 'GLD', 'NVDA', 'AMD', 'AMZN',
    'META', 'GOOGL', 'NFLX', 'BA', 'JPM',
    'GS', 'TLT', 'IWM', 'SMH', 'XLE',
    'VIX',
]

# Tastytrade batch limit
TT_BATCH = 50


def fetch_metrics(session_token: str, symbols: list[str]) -> dict:
    """
    Fetch /market-metrics for up to TT_BATCH symbols.
    Returns dict keyed by symbol.
    """
    params = ','.join(symbols)
    resp = requests.get(
        f'{TT_BASE}/market-metrics',
        headers={'Authorization': session_token},
        params={'symbols': params},
        timeout=30,
    )
    resp.raise_for_status()
    items = resp.json()['data']['items']
    return {item['symbol']: item for item in items}


def parse_row(symbol: str, item: dict, today: date) -> dict:
    """Parse a raw Tastytrade market-metrics item into a DB row dict."""

    def _f(key, default=None):
        v = item.get(key)
        if v is None or v == '':
            return default
        try:
            return float(v)
        except (ValueError, TypeError):
            return default

    iv30_pct   = _f('implied-volatility-30-day')        # e.g. 27.16 (%)
    hv30_pct   = _f('historical-volatility-30-day')
    hv60_pct   = _f('historical-volatility-60-day')
    hv90_pct   = _f('historical-volatility-90-day')
    iv_hv_diff = _f('iv-hv-30-day-difference')          # percentage points
    iv_rank_raw = _f('implied-volatility-index-rank')   # 0-1 → ×100
    iv_pct_raw  = _f('implied-volatility-percentile')   # 0-1 → ×100

    # Convert to decimal for storage consistency (div by 100)
    iv30  = iv30_pct  / 100 if iv30_pct  is not None else None
    hv30  = hv30_pct  / 100 if hv30_pct  is not None else None
    hv60  = hv60_pct  / 100 if hv60_pct  is not None else None
    hv90  = hv90_pct  / 100 if hv90_pct  is not None else None
    iv_hv = iv_hv_diff / 100 if iv_hv_diff is not None else None

    iv_rank = round(iv_rank_raw * 100, 2) if iv_rank_raw is not None else None
    iv_pct  = round(iv_pct_raw  * 100, 2) if iv_pct_raw  is not None else None

    # Earnings date
    earnings_date: Optional[date] = None
    earnings = item.get('earnings') or {}
    raw_date = earnings.get('expected-report-date')
    if raw_date:
        try:
            earnings_date = datetime.strptime(raw_date, '%Y-%m-%d').date()
        except ValueError:
            pass

    # Term structure as JSONB list
    term_raw  = item.get('option-expiration-implied-volatilities') or []
    term_data = [
        {'expiration_date': t['expiration-date'],
         'iv': float(t['implied-volatility'])}
        for t in term_raw
        if t.get('expiration-date') and t.get('implied-volatility')
    ]

    return {
        'symbol':         symbol,
        'date':           today,
        'iv30':           iv30,
        'hv30':           hv30,
        'hv60':           hv60,
        'hv90':           hv90,
        'iv_rank':        iv_rank,
        'iv_percentile':  iv_pct,
        'iv_hv_diff':     iv_hv,
        'earnings_date':  earnings_date,
        'term_structure': json.dumps(term_data) if term_data else None,
        'source':         'tastytrade',
    }


def upsert_rows(conn, rows: list[dict]):
    """Upsert rows into iv_history (ON CONFLICT DO UPDATE)."""
    if not rows:
        return

    cols = [
        'symbol', 'date', 'iv30', 'hv30', 'hv60', 'hv90',
        'iv_rank', 'iv_percentile', 'iv_hv_diff',
        'earnings_date', 'term_structure', 'source',
    ]
    values = [tuple(r[c] for c in cols) for r in rows]

    update_cols = [c for c in cols if c not in ('symbol', 'date')]
    update_set  = ', '.join(f'{c} = EXCLUDED.{c}' for c in update_cols)

    sql = f"""
        INSERT INTO iv_history ({', '.join(cols)})
        VALUES %s
        ON CONFLICT (symbol, date) DO UPDATE SET {update_set}
    """

    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def run():
    log.info('=== IV Collector starting ===')
    today = date.today()

    # Auth
    session_token = get_session_token()

    # DB connection
    conn = psycopg2.connect(DB_URL)
    log.info('DB connected')

    total_written = 0
    errors = []

    # Batch fetch (TT allows up to 50 per request)
    for i in range(0, len(WATCHLIST), TT_BATCH):
        batch = WATCHLIST[i:i + TT_BATCH]
        log.info(f'Fetching metrics for: {", ".join(batch)}')

        try:
            metrics = fetch_metrics(session_token, batch)
        except Exception as e:
            log.error(f'Tastytrade fetch failed for batch {batch}: {e}')
            errors.extend(batch)
            continue

        rows = []
        for symbol in batch:
            item = metrics.get(symbol)
            if not item:
                log.warning(f'No data returned for {symbol}')
                errors.append(symbol)
                continue
            try:
                row = parse_row(symbol, item, today)
                rows.append(row)
            except Exception as e:
                log.error(f'Parse error for {symbol}: {e}')
                errors.append(symbol)

        if rows:
            try:
                upsert_rows(conn, rows)
                total_written += len(rows)
                log.info(f'Wrote {len(rows)} rows')
            except Exception as e:
                log.error(f'DB upsert failed: {e}')
                conn.rollback()

    conn.close()
    log.info(f'=== Done: {total_written} rows written, {len(errors)} errors ===')
    if errors:
        log.warning(f'Failed symbols: {errors}')


if __name__ == '__main__':
    run()
