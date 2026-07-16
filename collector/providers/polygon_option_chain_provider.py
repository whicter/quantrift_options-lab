from __future__ import annotations

import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

from .base import OptionChainSnapshot, OptionContractSnapshot, UnderlyingSnapshot
from .polygon_rate_limit import PolygonStockRequestPacer


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
        self.dte_buckets = _parse_dte_buckets(os.getenv('OPTION_DTE_BUCKETS', '0-14,15-29,30-45,46-60,61-90'))
        self.max_expirations_per_bucket = int(os.getenv('OPTION_MAX_EXPIRATIONS_PER_BUCKET', '2'))
        self.page_limit = min(int(os.getenv('POLYGON_PAGE_LIMIT', '250')), 250)
        self.request_delay = float(os.getenv('POLYGON_REQUEST_DELAY', '0.12'))
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self._session = requests.Session()
        self._session.headers['Authorization'] = f'Bearer {self.api_key}'
        self.stock_pacer = PolygonStockRequestPacer()

    def fetch_underlying(self, symbol: str) -> UnderlyingSnapshot:
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
            price=float(bar['c']),
            bid=None,
            ask=None,
            timestamp=datetime.now(timezone.utc),
            source=self.source,
            raw={'bar': bar, 'endpoint': 'prev_agg'},
        )

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
    ) -> OptionChainSnapshot:
        symbol = symbol.upper()
        snapshot_ts = datetime.now(timezone.utc)
        window_pct = strike_window_pct if strike_window_pct is not None else self.strike_window_pct
        strike_limit = max_strikes_per_side if max_strikes_per_side is not None else self.max_strikes_per_side

        underlying = self.fetch_underlying(symbol)
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
            },
        )

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
