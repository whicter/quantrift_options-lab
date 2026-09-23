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

    def fetch_grouped_daily(self, market_date: date) -> dict[str, PriceBar]:
        """Every US ticker's daily bar for one session, in a single request.

        The per-symbol aggregates path costs one request per symbol, and at the
        configured stock pacing a ~320-symbol sweep runs for hours. That is not
        just slow, it is *skewed*: the plan refuses the current session until it
        closes the day out (`403 NOT_AUTHORIZED`, "Attempted to request today's
        data before end of day"), and the sweep straddles the moment that gate
        opens -- so the symbols reached before it silently carried no bar while
        the ones reached after it did, splitting the universe by nothing more
        than alphabetical position. One grouped request cannot split that way:
        every symbol in the response is answered by the same call, so the
        session either landed for all of them or for none.

        Keyed by Polygon ticker, which is what the response carries; callers
        translate their own symbols with `polygon_ticker()` and persist under
        the name they already store. `source` stays the provider's own, so
        grouped and per-symbol rows form one series that the freshness guard --
        which filters on source -- continues to see whole.
        """
        url = (
            f'{self.base_url}/v2/aggs/grouped/locale/us/market/stocks/'
            f'{market_date.isoformat()}'
        )
        payload = self.http.get_json(
            url,
            params={'adjusted': 'true', 'include_otc': 'false'},
            context=f'Polygon grouped daily request for {market_date.isoformat()}',
        )
        bars: dict[str, PriceBar] = {}
        for item in payload.get('results') or []:
            ticker = str(item.get('T') or '').strip().upper()
            if not ticker or item.get('c') is None:
                continue
            bars[ticker] = PriceBar(
                symbol=ticker,
                date=market_date,
                open=_float_or_none(item.get('o')),
                high=_float_or_none(item.get('h')),
                low=_float_or_none(item.get('l')),
                close=float(item['c']),
                volume=_int_or_none(item.get('v')),
                source=self.source,
            )
        return bars

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
