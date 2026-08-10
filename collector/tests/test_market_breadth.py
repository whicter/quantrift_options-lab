import os
import unittest
from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import requests
from requests.exceptions import HTTPError

import collect_market_breadth as breadth
from providers.polygon_market_breadth_provider import (
    CommonStockReference,
    GroupedDailyBar,
    PolygonMarketBreadthProvider,
)


ET = ZoneInfo('America/New_York')


def bar(symbol, close, volume=100):
    return GroupedDailyBar(symbol, close, volume)


def ref(symbol, exchange='XNAS'):
    return CommonStockReference(symbol, exchange)


def http_error(status_code):
    """Build an HTTPError carrying a real status, as raise_for_status() would."""
    response = requests.Response()
    response.status_code = status_code
    return HTTPError(f'{status_code} Client Error', response=response)


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

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params, timeout))
        return self.responses.pop(0)


class MarketBreadthTests(unittest.TestCase):
    def test_expected_market_date_waits_for_eod_settle_and_skips_weekend(self):
        self.assertEqual(
            breadth.expected_market_date(datetime(2026, 7, 30, 21, 0, tzinfo=ET)),
            date(2026, 7, 30),
        )
        self.assertEqual(
            breadth.expected_market_date(datetime(2026, 8, 3, 16, 0, tzinfo=ET)),
            date(2026, 7, 31),
        )

    def test_summarizes_issue_and_volume_breadth_without_faking_missing_rows(self):
        current = {
            'UP': bar('UP', 11, 600),
            'DOWN': bar('DOWN', 8, 300),
            'FLAT': bar('FLAT', 5, 100),
            'IPO': bar('IPO', 20, 50),
        }
        previous = {
            'UP': bar('UP', 10),
            'DOWN': bar('DOWN', 9),
            'FLAT': bar('FLAT', 5),
        }
        result = breadth.summarize_scope(set(current), current, previous)
        self.assertEqual(result['counted'], 3)
        self.assertEqual((result['advances'], result['declines'], result['unchanged']), (1, 1, 1))
        self.assertEqual(result['net_advances'], 0)
        self.assertEqual(result['advance_decline_ratio'], 1)
        self.assertEqual(result['advancing_volume_pct'], 60)

    def test_builds_point_in_time_common_stock_exchange_breakdown(self):
        current = {
            'NQ': bar('NQ', 11),
            'NY': bar('NY', 8),
            'AM': bar('AM', 5),
            'ETF': bar('ETF', 30),
        }
        previous = {
            'NQ': bar('NQ', 10),
            'NY': bar('NY', 9),
            'AM': bar('AM', 5),
            'ETF': bar('ETF', 29),
        }
        references = {
            'NQ': ref('NQ', 'XNAS'),
            'NY': ref('NY', 'XNYS'),
            'AM': ref('AM', 'XASE'),
        }
        result = breadth.build_snapshot(
            date(2026, 7, 30),
            date(2026, 7, 29),
            current,
            previous,
            references,
        )
        self.assertEqual(result['universe_count'], 3)
        self.assertEqual(result['counted'], 3)
        self.assertEqual(result['advances'], 1)
        self.assertEqual(result['declines'], 1)
        self.assertEqual(result['exchange_breakdown']['XNAS']['advances'], 1)
        self.assertEqual(result['exchange_breakdown']['XNYS']['declines'], 1)
        self.assertEqual(result['exchange_breakdown']['XASE']['unchanged'], 1)

    def test_finds_latest_nonempty_grouped_session_across_holiday_or_weekend(self):
        class Provider:
            def __init__(self):
                self.dates = []

            def fetch_grouped_daily(self, value):
                self.dates.append(value)
                return {'A': bar('A', 1)} if value == date(2026, 7, 2) else {}

        provider = Provider()
        found_date, rows = breadth.latest_grouped_on_or_before(
            provider,
            date(2026, 7, 5),
        )
        self.assertEqual(found_date, date(2026, 7, 2))
        self.assertIn('A', rows)
        self.assertNotIn(date(2026, 7, 4), provider.dates)

    def test_walks_back_when_recent_session_is_not_yet_released(self):
        """A 403 on the newest date means "not published for this plan", not fatal.

        Production ran 11 consecutive same-day 403s (2026-07-31..08-07) that killed
        the process instead of stepping back one session, so no breadth was written.
        """
        class Provider:
            def __init__(self):
                self.dates = []

            def fetch_grouped_daily(self, value):
                self.dates.append(value)
                if value >= date(2026, 8, 7):
                    raise http_error(403)
                return {'A': bar('A', 1)}

        provider = Provider()
        found_date, rows = breadth.latest_grouped_on_or_before(
            provider,
            date(2026, 8, 7),
        )
        self.assertEqual(found_date, date(2026, 8, 6))
        self.assertIn('A', rows)

    def test_unentitled_key_fails_closed_instead_of_writing_stale_breadth(self):
        class Provider:
            def fetch_grouped_daily(self, value):
                raise http_error(403)

        with self.assertRaises(RuntimeError):
            breadth.latest_grouped_on_or_before(Provider(), date(2026, 8, 7))

    def test_non_availability_errors_propagate_rather_than_walking_back(self):
        for status in (401, 429, 500):
            with self.subTest(status=status):
                class Provider:
                    def fetch_grouped_daily(self, value):
                        raise http_error(status)

                with self.assertRaises(HTTPError):
                    breadth.latest_grouped_on_or_before(Provider(), date(2026, 8, 7))


class PolygonMarketBreadthProviderTests(unittest.TestCase):
    def provider(self, responses):
        session = FakeSession(responses)
        with patch.dict(os.environ, {
            'POLYGON_API_KEY': 'test-key',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_breadth_test',
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
        }, clear=False):
            provider = PolygonMarketBreadthProvider(session=session)
        return provider, session

    def test_grouped_daily_uses_adjusted_non_otc_market_and_parses_rows(self):
        provider, session = self.provider([
            FakeResponse({'status': 'OK', 'results': [
                {'T': 'AAPL', 'c': 210.5, 'v': 12345},
                {'T': 'BAD', 'c': None, 'v': 1},
            ]}),
        ])
        rows = provider.fetch_grouped_daily(date(2026, 7, 29))
        self.assertEqual(rows['AAPL'].close, 210.5)
        self.assertNotIn('BAD', rows)
        self.assertEqual(
            session.calls[0][1],
            {'adjusted': 'true', 'include_otc': 'false'},
        )

    def test_common_stock_reference_paginates_and_filters_primary_exchange(self):
        provider, session = self.provider([
            FakeResponse({
                'status': 'OK',
                'results': [
                    {'ticker': 'AAPL', 'primary_exchange': 'XNAS'},
                    {'ticker': 'WRONG', 'primary_exchange': 'XNYS'},
                ],
                'next_url': 'https://api.polygon.io/v3/reference/tickers?cursor=next',
            }),
            FakeResponse({
                'status': 'OK',
                'results': [{'ticker': 'MSFT', 'primary_exchange': 'XNAS'}],
            }),
        ])
        rows = provider.fetch_common_stocks(date(2026, 7, 29), ('XNAS',))
        self.assertEqual(set(rows), {'AAPL', 'MSFT'})
        self.assertEqual(session.calls[0][1]['type'], 'CS')
        self.assertEqual(session.calls[0][1]['date'], '2026-07-29')
        self.assertIsNone(session.calls[1][1])


if __name__ == '__main__':
    unittest.main()
