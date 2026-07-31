from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import requests

from .polygon_http import PolygonHttpClient


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
        self.http = PolygonHttpClient(
            session=session,
            required_for='PolygonMarketBreadthProvider',
        )
        self.api_key = self.http.api_key
        self.base_url = self.http.base_url
        self.timeout = self.http.timeout
        self.stock_pacer = self.http.pacer
        self._session = self.http.session

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
        return self.http.get_json(
            url,
            params=params,
            context='Polygon market breadth request',
        )


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
