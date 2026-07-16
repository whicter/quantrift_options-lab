import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import collect_prices
from providers.base import IntradayPriceBar, PriceBar


class FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class FakeConnection:
    def __init__(self):
        self.commits = 0

    def cursor(self):
        return FakeCursor()

    def commit(self):
        self.commits += 1


class CollectPricesTests(unittest.TestCase):
    def test_watchlist_alias_uses_full_collection_universe(self):
        with patch.dict('os.environ', {'SYMBOLS': 'watchlist'}, clear=False), \
             patch('collect_prices.load_watchlist', return_value=['AAPL', 'QQQ']) as load_watchlist:
            self.assertEqual(collect_prices.load_symbols(), ['AAPL', 'QQQ'])
            load_watchlist.assert_called_once()

    def test_polygon_is_supported_provider(self):
        with patch.object(collect_prices, 'PRICE_PROVIDER', 'polygon'), \
             patch('collect_prices.PolygonPriceProvider') as provider:
            self.assertIs(collect_prices.make_provider(), provider.return_value)

    def test_daily_only_fallback_remains_supported(self):
        class DailyOnlyProvider:
            source = 'ib_internal'

            def fetch_daily_bars(self, symbol, limit):
                return [PriceBar(symbol, date(2026, 7, 14), 1, 2, 0.5, 1.5, 100, self.source)]

        daily, intraday = collect_prices.fetch_price_rows(DailyOnlyProvider(), 'AAPL')

        self.assertEqual(len(daily), 1)
        self.assertEqual(intraday, [])

    def test_polygon_requires_both_timeframes(self):
        class IncompletePolygonProvider:
            source = 'polygon_licensed'

            def fetch_daily_bars(self, symbol, limit):
                return [PriceBar(symbol, date(2026, 7, 14), 1, 2, 0.5, 1.5, 100, self.source)]

            def fetch_30m_bars(self, symbol, lookback_days):
                return []

        with self.assertRaisesRegex(ValueError, '30-minute'):
            collect_prices.fetch_price_rows(IncompletePolygonProvider(), 'AAPL')

    @patch('collect_prices.execute_values')
    def test_daily_and_intraday_upserts_use_separate_tables(self, execute_values):
        conn = FakeConnection()
        daily = [PriceBar('AAPL', date(2026, 7, 14), 1, 2, 0.5, 1.5, 100, 'polygon_licensed')]
        intraday = [IntradayPriceBar(
            'AAPL', datetime(2026, 7, 14, 13, 30, tzinfo=timezone.utc),
            1, 2, 0.5, 1.5, 50, 1.4, 10, 'polygon_licensed',
        )]

        self.assertEqual(collect_prices.upsert_price_rows(conn, daily, commit=False), 1)
        self.assertEqual(collect_prices.upsert_30m_rows(conn, intraday, commit=False), 1)

        daily_sql = execute_values.call_args_list[0].args[1]
        intraday_sql = execute_values.call_args_list[1].args[1]
        self.assertIn('INSERT INTO price_history ', daily_sql)
        self.assertIn('INSERT INTO price_history_30m ', intraday_sql)
        self.assertEqual(conn.commits, 0)


if __name__ == '__main__':
    unittest.main()
