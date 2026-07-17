from __future__ import annotations

import os
import time
from dataclasses import dataclass

import requests

from .polygon_price_provider import polygon_ticker
from .polygon_rate_limit import PolygonStockRequestPacer


@dataclass(frozen=True)
class TickerReference:
    symbol: str
    name: str | None
    ticker_type: str | None
    market: str | None
    market_cap: float | None
    sic_code: str | None
    sic_description: str | None
    active: bool | None
    primary_exchange: str | None
    last_updated_utc: str | None


class PolygonReferenceProvider:
    source = 'polygon_reference'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.api_key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError('POLYGON_API_KEY is required for PolygonReferenceProvider')
        self.base_url = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io').rstrip('/')
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self.backoff = max(float(os.getenv('POLYGON_REFERENCE_RATE_LIMIT_BACKOFF', '60')), 1)
        self.max_retries = max(int(os.getenv('POLYGON_REFERENCE_RATE_LIMIT_RETRIES', '4')), 0)
        self.stock_pacer = PolygonStockRequestPacer()
        self._session = session or requests.Session()
        self._session.headers['Authorization'] = f'Bearer {self.api_key}'

    def fetch_ticker(self, symbol: str) -> TickerReference | None:
        normalized = symbol.strip().upper()
        url = f'{self.base_url}/v3/reference/tickers/{polygon_ticker(normalized)}'
        response = None
        for attempt in range(self.max_retries + 1):
            self.stock_pacer.wait()
            response = self._session.get(url, timeout=self.timeout)
            if response.status_code == 404:
                return None
            if response.status_code != 429:
                response.raise_for_status()
                break
            if attempt >= self.max_retries:
                response.raise_for_status()
            # Shared penalty: back every worker off this provider, not just this
            # process, so one rejection cannot become a storm.
            self.stock_pacer.penalize(_retry_after(response.headers.get('Retry-After')) or self.backoff)
        if response is None:
            raise RuntimeError(f'Polygon ticker reference request did not run for {normalized}')
        payload = response.json()
        if payload.get('status') not in (None, 'OK', 'DELAYED'):
            raise RuntimeError(f'Polygon ticker reference failed for {normalized}: {payload.get("status")}')
        result = payload.get('results') or {}
        if not result:
            return None
        return TickerReference(
            symbol=normalized,
            name=_text(result.get('name')),
            ticker_type=_text(result.get('type')),
            market=_text(result.get('market')),
            market_cap=_float(result.get('market_cap')),
            sic_code=_text(result.get('sic_code')),
            sic_description=_text(result.get('sic_description')),
            active=result.get('active') if isinstance(result.get('active'), bool) else None,
            primary_exchange=_text(result.get('primary_exchange')),
            last_updated_utc=_text(result.get('last_updated_utc')),
        )


def _text(value):
    value = str(value or '').strip()
    return value or None


def _float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _retry_after(value):
    try:
        return max(float(value or 0), 0)
    except (TypeError, ValueError):
        return 0
