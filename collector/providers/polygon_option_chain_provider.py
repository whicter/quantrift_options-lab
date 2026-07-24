from __future__ import annotations

import logging
import math
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests

from .base import OptionChainSnapshot, OptionContractSnapshot, UnderlyingSnapshot
from .polygon_rate_limit import PolygonStockRequestPacer

MARKET_TIMEZONE = ZoneInfo('America/New_York')

log = logging.getLogger(__name__)


class PolygonOptionChainProvider:
    """Polygon.io Options licensed adapter.

    Uses:
      - GET /v2/aggs/ticker/{symbol}/prev  → underlying prev-day close
      - GET /v3/snapshot/options/{symbol}  → full option chain with Greeks + OI
    """

    source = 'polygon_licensed'

    def __init__(self) -> None:
        self.api_key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError('POLYGON_API_KEY is required for PolygonOptionChainProvider')
        self.base_url = 'https://api.polygon.io'
        self.min_dte = int(os.getenv('OPTION_MIN_DTE', '0'))
        self.max_dte = int(os.getenv('OPTION_MAX_DTE', '90'))
        self.strike_window_pct = float(os.getenv('OPTION_STRIKE_WINDOW_PCT', '15'))
        self.max_strikes_per_side = int(os.getenv('OPTION_MAX_STRIKES_PER_SIDE', '20'))
        self.max_contracts = int(os.getenv('OPTION_MAX_CONTRACTS', '500'))
        # Delayed intraday minute spot: off by default because the $29 Options
        # plan returns NOT_AUTHORIZED for it. Enable after a Stocks entitlement
        # upgrade so the underlying reflects an in-session (delayed) price.
        self.intraday_spot_enabled = os.getenv('OPTION_INTRADAY_SPOT_ENABLED', 'false').strip().lower() in ('1', 'true', 'yes')
        self.dte_buckets = _parse_dte_buckets(os.getenv('OPTION_DTE_BUCKETS', '0-14,15-29,30-45,46-60,61-90'))
        self.max_expirations_per_bucket = int(os.getenv('OPTION_MAX_EXPIRATIONS_PER_BUCKET', '2'))
        self.page_limit = min(int(os.getenv('POLYGON_PAGE_LIMIT', '250')), 250)
        # Term structure uses a narrow ATM strike window so even a weekly-dense
        # ETF (SPY/QQQ) returns few contracts per expiry and pagination reaches
        # every expiry in a handful of pages, instead of the main ±15% chain
        # exhausting its contract cap around DTE ~30.
        self.term_structure_strike_pct = float(os.getenv('OPTION_TERM_STRUCTURE_STRIKE_PCT', '4'))
        self.term_structure_max_pages = int(os.getenv('OPTION_TERM_STRUCTURE_MAX_PAGES', '10'))
        # OI-by-strike is a dedicated OI-only wide fetch (no Greeks/quotes, so it
        # is cheap enough to span a much wider strike range than the narrow
        # Greeks-bearing chain that GEX needs). Its window adapts per symbol to
        # the option-implied move (spot * IV * sqrt(t)), because a fixed % or a
        # fixed strike count is wrong by an order of magnitude across the
        # universe (SPY 15% IV vs SOXL 189% IV). Floor/cap bound the strike
        # count so a low-IV name still gets enough strikes and a dense/high-IV
        # one does not explode.
        self.oi_by_strike_enabled = os.getenv('OPTION_OI_BY_STRIKE_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')
        self.oi_window_sigma = float(os.getenv('OPTION_OI_WINDOW_SIGMA', '1.5'))
        self.oi_window_min_pct = float(os.getenv('OPTION_OI_WINDOW_MIN_PCT', '8'))
        self.oi_window_max_pct = float(os.getenv('OPTION_OI_WINDOW_MAX_PCT', '60'))
        self.oi_max_strikes_per_side = int(os.getenv('OPTION_OI_MAX_STRIKES_PER_SIDE', '60'))
        self.oi_min_strikes_per_side = int(os.getenv('OPTION_OI_MIN_STRIKES_PER_SIDE', '15'))
        self.oi_max_pages = int(os.getenv('OPTION_OI_MAX_PAGES', '12'))
        self.oi_default_iv = float(os.getenv('OPTION_OI_DEFAULT_IV', '0.4'))
        self.request_delay = float(os.getenv('POLYGON_REQUEST_DELAY', '0.12'))
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self._session = requests.Session()
        self._session.headers['Authorization'] = f'Bearer {self.api_key}'
        self.stock_pacer = PolygonStockRequestPacer()

    def _fetch_intraday_last(self, symbol: str) -> tuple[float, int] | None:
        """Latest delayed intraday minute-bar (price, epoch_ms), or None.

        Would be the freshest in-session price -- BUT on the current $29 Options
        plan the minute-aggregate endpoint returns NOT_AUTHORIZED even during
        market hours (verified 2026-07-20 11:02 ET), so this is gated OFF by
        default and simply not called. Flip `OPTION_INTRADAY_SPOT_ENABLED=true`
        after upgrading to a Polygon Stocks entitlement; the code then activates
        automatically. Kept because it never raises (empty/unauthorized/error ->
        None) and is the correct place for the future entitlement.
        """
        if not self.intraday_spot_enabled:
            return None
        today = datetime.now(timezone.utc).astimezone(MARKET_TIMEZONE).date()
        url = f'{self.base_url}/v2/aggs/ticker/{symbol.upper()}/range/1/minute/{today.isoformat()}/{today.isoformat()}'
        try:
            self.stock_pacer.wait()
            resp = self._session.get(url, params={'adjusted': 'true', 'sort': 'desc', 'limit': 1}, timeout=self.timeout)
            if getattr(resp, 'status_code', 200) != 200:
                return None
            data = resp.json()
            if data.get('status') not in (None, 'OK', 'DELAYED'):
                return None  # e.g. NOT_AUTHORIZED for real-time; fall back
            results = data.get('results') or []
            if not results:
                return None
            bar = results[0]
            close = bar.get('c')
            return (float(close), int(bar['t'])) if close is not None else None
        except (requests.RequestException, ValueError, KeyError):
            return None

    def fetch_underlying(self, symbol: str, spot_hint: float | None = None) -> UnderlyingSnapshot:
        # Freshest first: a delayed intraday last-trade price during the session.
        # Only when there is no intraday bar (pre-market, after-hours, weekend,
        # holiday) do we use a recent daily close -- either the supplied hint or
        # /prev. A stale daily close must never stand in for an intraday price.
        now = datetime.now(timezone.utc)
        intraday = self._fetch_intraday_last(symbol)
        if intraday is not None:
            price, bar_ms = intraday
            return UnderlyingSnapshot(
                symbol=symbol.upper(),
                price=price, bid=None, ask=None, timestamp=now, source=self.source,
                raw={'price': price, 'endpoint': 'intraday_1m_delayed',
                     'as_of': datetime.fromtimestamp(bar_ms / 1000, tz=timezone.utc).isoformat()},
            )
        if spot_hint is not None:
            return UnderlyingSnapshot(
                symbol=symbol.upper(),
                price=float(spot_hint), bid=None, ask=None, timestamp=now, source=self.source,
                raw={'price': float(spot_hint), 'endpoint': 'db_spot_hint'},
            )
        url = f'{self.base_url}/v2/aggs/ticker/{symbol.upper()}/prev'
        self.stock_pacer.wait()
        resp = self._session.get(url, params={'adjusted': 'true'}, timeout=self.timeout)
        resp.raise_for_status()
        data = resp.json()
        results = data.get('results') or []
        if not results:
            raise RuntimeError(f'Polygon prev agg returned no results for {symbol}')
        bar = results[0]
        return UnderlyingSnapshot(
            symbol=symbol.upper(),
            price=float(bar['c']), bid=None, ask=None, timestamp=now, source=self.source,
            raw={'bar': bar, 'endpoint': 'prev_agg'},
        )

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
        spot_hint: float | None = None,
    ) -> OptionChainSnapshot:
        symbol = symbol.upper()
        snapshot_ts = datetime.now(timezone.utc)
        window_pct = strike_window_pct if strike_window_pct is not None else self.strike_window_pct
        strike_limit = max_strikes_per_side if max_strikes_per_side is not None else self.max_strikes_per_side

        underlying = self.fetch_underlying(symbol, spot_hint=spot_hint)
        if underlying.price is None:
            raise RuntimeError(f'Polygon underlying price unavailable for {symbol}')
        spot = underlying.price

        today = date.today()
        if expirations:
            exp_min = min(expirations)
            exp_max = max(expirations)
        else:
            exp_min = today + timedelta(days=self.min_dte)
            exp_max = today + timedelta(days=self.max_dte)

        strike_low = round(spot * (1 - window_pct / 100), 4)
        strike_high = round(spot * (1 + window_pct / 100), 4)

        params: dict[str, Any] = {
            'expiration_date.gte': exp_min.isoformat(),
            'expiration_date.lte': exp_max.isoformat(),
            'strike_price.gte': strike_low,
            'strike_price.lte': strike_high,
            'limit': self.page_limit,
        }

        raw_results: list[dict] = []
        url: str | None = f'{self.base_url}/v3/snapshot/options/{symbol}'
        current_params: dict | None = params

        while url and len(raw_results) < self.max_contracts * 3:
            resp = self._session.get(url, params=current_params, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            batch = data.get('results') or []
            raw_results.extend(batch)
            next_url = data.get('next_url')
            url = next_url if next_url else None
            current_params = None  # next_url already has all params encoded
            if url and self.request_delay > 0:
                time.sleep(self.request_delay)

        if not expirations and not _raw_has_dte_window(raw_results, today, 30, 45):
            supplement_params = dict(params)
            supplement_params['expiration_date.gte'] = (today + timedelta(days=30)).isoformat()
            supplement_params['expiration_date.lte'] = (today + timedelta(days=45)).isoformat()
            supplement_response = self._session.get(
                f'{self.base_url}/v3/snapshot/options/{symbol}',
                params=supplement_params,
                timeout=self.timeout,
            )
            supplement_response.raise_for_status()
            raw_results.extend(supplement_response.json().get('results') or [])

        raw_results = _deduplicate_raw_contracts(raw_results)

        # Filter to requested specific expirations if provided
        expiration_set = {e for e in expirations} if expirations else None

        contracts: list[OptionContractSnapshot] = []
        for item in raw_results:
            contract = self._parse_contract(symbol, item)
            if contract is None:
                continue
            if expiration_set and contract.expiry not in expiration_set:
                continue
            contracts.append(contract)

        # Term structure via a dedicated narrow-window ATM fetch that reaches
        # every expiry even for weekly-dense ETFs. Best-effort: on any failure,
        # fall back to deriving it from the (contract-capped) main chain rather
        # than failing the snapshot.
        try:
            term_structure = self.fetch_atm_term_structure(symbol, spot)
        except Exception as exc:  # noqa: BLE001 - enrichment must never break the snapshot
            log.warning('%s: ATM term-structure fetch failed (%s); using main-chain fallback', symbol, exc)
            term_structure = build_term_structure(contracts, spot, today)

        if strike_limit:
            contracts = _apply_strike_limit(contracts, spot, strike_limit)

        if not expirations:
            contracts = _select_dte_bucket_contracts(
                contracts,
                today,
                self.dte_buckets,
                self.max_expirations_per_bucket,
            )

        contracts = contracts[:self.max_contracts]

        missing_greeks = sum(1 for c in contracts if c.gamma is None or c.delta is None)
        missing_oi = sum(1 for c in contracts if c.open_interest is None)

        return OptionChainSnapshot(
            symbol=symbol,
            underlying=underlying,
            contracts=contracts,
            snapshot_ts=snapshot_ts,
            source=self.source,
            provider_status='ok' if contracts else 'empty',
            raw_metadata={
                'spot': spot,
                'exp_min': exp_min.isoformat(),
                'exp_max': exp_max.isoformat(),
                'strike_low': strike_low,
                'strike_high': strike_high,
                'raw_result_count': len(raw_results),
                'contract_count': len(contracts),
                'missing_greeks_count': missing_greeks,
                'missing_oi_count': missing_oi,
                'strike_window_pct': window_pct,
                'max_strikes_per_side': strike_limit,
                'selected_expirations': sorted({contract.expiry.isoformat() for contract in contracts}),
                'term_structure_expiry_count': len(term_structure),
            },
            term_structure=term_structure,
        )

    def fetch_atm_term_structure(self, symbol: str, spot: float) -> list[dict]:
        """ATM IV per expiry across 0-max_dte, via a narrow strike window.

        A ±`term_structure_strike_pct` window keeps each expiry to a few dozen
        contracts, so pagination covers every expiry in a few pages even for
        weekly-dense ETFs — unlike the main ±15% chain, whose contract cap stops
        it around DTE ~30 for SPY/QQQ. One extra snapshot request per symbol.
        """
        symbol = symbol.upper()
        if spot is None or spot <= 0:
            return []
        today = date.today()
        exp_min = today + timedelta(days=self.min_dte)
        exp_max = today + timedelta(days=self.max_dte)
        params: dict[str, Any] = {
            'expiration_date.gte': exp_min.isoformat(),
            'expiration_date.lte': exp_max.isoformat(),
            'strike_price.gte': round(spot * (1 - self.term_structure_strike_pct / 100), 4),
            'strike_price.lte': round(spot * (1 + self.term_structure_strike_pct / 100), 4),
            'limit': self.page_limit,
        }
        raw: list[dict] = []
        url: str | None = f'{self.base_url}/v3/snapshot/options/{symbol}'
        current_params: dict | None = params
        pages = 0
        while url and pages < self.term_structure_max_pages:
            resp = self._session.get(url, params=current_params, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            raw.extend(data.get('results') or [])
            url = data.get('next_url') or None
            current_params = None
            pages += 1
            if url and self.request_delay > 0:
                time.sleep(self.request_delay)
        contracts = [c for c in (self._parse_contract(symbol, item) for item in raw) if c is not None]
        return build_term_structure(contracts, spot, today)

    def fetch_oi_by_strike(self, symbol: str, spot: float, iv: float | None = None) -> dict:
        """Wide OI-by-strike + full-chain max pain, via an OI-only fetch.

        The strike window adapts to the symbol's implied move (see
        adaptive_oi_window_pct), then the count is bounded by
        oi_{min,max}_strikes_per_side so a low-IV name still gets enough strikes
        and a dense one is capped. Snapshot results carry OI without needing the
        Greeks/quotes the narrow GEX chain pays for, so this stays cheap even at
        ~50 strikes/side. Returns {points, max_pain, window_pct} or empty on any
        failure -- best effort, never raises into the caller.
        """
        symbol = symbol.upper()
        if not self.oi_by_strike_enabled or spot is None or spot <= 0:
            return {'points': [], 'max_pain': None, 'window_pct': None}
        try:
            window_pct = adaptive_oi_window_pct(
                spot, iv, self.max_dte, n_sigma=self.oi_window_sigma,
                min_pct=self.oi_window_min_pct, max_pct=self.oi_window_max_pct,
                default_iv=self.oi_default_iv,
            )
            today = date.today()
            params: dict[str, Any] = {
                'expiration_date.gte': (today + timedelta(days=self.min_dte)).isoformat(),
                'expiration_date.lte': (today + timedelta(days=self.max_dte)).isoformat(),
                'strike_price.gte': round(spot * (1 - window_pct / 100), 4),
                'strike_price.lte': round(spot * (1 + window_pct / 100), 4),
                'limit': self.page_limit,
            }
            raw: list[dict] = []
            url: str | None = f'{self.base_url}/v3/snapshot/options/{symbol}'
            current_params: dict | None = params
            pages = 0
            while url and pages < self.oi_max_pages:
                self.stock_pacer.wait()
                resp = self._session.get(url, params=current_params, timeout=self.timeout)
                if getattr(resp, 'status_code', 200) != 200:
                    break
                data = resp.json()
                raw.extend(data.get('results') or [])
                url = data.get('next_url') or None
                current_params = None
                pages += 1
                if url and self.request_delay > 0:
                    time.sleep(self.request_delay)
            contracts = [c for c in (self._parse_contract(symbol, item) for item in raw)
                         if c is not None and c.open_interest is not None]
            contracts = _bound_oi_strikes(contracts, spot, self.oi_min_strikes_per_side, self.oi_max_strikes_per_side)
            points = build_oi_by_strike(contracts, spot)
            return {
                'points': points,
                'max_pain': max_pain_from_oi(points),
                'window_pct': round(window_pct, 2),
            }
        except (requests.RequestException, ValueError, KeyError) as exc:
            log.warning('%s: OI-by-strike fetch failed (%s)', symbol, exc)
            return {'points': [], 'max_pain': None, 'window_pct': None}

    def _parse_contract(self, symbol: str, item: dict) -> OptionContractSnapshot | None:
        details = item.get('details') or {}
        expiry_str = details.get('expiration_date')
        strike_raw = details.get('strike_price')
        contract_type = (details.get('contract_type') or '').lower()
        ticker = details.get('ticker') or ''

        if not expiry_str or strike_raw is None or contract_type not in ('call', 'put'):
            return None

        try:
            expiry = date.fromisoformat(expiry_str)
        except ValueError:
            return None

        right = 'C' if contract_type == 'call' else 'P'
        strike = float(strike_raw)

        greeks = item.get('greeks') or {}
        day = item.get('day') or {}
        last_quote = item.get('last_quote') or {}

        iv_raw = item.get('implied_volatility')
        iv = float(iv_raw) if iv_raw is not None else None

        bid = _to_float(last_quote.get('bid'))
        ask = _to_float(last_quote.get('ask'))
        bid_size = _to_int(last_quote.get('bid_size'))
        ask_size = _to_int(last_quote.get('ask_size'))

        last = _to_float(day.get('close'))
        volume = _to_int(day.get('volume'))

        if bid is not None and ask is not None:
            mark = (bid + ask) / 2.0
        elif last_quote.get('midpoint') is not None:
            mark = float(last_quote['midpoint'])
        else:
            mark = None

        oi = item.get('open_interest')
        open_interest = _to_int(oi)

        contract_symbol = f'{symbol}-{expiry.strftime("%Y%m%d")}-{right}-{strike:g}'

        return OptionContractSnapshot(
            symbol=symbol,
            expiry=expiry,
            strike=strike,
            right=right,  # type: ignore[arg-type]
            bid=bid,
            ask=ask,
            last=last,
            mark=mark,
            volume=volume,
            open_interest=open_interest,
            iv=iv,
            delta=_clean_greek(greeks.get('delta')),
            gamma=_clean_greek(greeks.get('gamma')),
            theta=_clean_greek(greeks.get('theta')),
            vega=_clean_greek(greeks.get('vega')),
            rho=None,
            bid_size=bid_size,
            ask_size=ask_size,
            contract_symbol=contract_symbol,
            local_symbol=ticker or None,
            provider_contract_id=ticker or None,
            raw=item,
        )


def adaptive_oi_window_pct(spot: float, iv: float | None, max_dte: int,
                           n_sigma: float = 1.5, min_pct: float = 8.0,
                           max_pct: float = 60.0, default_iv: float = 0.4) -> float:
    """Half-width (percent) of the OI strike window, sized to the implied move.

    An expected 1-sigma move to the furthest expiry is `spot * iv * sqrt(t)`, so
    `n_sigma` of that as a percent of spot is `100 * n_sigma * iv * sqrt(t)`.
    Clamped to [min_pct, max_pct] so a low-IV name (SPY ~15%) still gets a usable
    band and a high-IV one (SOXL ~189%) does not request the whole chain. IV is
    a decimal (0.48 = 48%); a missing IV falls back to `default_iv`.
    """
    iv_val = iv if (iv is not None and iv > 0) else default_iv
    t_years = max(max_dte, 1) / 365.0
    pct = 100.0 * n_sigma * iv_val * math.sqrt(t_years)
    return max(min_pct, min(max_pct, pct))


def _bound_oi_strikes(contracts, spot: float, min_per_side: int, max_per_side: int):
    """Keep at most `max_per_side` distinct strikes on each side of spot. The
    adaptive window already sets the reach; this caps the count so a dense chain
    (SPY $1 strikes) does not blow past the intended strike budget. min_per_side
    is advisory — if the window returned fewer, we keep what exists."""
    below = sorted({c.strike for c in contracts if c.strike is not None and c.strike <= spot}, reverse=True)[:max_per_side]
    above = sorted({c.strike for c in contracts if c.strike is not None and c.strike > spot})[:max_per_side]
    keep = set(below) | set(above)
    return [c for c in contracts if c.strike in keep]


def build_oi_by_strike(contracts, spot: float) -> list[dict]:
    """Aggregate OI per strike across expiries: [{strike, call_oi, put_oi,
    total_oi}], sorted by strike. `contracts` may carry only OI (no Greeks)."""
    if not contracts or spot is None or spot <= 0:
        return []
    by_strike: dict = {}
    for c in contracts:
        if c.strike is None or c.open_interest is None or c.open_interest < 0:
            continue
        row = by_strike.setdefault(c.strike, {'strike': c.strike, 'call_oi': 0, 'put_oi': 0, 'total_oi': 0})
        if c.right == 'C':
            row['call_oi'] += c.open_interest
        elif c.right == 'P':
            row['put_oi'] += c.open_interest
        row['total_oi'] += c.open_interest
    return [by_strike[k] for k in sorted(by_strike)]


def max_pain_from_oi(oi_by_strike: list[dict], contract_multiplier: int = 100) -> float | None:
    """Full-chain max-pain strike: the strike minimizing total option-holder
    intrinsic payout, summed over every strike's call and put OI. Needs the wide
    OI set (a near-money slice gives only a local estimate)."""
    rows = [r for r in (oi_by_strike or []) if r.get('strike') is not None]
    if not rows:
        return None
    strikes = sorted(r['strike'] for r in rows)
    best_strike = None
    best_pain = None
    for candidate in strikes:
        pain = 0.0
        for r in rows:
            k = r['strike']
            pain += max(candidate - k, 0) * (r.get('call_oi') or 0) * contract_multiplier
            pain += max(k - candidate, 0) * (r.get('put_oi') or 0) * contract_multiplier
        if best_pain is None or pain < best_pain:
            best_pain = pain
            best_strike = candidate
    return best_strike


def build_term_structure(
    contracts: list[OptionContractSnapshot],
    spot: float,
    today: date | None = None,
) -> list[dict]:
    """ATM IV per expiry from the full fetched contract set.

    For each expiry, pick the strike nearest spot that has a positive IV, and
    average the call and put IV at that strike. Computed BEFORE DTE-bucket
    trimming so the term structure spans every expiry Polygon returned, not just
    the few strikes stored for GEX. Pure and unit-testable.
    """
    if not contracts or spot is None or spot <= 0:
        return []
    today = today or date.today()
    by_expiry: dict = {}
    for c in contracts:
        if c.iv is None or c.iv <= 0 or c.strike is None:
            continue
        by_expiry.setdefault(c.expiry, []).append(c)

    rows: list[dict] = []
    for expiry in sorted(by_expiry):
        legs = by_expiry[expiry]
        nearest = min(abs(c.strike - spot) for c in legs)
        atm = [c for c in legs if abs(c.strike - spot) == nearest]
        atm_strike = atm[0].strike
        call_iv = next((c.iv for c in atm if c.right == 'C'), None)
        put_iv = next((c.iv for c in atm if c.right == 'P'), None)
        ivs = [v for v in (call_iv, put_iv) if v is not None and v > 0]
        if not ivs:
            continue
        rows.append({
            'expiration_date': expiry.isoformat(),
            'dte': (expiry - today).days,
            'atm_strike': atm_strike,
            'atm_iv': sum(ivs) / len(ivs),
            'atm_call_iv': call_iv,
            'atm_put_iv': put_iv,
            'contract_count': len(legs),
        })
    return rows


def _apply_strike_limit(
    contracts: list[OptionContractSnapshot],
    spot: float,
    max_per_side: int,
) -> list[OptionContractSnapshot]:
    from collections import defaultdict

    groups: dict[tuple, list[OptionContractSnapshot]] = defaultdict(list)
    for c in contracts:
        groups[(c.expiry, c.right)].append(c)

    result: list[OptionContractSnapshot] = []
    for group in groups.values():
        sorted_group = sorted(group, key=lambda c: abs(c.strike - spot))
        result.extend(sorted_group[:max_per_side])

    return sorted(result, key=lambda c: (c.expiry, c.strike, c.right))


def _parse_dte_buckets(value: str) -> list[tuple[int, int]]:
    buckets = []
    for part in value.split(','):
        bounds = part.strip().split('-', 1)
        if len(bounds) != 2:
            continue
        try:
            lower, upper = int(bounds[0]), int(bounds[1])
        except ValueError:
            continue
        if lower >= 0 and upper >= lower:
            buckets.append((lower, upper))
    return buckets or [(0, 14), (15, 29), (30, 45), (46, 60), (61, 90)]


def _select_dte_bucket_contracts(
    contracts: list[OptionContractSnapshot],
    today: date,
    buckets: list[tuple[int, int]],
    max_expirations_per_bucket: int,
) -> list[OptionContractSnapshot]:
    expirations = sorted({contract.expiry for contract in contracts})
    selected = set()
    for lower, upper in buckets:
        midpoint = (lower + upper) / 2
        candidates = [expiry for expiry in expirations if lower <= (expiry - today).days <= upper]
        candidates.sort(key=lambda expiry: (abs((expiry - today).days - midpoint), expiry))
        selected.update(candidates[:max(max_expirations_per_bucket, 1)])
    return [contract for contract in contracts if contract.expiry in selected]


def _raw_has_dte_window(raw_results: list[dict], today: date, lower: int, upper: int) -> bool:
    for item in raw_results:
        expiry_value = (item.get('details') or {}).get('expiration_date')
        if not expiry_value:
            continue
        try:
            dte = (date.fromisoformat(expiry_value) - today).days
        except ValueError:
            continue
        if lower <= dte <= upper:
            return True
    return False


def _deduplicate_raw_contracts(raw_results: list[dict]) -> list[dict]:
    seen = set()
    deduplicated = []
    for item in raw_results:
        details = item.get('details') or {}
        key = details.get('ticker') or (
            details.get('expiration_date'),
            details.get('strike_price'),
            details.get('contract_type'),
        )
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(item)
    return deduplicated


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _clean_greek(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if abs(f) > 1e10:
        return None
    return f
