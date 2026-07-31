from __future__ import annotations

from dataclasses import dataclass

import requests

from .polygon_http import PolygonHttpClient
from .polygon_price_provider import polygon_ticker


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
    branding_icon_url: str | None
    branding_logo_url: str | None


class PolygonReferenceProvider:
    source = 'polygon_reference'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.http = PolygonHttpClient(
            session=session,
            required_for='PolygonReferenceProvider',
            backoff_env='POLYGON_REFERENCE_RATE_LIMIT_BACKOFF',
            retries_env='POLYGON_REFERENCE_RATE_LIMIT_RETRIES',
            default_retries=4,
        )
        self.api_key = self.http.api_key
        self.base_url = self.http.base_url
        self.timeout = self.http.timeout
        self.stock_pacer = self.http.pacer
        self._session = self.http.session

    def fetch_ticker(self, symbol: str) -> TickerReference | None:
        normalized = symbol.strip().upper()
        url = f'{self.base_url}/v3/reference/tickers/{polygon_ticker(normalized)}'
        payload = self.http.get_json(
            url,
            context=f'Polygon ticker reference request for {normalized}',
            missing_http_statuses=(404,),
        )
        if payload is None:
            return None
        result = payload.get('results') or {}
        if not result:
            return None
        branding = result.get('branding') if isinstance(result.get('branding'), dict) else {}
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
            branding_icon_url=_https_url(branding.get('icon_url')),
            branding_logo_url=_https_url(branding.get('logo_url')),
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


def _https_url(value):
    value = _text(value)
    return value if value and value.startswith('https://') else None
