import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collect_universe_metadata import asset_type, confirmed_optionable, load_symbols, persist_reference, sector_from_sic
from providers.polygon_reference_provider import PolygonReferenceProvider, TickerReference


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'HTTP {self.status_code}')


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.headers = {}
        self.calls = []

    def get(self, url, timeout):
        self.calls.append((url, timeout))
        return self.responses.pop(0)


class FakeCursor:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.sql = ''
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self.sql = sql
        self.params = params

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0]


class FakeConnection:
    def __init__(self, rows=None):
        self.cursor_instance = FakeCursor(rows)
        self.commits = 0

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


def reference(**overrides):
    values = {
        'symbol': 'AAPL', 'name': 'Apple Inc.', 'ticker_type': 'CS', 'market': 'stocks',
        'market_cap': 3_000_000_000_000, 'sic_code': '3571', 'sic_description': 'Electronic Computers',
        'active': True, 'primary_exchange': 'XNAS', 'last_updated_utc': '2026-07-15T00:00:00Z',
    }
    values.update(overrides)
    return TickerReference(**values)


class PolygonReferenceMetadataTests(unittest.TestCase):
    def provider(self, responses):
        session = FakeSession(responses)
        with patch.dict(os.environ, {
            'POLYGON_API_KEY': 'test-key', 'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_reference_test',
            'POLYGON_REFERENCE_RATE_LIMIT_BACKOFF': '1',
            # Pin the local backend: a unit test must not open a connection to
            # the real database just because DATABASE_URL is in the environment.
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
        }, clear=False):
            provider = PolygonReferenceProvider(session)
        return provider, session

    def test_parses_ticker_details_without_inventing_absent_fields(self):
        provider, session = self.provider([FakeResponse({'status': 'OK', 'results': {
            'ticker': 'AAPL', 'name': 'Apple Inc.', 'type': 'CS', 'market': 'stocks',
            'market_cap': 3_000_000_000_000, 'sic_code': '3571', 'sic_description': 'Electronic Computers',
            'active': True, 'primary_exchange': 'XNAS', 'last_updated_utc': '2026-07-15T00:00:00Z',
        }})])
        result = provider.fetch_ticker('aapl')
        self.assertEqual(result.name, 'Apple Inc.')
        self.assertEqual(result.market_cap, 3_000_000_000_000.0)
        self.assertEqual(result.sic_code, '3571')
        self.assertIn('/v3/reference/tickers/AAPL', session.calls[0][0])

    def test_404_is_a_missing_reference_not_a_fabricated_record(self):
        provider, _ = self.provider([FakeResponse({}, 404)])
        self.assertIsNone(provider.fetch_ticker('UNKNOWN'))

    @patch('providers.polygon_reference_provider.time.sleep')
    def test_429_uses_bounded_retry_after(self, sleep):
        provider, _ = self.provider([
            FakeResponse({}, 429, {'Retry-After': '2'}),
            FakeResponse({'status': 'OK', 'results': {'ticker': 'AAPL', 'name': 'Apple'}}),
        ])
        # A 429 now pushes the shared slot rather than sleeping locally, so every
        # worker backs off instead of only this process.
        with patch.object(provider.stock_pacer, 'penalize') as penalize:
            self.assertEqual(provider.fetch_ticker('AAPL').name, 'Apple')
            penalize.assert_called_once_with(2.0)

    def test_sic_and_ticker_type_mapping_are_deterministic_and_nullable(self):
        self.assertEqual(sector_from_sic('3571'), 'Technology')
        self.assertEqual(sector_from_sic('2834'), 'Healthcare')
        self.assertEqual(sector_from_sic('1311'), 'Energy')
        self.assertEqual(sector_from_sic(None), None)
        self.assertEqual(asset_type(reference()), 'stock')
        self.assertEqual(asset_type(reference(ticker_type='ETF')), 'etf')
        self.assertIsNone(asset_type(reference(ticker_type=None, market=None)))

    def test_load_symbols_uses_scan_enabled_universe_schema(self):
        conn = FakeConnection([('AAPL',), ('PLTR',)])
        with patch.dict(os.environ, {'REFERENCE_SYMBOLS': ''}, clear=False):
            self.assertEqual(load_symbols(conn), ['AAPL', 'PLTR'])
        self.assertIn('scan_enabled=TRUE', conn.cursor_instance.sql)
        self.assertNotIn('scannable', conn.cursor_instance.sql)

    def test_reference_symbols_override_database_universe(self):
        conn = FakeConnection([('AAPL',)])
        with patch.dict(os.environ, {'REFERENCE_SYMBOLS': 'pltr, AAPL,pltr'}, clear=False):
            self.assertEqual(load_symbols(conn), ['AAPL', 'PLTR'])
        self.assertEqual(conn.cursor_instance.sql, '')

    def test_confirmed_optionable_only_sets_true_for_existing_usable_snapshot(self):
        self.assertTrue(confirmed_optionable(FakeConnection([(True,)]), 'AAPL'))
        self.assertIsNone(confirmed_optionable(FakeConnection([(False,)]), 'AAPL'))

    def test_persist_reference_preserves_non_reference_fields_and_only_sets_optionable_true(self):
        conn = FakeConnection()
        persist_reference(conn, reference(), optionable=None)
        sql = conn.cursor_instance.sql
        params = conn.cursor_instance.params
        self.assertIn("metadata->>'reference_source'='polygon_reference'", sql)
        self.assertIn('optionable=CASE WHEN %s IS TRUE THEN TRUE ELSE optionable END', sql)
        self.assertEqual(params[0], 'Apple Inc.')
        self.assertEqual(params[1], 'stock')
        self.assertEqual(params[2], 'Technology')
        self.assertEqual(params[4], None)
        self.assertEqual(params[-1], 'AAPL')
        self.assertEqual(conn.commits, 1)


if __name__ == '__main__':
    unittest.main()
