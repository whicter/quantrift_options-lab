from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

from .base import IntradayPriceBar, PriceBar
from .polygon_http import PolygonHttpClient


MARKET_TIMEZONE = ZoneInfo('America/New_York')


class PolygonPriceProvider:
    source = 'polygon_licensed'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.http = PolygonHttpClient(
            session=session,
            required_for='PolygonPriceProvider',
        )
        self.api_key = self.http.api_key
        self.base_url = self.http.base_url
        self.timeout = self.http.timeout
        self.stock_pacer = self.http.pacer
        self._session = self.http.session

    def fetch_daily_bars(self, symbol: str, limit: int = 400) -> list[PriceBar]:
        end = date.today()
        start = end - timedelta(days=max(550, limit * 2))
        results = self._fetch_aggregates(symbol, 1, 'day', start, end)
        bars = [self._daily_bar(symbol, item) for item in results]
        return bars[-limit:]

    def fetch_30m_bars(self, symbol: str, lookback_days: int = 35) -> list[IntradayPriceBar]:
        end = date.today()
        start = end - timedelta(days=max(lookback_days, 1))
        results = self._fetch_aggregates(symbol, 30, 'minute', start, end)
        return [self._intraday_bar(symbol, item) for item in results]

    def _fetch_aggregates(
        self,
        symbol: str,
        multiplier: int,
        timespan: str,
        start: date,
        end: date,
    ) -> list[dict]:
        ticker = polygon_ticker(symbol)
        url = (
            f'{self.base_url}/v2/aggs/ticker/{ticker}/range/'
            f'{multiplier}/{timespan}/{start.isoformat()}/{end.isoformat()}'
        )
        params = {'adjusted': 'true', 'sort': 'asc', 'limit': 50000}
        payload = self.http.get_json(
            url,
            params=params,
            context=f'Polygon aggregates request for {symbol}',
        )
        return payload.get('results') or []

    def _daily_bar(self, symbol: str, item: dict) -> PriceBar:
        bar_datetime = datetime.fromtimestamp(int(item['t']) / 1000, tz=timezone.utc)
        return PriceBar(
            symbol=symbol.upper(),
            date=bar_datetime.astimezone(MARKET_TIMEZONE).date(),
            open=_float_or_none(item.get('o')),
            high=_float_or_none(item.get('h')),
            low=_float_or_none(item.get('l')),
            close=float(item['c']),
            volume=_int_or_none(item.get('v')),
            source=self.source,
        )

    def _intraday_bar(self, symbol: str, item: dict) -> IntradayPriceBar:
        return IntradayPriceBar(
            symbol=symbol.upper(),
            bar_ts=datetime.fromtimestamp(int(item['t']) / 1000, tz=timezone.utc),
            open=_float_or_none(item.get('o')),
            high=_float_or_none(item.get('h')),
            low=_float_or_none(item.get('l')),
            close=float(item['c']),
            volume=_int_or_none(item.get('v')),
            vwap=_float_or_none(item.get('vw')),
            trade_count=_int_or_none(item.get('n')),
            source=self.source,
        )


def polygon_ticker(symbol: str) -> str:
    """Normalize UI/DB symbols without changing their persisted identity."""
    return symbol.strip().upper().replace('/', '.')


def _float_or_none(value):
    return None if value is None else float(value)


def _int_or_none(value):
    return None if value is None else int(float(value))
