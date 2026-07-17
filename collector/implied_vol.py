"""Black-Scholes pricing, implied-vol inversion, and constant-maturity ATM IV.

Foundational math for self-deriving IV Rank from Polygon option prices — the
product's path off the Mac-only Tastytrade IV feed. Polygon serves greeks/IV
only on CURRENT snapshots, never historically, so historical ATM IV must be
inverted from historical option prices with Black-Scholes. Pure stdlib, no I/O,
so it is fully unit-testable without network or a database.
"""

from __future__ import annotations

import math
import os

DEFAULT_RISK_FREE_RATE = float(os.getenv('SCAN_RISK_FREE_RATE', '0.045'))

_IV_LOW = 1e-4
_IV_HIGH = 5.0
_IV_PRICE_TOL = 1e-6
_IV_MAX_ITER = 100


def norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_price(spot: float, strike: float, t_years: float, rate: float, sigma: float, is_call: bool) -> float | None:
    """Black-Scholes European option price, or None for non-positive inputs."""
    if spot <= 0 or strike <= 0 or t_years <= 0 or sigma <= 0:
        return None
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * sigma * sigma) * t_years) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    disc = math.exp(-rate * t_years)
    if is_call:
        return spot * norm_cdf(d1) - strike * disc * norm_cdf(d2)
    return strike * disc * norm_cdf(-d2) - spot * norm_cdf(-d1)


def implied_vol_from_price(
    price: float,
    spot: float,
    strike: float,
    t_years: float,
    rate: float = DEFAULT_RISK_FREE_RATE,
    is_call: bool = True,
) -> float | None:
    """Invert Black-Scholes for implied volatility via bisection.

    Returns None when the price is not arbitrage-consistent (below intrinsic or
    above the theoretical maximum), when a solution needs vol beyond _IV_HIGH,
    or when inputs are non-positive. Bisection (not Newton) because it cannot
    diverge and needs no vega — robust for the noisy EOD option prices used in
    the historical backfill.
    """
    if price is None or price <= 0 or spot <= 0 or strike <= 0 or t_years <= 0:
        return None
    disc = math.exp(-rate * t_years)
    intrinsic = max(0.0, spot - strike * disc) if is_call else max(0.0, strike * disc - spot)
    upper = spot if is_call else strike * disc
    if price < intrinsic - 1e-9 or price > upper + 1e-9:
        return None

    lo, hi = _IV_LOW, _IV_HIGH
    price_lo = bs_price(spot, strike, t_years, rate, lo, is_call)
    price_hi = bs_price(spot, strike, t_years, rate, hi, is_call)
    if price_lo is None or price_hi is None:
        return None
    if price <= price_lo:
        return lo
    if price >= price_hi:
        return None  # would require vol above _IV_HIGH; treat as unsolvable

    for _ in range(_IV_MAX_ITER):
        mid = 0.5 * (lo + hi)
        price_mid = bs_price(spot, strike, t_years, rate, mid, is_call)
        if price_mid is None:
            return None
        if abs(price_mid - price) < _IV_PRICE_TOL:
            return mid
        if price_mid < price:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def atm_iv_from_call_put(call_iv: float | None, put_iv: float | None) -> float | None:
    """Average the ATM call and put IV, ignoring missing legs."""
    values = [v for v in (call_iv, put_iv) if v is not None and v > 0]
    if not values:
        return None
    return sum(values) / len(values)


def constant_maturity_iv(points, target_days: float = 30) -> float | None:
    """Interpolate ATM IV to a constant target maturity.

    ``points`` is an iterable of ``(dte_days, iv)``. Interpolation is linear in
    total variance (var = iv**2 * dte) versus DTE, then converted back:
    ``iv_target = sqrt(var_target / target_days)``. Outside the provided range
    the nearest IV is held flat (no variance extrapolation, which could blow up
    near the short end). Returns None when no usable point exists.

    A constant maturity removes the term-structure noise that a floating-DTE ATM
    IV injects, so the day-to-day series is comparable — which is what IV Rank
    (a relative measure over the series) needs to be meaningful.
    """
    clean = sorted(
        (
            (float(dte), float(iv))
            for dte, iv in points
            if dte is not None and iv is not None and float(dte) > 0 and float(iv) > 0
        ),
        key=lambda p: p[0],
    )
    if not clean:
        return None
    if target_days <= clean[0][0]:
        return clean[0][1]
    if target_days >= clean[-1][0]:
        return clean[-1][1]
    for i in range(1, len(clean)):
        dte0, iv0 = clean[i - 1]
        dte1, iv1 = clean[i]
        if dte0 <= target_days <= dte1:
            var0 = iv0 * iv0 * dte0
            var1 = iv1 * iv1 * dte1
            weight = (target_days - dte0) / (dte1 - dte0)
            var_target = var0 + weight * (var1 - var0)
            return math.sqrt(var_target / target_days) if var_target > 0 else None
    return None
