import os
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import requests

from providers.polygon_price_provider import PolygonPriceProvider, polygon_ticker


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'status={self.status_code}')
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, payloads):
        self.headers = {}
        self.payloads = list(payloads)
        self.calls = []

    def get(self, url, params, timeout):
        self.calls.append((url, params, timeout))
        return FakeResponse(self.payloads.pop(0))


class PolygonPriceProviderTests(unittest.TestCase):
    def provider(self, payloads):
        session = FakeSession(payloads)
        with patch.dict(os.environ, {
            'POLYGON_API_KEY': 'test-key',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_price_provider_test',
            'POLYGON_PRICE_RATE_LIMIT_BACKOFF': '0',
        }, clear=False):
            provider = PolygonPriceProvider(session=session)
        return provider, session

    def test_fetches_and_parses_daily_aggregates(self):
        ts = int(datetime(2026, 7, 14, 4, tzinfo=timezone.utc).timestamp() * 1000)
        provider, session = self.provider([{
            'status': 'OK',
            'results': [{'t': ts, 'o': 100, 'h': 105, 'l': 99, 'c': 104, 'v': 1234}],
        }])

        bars = provider.fetch_daily_bars('brk.b', limit=1)

        self.assertEqual(len(bars), 1)
        self.assertEqual((bars[0].symbol, bars[0].date, bars[0].close), ('BRK.B', date(2026, 7, 14), 104.0))
        self.assertIn('/ticker/BRK.B/range/1/day/', session.calls[0][0])
        self.assertEqual(session.calls[0][1], {'adjusted': 'true', 'sort': 'asc', 'limit': 50000})

    def test_fetches_30m_bars_with_utc_timestamp_and_microstructure_fields(self):
        ts = int(datetime(2026, 7, 14, 13, 30, tzinfo=timezone.utc).timestamp() * 1000)
        provider, session = self.provider([{
            'status': 'DELAYED',
            'results': [{'t': ts, 'o': 100, 'h': 102, 'l': 99, 'c': 101, 'v': 50, 'vw': 100.5, 'n': 12}],
        }])

        bars = provider.fetch_30m_bars('aapl', lookback_days=10)

        self.assertEqual(bars[0].bar_ts, datetime(2026, 7, 14, 13, 30, tzinfo=timezone.utc))
        self.assertEqual((bars[0].vwap, bars[0].trade_count), (100.5, 12))
        self.assertIn('/ticker/AAPL/range/30/minute/', session.calls[0][0])

    def test_missing_key_fails_before_network_request(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'POLYGON_API_KEY'):
                PolygonPriceProvider(session=FakeSession([]))

    def test_symbol_normalization_preserves_polygon_share_class(self):
        self.assertEqual(polygon_ticker(' brk.b '), 'BRK.B')
        self.assertEqual(polygon_ticker('BRK/B'), 'BRK.B')

    @patch('providers.polygon_price_provider.time.sleep')
    def test_429_is_retried_with_retry_after(self, sleep):
        session = FakeSession([])
        session.payloads = [
            {'status': 'ERROR'},
            {'status': 'OK', 'results': []},
        ]
        responses = [
            FakeResponse({'status': 'ERROR'}, status_code=429, headers={'Retry-After': '2'}),
            FakeResponse({'status': 'OK', 'results': []}),
        ]
        session.get = lambda *args, **kwargs: responses.pop(0)
        with patch.dict(os.environ, {
            'POLYGON_API_KEY': 'test-key',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_price_provider_test',
            'POLYGON_PRICE_RATE_LIMIT_BACKOFF': '0',
            # Pin the local backend: a unit test must not open a connection to
            # the real database just because DATABASE_URL is in the environment.
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
        }, clear=False):
            provider = PolygonPriceProvider(session=session)

            # A 429 now pushes the shared slot rather than sleeping locally, so
            # every worker backs off instead of only this process.
            with patch.object(provider.stock_pacer, 'penalize') as penalize:
                self.assertEqual(provider.fetch_daily_bars('AAPL'), [])
                penalize.assert_called_once_with(2.0)


if __name__ == '__main__':
    unittest.main()
