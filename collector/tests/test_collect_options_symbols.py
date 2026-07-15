import os
import unittest
from unittest.mock import patch

import collect_options


class CollectOptionsSymbolsTest(unittest.TestCase):
    def test_default_loads_watchlist_instead_of_narrow_fixture(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch('collect_options.load_watchlist', return_value=['AAPL', 'QQQ', 'TSLA', 'STX']) as mocked:
            self.assertEqual(collect_options.load_symbols(), ['AAPL', 'QQQ', 'TSLA', 'STX'])
            mocked.assert_called_once()

    def test_option_symbols_override_keeps_targeted_backfill(self):
        with patch.dict(os.environ, {'OPTION_SYMBOLS': 'pltr, qqq, PLTR'}, clear=True):
            self.assertEqual(collect_options.load_symbols(), ['PLTR', 'QQQ'])

    def test_symbols_watchlist_alias_loads_watchlist(self):
        with patch.dict(os.environ, {'SYMBOLS': 'watchlist'}, clear=True), \
             patch('collect_options.load_watchlist', return_value=['SPY', 'TSLA']) as mocked:
            self.assertEqual(collect_options.load_symbols(), ['SPY', 'TSLA'])
            mocked.assert_called_once()


if __name__ == '__main__':
    unittest.main()
