"""Backfill historical ATM IV into volatility_history by BS-inverting Polygon
option prices.

Polygon serves greeks/IV only on current snapshots, never historically, so the
252-day IV history that IV Rank needs is reconstructed here: for each symbol and
past trading day, pick the ATM call+put at the two expiries bracketing 30 DTE,
take that day's EOD option price from Polygon aggregates, invert Black-Scholes
(implied_vol.py), average call+put, and interpolate to a constant 30-day
maturity. The result is written to volatility_history.atm_iv; the existing
derive_volatility readiness step then computes IV Rank from the series.

Pure helpers (occ_ticker, nearest_strike, select_bracketing_expiries,
volatility_row) carry the logic and are unit-tested without network. The
PolygonHistory client and backfill_symbol do the I/O.

CLI: python backfill_iv_history.py [SYMBOL ...] [--days N]
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import date, datetime, timedelta

import requests
from psycopg2.extras import execute_values

from implied_vol import (
    DEFAULT_RISK_FREE_RATE,
    atm_iv_from_call_put,
    constant_maturity_iv,
    implied_vol_from_price,
)

log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
TARGET_DTE = 30
EXP_WINDOW_LO_DAYS = 10   # look for expiries from as_of+10 ...
EXP_WINDOW_HI_DAYS = 55   # ... to as_of+55, so 30 DTE is always bracketed
BACKFILL_SOURCE = 'polygon_backfill_bs'


# ---------------------------------------------------------------------------
# Pure helpers (no I/O)
# ---------------------------------------------------------------------------

def occ_ticker(symbol: str, expiry: date, strike: float, is_call: bool) -> str:
    """OCC option ticker, e.g. O:AAPL250718C00090000 (strike 90 -> 00090000)."""
    return f"O:{symbol.upper()}{expiry.strftime('%y%m%d')}{'C' if is_call else 'P'}{round(strike * 1000):08d}"


def nearest_strike(strikes, spot: float):
    usable = strikes_by_distance(strikes, spot, limit=1)
    return usable[0] if usable else None


def strikes_by_distance(strikes, spot: float, limit: int = 5) -> list:
    """Listed strikes sorted nearest-to-spot first. The exact ATM strike is often
    an illiquid $0.50 line with no daily aggregate bar, so the caller walks
    outward from ATM to the first strike that actually has a price."""
    usable = [float(s) for s in strikes if s is not None and float(s) > 0]
    if not usable or spot is None or spot <= 0:
        return []
    return sorted(usable, key=lambda s: abs(s - spot))[:limit]


def select_bracketing_expiries(expiries, as_of: date, target_dte: int = TARGET_DTE) -> list:
    """Up to two expiries bracketing as_of + target_dte in DTE (nearest below and
    nearest above). One side only when the target sits outside the range."""
    future = sorted(e for e in expiries if e is not None and e > as_of)
    if not future:
        return []
    exact = [e for e in future if (e - as_of).days == target_dte]
    if exact:
        return [exact[0]]  # sits exactly at the target; no interpolation needed
    below = [e for e in future if (e - as_of).days < target_dte]
    above = [e for e in future if (e - as_of).days > target_dte]
    picks: list = []
    if below:
        picks.append(below[-1])
    if above:
        picks.append(above[0])
    return picks


def volatility_row(symbol, metric_date, iv30, expiry, strike, dte, source=BACKFILL_SOURCE):
    return {
        'symbol': symbol, 'metric_date': metric_date, 'atm_iv': iv30,
        'atm_expiry': expiry, 'atm_strike': strike, 'atm_dte': dte,
        'iv_source': source,
    }


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

class PolygonHistory:
    def __init__(self):
        self.key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.key:
            raise RuntimeError('POLYGON_API_KEY is required for backfill')
        self.base = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io').rstrip('/')
        self.session = requests.Session()
        self.session.headers['Authorization'] = f'Bearer {self.key}'
        self._grid_cache: dict = {}

    def _get(self, path, params=None):
        resp = self.session.get(self.base + path, params=params, timeout=25)
        resp.raise_for_status()
        return resp.json()

    def underlying_closes(self, symbol: str, start: date, end: date) -> dict:
        """{date: close} for the underlying over [start, end] from Polygon daily aggs."""
        data = self._get(
            f'/v2/aggs/ticker/{symbol.upper()}/range/1/day/{start.isoformat()}/{end.isoformat()}',
            {'adjusted': 'true', 'limit': 50000},
        )
        out = {}
        for bar in data.get('results') or []:
            bar_date = datetime.utcfromtimestamp(bar['t'] / 1000).date()
            out[bar_date] = float(bar['c'])
        return out

    def expiry_strike_grid(self, symbol: str, exp_gte: date, exp_lte: date) -> dict:
        """{expiry_date: sorted[strikes]} for calls in the window (calls and puts
        share strikes). Cached per (symbol, window)."""
        cache_key = (symbol.upper(), exp_gte, exp_lte)
        if cache_key in self._grid_cache:
            return self._grid_cache[cache_key]
        grid: dict = {}
        # A backfill window spans both sides of "now": old days' 30-DTE expiries
        # are already expired, recent days' are still active. `expired` selects
        # one or the other, so query both and merge.
        for expired in ('true', 'false'):
            data = self._get('/v3/reference/options/contracts', {
                'underlying_ticker': symbol.upper(),
                'expiration_date.gte': exp_gte.isoformat(),
                'expiration_date.lte': exp_lte.isoformat(),
                'expired': expired, 'contract_type': 'call', 'limit': 1000,
            })
            for c in data.get('results') or []:
                expiry = date.fromisoformat(c['expiration_date'])
                grid.setdefault(expiry, set()).add(float(c['strike_price']))
        grid = {e: sorted(s) for e, s in grid.items()}
        self._grid_cache[cache_key] = grid
        return grid

    def option_close(self, ticker: str, day: date):
        data = self._get(
            f'/v2/aggs/ticker/{ticker}/range/1/day/{day.isoformat()}/{day.isoformat()}',
            {'adjusted': 'true', 'limit': 1},
        )
        res = data.get('results') or []
        return float(res[0]['c']) if res else None


def compute_day_iv30(poly: PolygonHistory, symbol: str, spot: float, as_of: date,
                     rate: float = DEFAULT_RISK_FREE_RATE):
    """Constant-30-day ATM IV for one symbol-day, or (None, None, []) when it
    cannot be built from available prices."""
    grid = poly.expiry_strike_grid(
        symbol, as_of + timedelta(days=EXP_WINDOW_LO_DAYS), as_of + timedelta(days=EXP_WINDOW_HI_DAYS),
    )
    points = []
    chosen = None
    for expiry in select_bracketing_expiries(list(grid), as_of):
        dte = (expiry - as_of).days
        t_years = dte / 365.0
        atm_iv = None
        used_strike = None
        # Walk outward from the ATM strike until one has a traded price that day.
        for strike in strikes_by_distance(grid[expiry], spot, limit=5):
            call_price = poly.option_close(occ_ticker(symbol, expiry, strike, True), as_of)
            put_price = poly.option_close(occ_ticker(symbol, expiry, strike, False), as_of)
            call_iv = implied_vol_from_price(call_price, spot, strike, t_years, rate, True) if call_price else None
            put_iv = implied_vol_from_price(put_price, spot, strike, t_years, rate, False) if put_price else None
            atm_iv = atm_iv_from_call_put(call_iv, put_iv)
            if atm_iv:
                used_strike = strike
                break
        if atm_iv:
            points.append((dte, atm_iv))
            if chosen is None:
                chosen = (expiry, used_strike, dte)
    return constant_maturity_iv(points, TARGET_DTE), chosen, points


def upsert_backfill_rows(conn, rows: list) -> int:
    if not rows:
        return 0
    values = [(
        r['symbol'], r['metric_date'], r['atm_iv'], r['atm_expiry'],
        r['atm_strike'], r['atm_dte'], r['iv_source'],
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO volatility_history
              (symbol, metric_date, atm_iv, atm_expiry, atm_strike, atm_dte, iv_source)
            VALUES %s
            ON CONFLICT (symbol, metric_date) DO UPDATE SET
              atm_iv = EXCLUDED.atm_iv,
              atm_expiry = EXCLUDED.atm_expiry,
              atm_strike = EXCLUDED.atm_strike,
              atm_dte = EXCLUDED.atm_dte,
              iv_source = EXCLUDED.iv_source,
              updated_at = NOW()
            """,
            values,
        )
    conn.commit()
    return len(rows)


def backfill_symbol(conn, poly: PolygonHistory, symbol: str, start: date, end: date) -> dict:
    """Backfill one symbol over [start, end]. Weekends/holidays self-filter (no
    underlying bar -> skipped)."""
    closes = poly.underlying_closes(symbol, start, end)
    rows = []
    for day in sorted(closes):
        spot = closes[day]
        try:
            iv30, chosen, _points = compute_day_iv30(poly, symbol, spot, day)
        except requests.RequestException as err:
            log.warning('%s %s: provider error %s', symbol, day, err)
            continue
        if iv30 and chosen:
            expiry, strike, dte = chosen
            rows.append(volatility_row(symbol, day, round(iv30, 6), expiry, strike, dte))
    written = upsert_backfill_rows(conn, rows) if conn is not None else 0
    return {'symbol': symbol, 'days': len(closes), 'computed': len(rows), 'written': written}


def run(symbols: list, days: int) -> None:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    import psycopg2  # local import so unit tests need no DB driver connection
    end = datetime.utcnow().date()
    start = end - timedelta(days=days)
    poly = PolygonHistory()
    conn = psycopg2.connect(DB_URL)
    try:
        for symbol in symbols:
            result = backfill_symbol(conn, poly, symbol, start, end)
            log.info('backfill %s', result)
    finally:
        conn.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        datefmt='%Y-%m-%d %H:%M:%S')
    parser = argparse.ArgumentParser()
    parser.add_argument('symbols', nargs='*', default=['AAPL'])
    parser.add_argument('--days', type=int, default=400)  # ~400 calendar days ~= 252 trading days
    args = parser.parse_args()
    run(args.symbols or ['AAPL'], args.days)
