from __future__ import annotations

import os
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .base import IntradayPriceBar, PriceBar
from .polygon_rate_limit import PolygonStockRequestPacer


MARKET_TIMEZONE = ZoneInfo('America/New_York')


class PolygonPriceProvider:
    source = 'polygon_licensed'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.api_key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError('POLYGON_API_KEY is required for PolygonPriceProvider')
        self.base_url = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io').rstrip('/')
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self.rate_limit_backoff = float(os.getenv('POLYGON_PRICE_RATE_LIMIT_BACKOFF', '60'))
        self.max_rate_limit_retries = int(os.getenv('POLYGON_PRICE_RATE_LIMIT_RETRIES', '5'))
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
        response = None
        for attempt in range(self.max_rate_limit_retries + 1):
            self.stock_pacer.wait()
            response = self._session.get(url, params=params, timeout=self.timeout)
            if getattr(response, 'status_code', 200) != 429:
                response.raise_for_status()
                break
            if attempt >= self.max_rate_limit_retries:
                response.raise_for_status()
            retry_after = _retry_after_seconds(getattr(response, 'headers', {}).get('Retry-After'))
            # Push the shared slot so every worker backs off. A local sleep
            # would pause only this process while the others keep hammering.
            self.stock_pacer.penalize(retry_after or self.rate_limit_backoff)

        if response is None:
            raise RuntimeError(f'Polygon aggregates request did not run for {symbol}')
        payload = response.json()
        if payload.get('status') not in (None, 'OK', 'DELAYED'):
            raise RuntimeError(f'Polygon aggregates failed for {symbol}: {payload.get("status")}')
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


def _retry_after_seconds(value) -> float | None:
    if value in (None, ''):
        return None
    try:
        return max(float(value), 0)
    except (TypeError, ValueError):
        return None
