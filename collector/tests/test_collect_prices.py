import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import collect_prices
from providers.base import IntradayPriceBar, PriceBar

ET = ZoneInfo('America/New_York')


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


class SettledMarketDateTests(unittest.TestCase):
    def test_weekday_after_settle_expects_today(self):
        # Thursday 21:35 ET (evening run) -> today's bar should be finalized.
        now = datetime(2026, 7, 23, 21, 35, tzinfo=ET)
        self.assertEqual(collect_prices.settled_market_date(now), date(2026, 7, 23))

    def test_weekday_before_settle_expects_previous_weekday(self):
        # Thursday 16:35 ET (13:35 PT run) -> today's EOD may still be pending,
        # so we only demand Wednesday's bar.
        now = datetime(2026, 7, 23, 16, 35, tzinfo=ET)
        self.assertEqual(collect_prices.settled_market_date(now), date(2026, 7, 22))

    def test_monday_before_settle_steps_back_over_the_weekend_to_friday(self):
        now = datetime(2026, 7, 20, 9, 0, tzinfo=ET)  # Monday morning
        self.assertEqual(collect_prices.settled_market_date(now), date(2026, 7, 17))

    def test_saturday_expects_friday(self):
        now = datetime(2026, 7, 18, 22, 0, tzinfo=ET)  # Saturday night
        self.assertEqual(collect_prices.settled_market_date(now), date(2026, 7, 17))


class SymbolsBehindTests(unittest.TestCase):
    def test_flags_missing_and_stale_symbols_only(self):
        expected = date(2026, 7, 17)
        latest = {
            'AAPL': date(2026, 7, 17),   # current
            'TSLA': date(2026, 7, 16),   # stale by a day
            'SPY': None,                 # never collected
            'QQQ': date(2026, 7, 20),    # ahead (weekend backfill) -> not behind
        }
        self.assertEqual(collect_prices.symbols_behind(latest, expected), ['SPY', 'TSLA'])


class CheckPriceFreshnessTests(unittest.TestCase):
    class _Cursor:
        def __init__(self, rows):
            self._rows = rows

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params):
            self.sql = sql
            self.params = params

        def fetchall(self):
            return self._rows

    class _Conn:
        def __init__(self, rows):
            self._rows = rows

        def cursor(self):
            return CheckPriceFreshnessTests._Cursor(self._rows)

    def test_warns_when_a_symbol_lags_the_expected_date(self):
        now = datetime(2026, 7, 23, 21, 35, tzinfo=ET)  # expects 2026-07-23
        conn = self._Conn([('AAPL', date(2026, 7, 23)), ('TSLA', date(2026, 7, 21))])
        with self.assertLogs('collect_prices', level='WARNING') as logs:
            behind = collect_prices.check_price_freshness(conn, ['AAPL', 'TSLA'], 'polygon_licensed', now_et=now)
        self.assertEqual(behind, ['TSLA'])
        self.assertTrue(any('behind expected 2026-07-23' in line for line in logs.output))

    def test_no_warning_when_all_current(self):
        now = datetime(2026, 7, 23, 21, 35, tzinfo=ET)
        conn = self._Conn([('AAPL', date(2026, 7, 23)), ('TSLA', date(2026, 7, 23))])
        self.assertEqual(
            collect_prices.check_price_freshness(conn, ['AAPL', 'TSLA'], 'polygon_licensed', now_et=now),
            [],
        )


if __name__ == '__main__':
    unittest.main()
