import unittest
from unittest.mock import MagicMock

import collect


class CollectMetricsCutoverTest(unittest.TestCase):
    def test_filters_only_symbols_with_ready_derived_rank(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [('AAPL',), ('SPY',)]
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor

        symbols = collect.filter_symbols_requiring_tastytrade(connection, ['AAPL', 'QQQ', 'SPY'])

        self.assertEqual(symbols, ['QQQ'])
        sql = cursor.execute.call_args.args[0]
        self.assertIn('iv_rank_ready = TRUE', sql)

    def test_empty_universe_does_not_query_database(self):
        connection = MagicMock()
        self.assertEqual(collect.filter_symbols_requiring_tastytrade(connection, []), [])
        connection.cursor.assert_not_called()


if __name__ == '__main__':
    unittest.main()
