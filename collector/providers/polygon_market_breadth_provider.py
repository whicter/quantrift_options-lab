from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .polygon_rate_limit import PolygonStockRequestPacer


@dataclass(frozen=True)
class GroupedDailyBar:
    symbol: str
    close: float
    volume: int | None


@dataclass(frozen=True)
class CommonStockReference:
    symbol: str
    primary_exchange: str


class PolygonMarketBreadthProvider:
    """End-of-day, full-market inputs from Polygon's grouped daily endpoint."""

    source = 'polygon_grouped_daily'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.api_key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError('POLYGON_API_KEY is required for PolygonMarketBreadthProvider')
        self.base_url = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io').rstrip('/')
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self.backoff = max(float(os.getenv('POLYGON_PRICE_RATE_LIMIT_BACKOFF', '60')), 1)
        self.max_retries = max(int(os.getenv('POLYGON_PRICE_RATE_LIMIT_RETRIES', '5')), 0)
        self.stock_pacer = PolygonStockRequestPacer()
        self._session = session or requests.Session()
        self._session.headers['Authorization'] = f'Bearer {self.api_key}'
        if session is None:
            retry = Retry(
                total=3,
                backoff_factor=0.5,
                status_forcelist=(500, 502, 503, 504),
                allowed_methods=frozenset({'GET'}),
                respect_retry_after_header=True,
            )
            self._session.mount('https://', HTTPAdapter(max_retries=retry))

    def fetch_grouped_daily(self, market_date: date) -> dict[str, GroupedDailyBar]:
        url = (
            f'{self.base_url}/v2/aggs/grouped/locale/us/market/stocks/'
            f'{market_date.isoformat()}'
        )
        payload = self._get_json(
            url,
            params={'adjusted': 'true', 'include_otc': 'false'},
        )
        bars: dict[str, GroupedDailyBar] = {}
        for item in payload.get('results') or []:
            symbol = str(item.get('T') or '').strip().upper()
            close = _positive_float(item.get('c'))
            if not symbol or close is None:
                continue
            bars[symbol] = GroupedDailyBar(
                symbol=symbol,
                close=close,
                volume=_nonnegative_int(item.get('v')),
            )
        return bars

    def fetch_common_stocks(
        self,
        market_date: date,
        exchanges: tuple[str, ...],
    ) -> dict[str, CommonStockReference]:
        """Point-in-time common-stock universe for the requested primary MICs."""
        references: dict[str, CommonStockReference] = {}
        for exchange in exchanges:
            url = f'{self.base_url}/v3/reference/tickers'
            params = {
                'market': 'stocks',
                'type': 'CS',
                'active': 'true',
                'date': market_date.isoformat(),
                'exchange': exchange,
                'limit': 1000,
                'sort': 'ticker',
            }
            pages = 0
            while url:
                payload = self._get_json(url, params=params)
                pages += 1
                if pages > 20:
                    raise RuntimeError(f'Polygon ticker pagination exceeded 20 pages for {exchange}')
                for item in payload.get('results') or []:
                    symbol = str(item.get('ticker') or '').strip().upper()
                    primary_exchange = str(item.get('primary_exchange') or exchange).strip().upper()
                    if symbol and primary_exchange == exchange:
                        references[symbol] = CommonStockReference(symbol, primary_exchange)
                url = payload.get('next_url')
                params = None
        return references

    def _get_json(self, url: str, params: dict | None = None) -> dict:
        response = None
        for attempt in range(self.max_retries + 1):
            self.stock_pacer.wait()
            response = self._session.get(url, params=params, timeout=self.timeout)
            if response.status_code != 429:
                response.raise_for_status()
                break
            if attempt >= self.max_retries:
                response.raise_for_status()
            self.stock_pacer.penalize(_retry_after(response.headers.get('Retry-After')) or self.backoff)
        if response is None:
            raise RuntimeError('Polygon market breadth request did not run')
        payload = response.json()
        if payload.get('status') not in (None, 'OK', 'DELAYED'):
            raise RuntimeError(f'Polygon market breadth request failed: {payload.get("status")}')
        return payload


def _positive_float(value) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _nonnegative_int(value) -> int | None:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _retry_after(value) -> float:
    try:
        return max(float(value or 0), 0)
    except (TypeError, ValueError):
        return 0
