import unittest
from unittest.mock import MagicMock

import collect


def _connection(ready, recently_collected):
    """Mock the two queries filter_symbols_requiring_tastytrade runs, in order:
    ready-derived-rank symbols, then which of those were collected recently."""
    cursor = MagicMock()
    cursor.fetchall.side_effect = [
        [(symbol,) for symbol in ready],
        [(symbol,) for symbol in recently_collected],
    ]
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    return connection, cursor


class CollectMetricsCutoverTest(unittest.TestCase):
    def test_a_ready_symbol_collected_recently_is_skipped_today(self):
        # The API-saving intent is preserved: we no longer need Tastytrade for
        # IV Rank once we derive it ourselves.
        connection, _ = _connection(ready=['AAPL', 'SPY'], recently_collected=['AAPL', 'SPY'])
        symbols = collect.filter_symbols_requiring_tastytrade(connection, ['AAPL', 'QQQ', 'SPY'])
        self.assertEqual(symbols, ['QQQ'])

    def test_a_ready_symbol_with_stale_earnings_is_still_collected(self):
        """Regression: readiness must lower the cadence, not stop collection.

        `earnings_date` comes only from Tastytrade and has no derived
        equivalent, so excluding ready symbols outright froze their earnings
        dates forever. Measured 2026-08-03: the 207 symbols with a ready rank
        last had earnings data from 2026-07-30 while the other 303 were
        current, and it compounds as more symbols reach readiness.
        """
        # AAPL is ready but was NOT collected recently -> must be refreshed.
        connection, _ = _connection(ready=['AAPL', 'SPY'], recently_collected=['SPY'])
        symbols = collect.filter_symbols_requiring_tastytrade(connection, ['AAPL', 'QQQ', 'SPY'])
        self.assertIn('AAPL', symbols, 'a ready symbol with stale earnings data must be re-collected')
        self.assertIn('QQQ', symbols, 'a symbol without a derived rank is always collected')
        self.assertNotIn('SPY', symbols, 'ready and recently collected stays skipped')

    def test_a_symbol_never_collected_is_always_included(self):
        # Newly added tickers have a backfilled volatility_history (so they read
        # as "ready") but no iv_history row at all, which is exactly how the 12
        # tickers added 2026-08-02 ended up with no earnings dates.
        connection, _ = _connection(ready=['ABNB', 'MCD'], recently_collected=[])
        symbols = collect.filter_symbols_requiring_tastytrade(connection, ['ABNB', 'MCD'])
        self.assertEqual(symbols, ['ABNB', 'MCD'])

    def test_queries_gate_on_readiness_and_recency(self):
        connection, cursor = _connection(ready=['AAPL'], recently_collected=['AAPL'])
        collect.filter_symbols_requiring_tastytrade(connection, ['AAPL'])
        first_sql = cursor.execute.call_args_list[0].args[0]
        second_sql = cursor.execute.call_args_list[1].args[0]
        self.assertIn('iv_rank_ready = TRUE', first_sql)
        self.assertIn('MAX(date)', second_sql)

    def test_empty_universe_does_not_query_database(self):
        connection = MagicMock()
        self.assertEqual(collect.filter_symbols_requiring_tastytrade(connection, []), [])
        connection.cursor.assert_not_called()


if __name__ == '__main__':
    unittest.main()
