import unittest
from datetime import date

import backfill_iv_history as bf


class OccTickerTest(unittest.TestCase):
    def test_formats_occ_symbol(self):
        self.assertEqual(bf.occ_ticker('AAPL', date(2025, 7, 18), 90.0, True), 'O:AAPL250718C00090000')
        self.assertEqual(bf.occ_ticker('AAPL', date(2026, 1, 16), 5.0, False), 'O:AAPL260116P00005000')
        # fractional strike
        self.assertEqual(bf.occ_ticker('SPY', date(2026, 3, 20), 512.5, True), 'O:SPY260320C00512500')


class NearestStrikeTest(unittest.TestCase):
    def test_picks_closest(self):
        self.assertEqual(bf.nearest_strike([300, 330, 340, 350], 333.26), 330)
        self.assertEqual(bf.nearest_strike([300, 335, 340], 333.26), 335)

    def test_ignores_bad_input(self):
        self.assertEqual(bf.nearest_strike([None, 0, 340], 333), 340)
        self.assertIsNone(bf.nearest_strike([], 333))
        self.assertIsNone(bf.nearest_strike([340], 0))

    def test_strikes_by_distance_orders_and_limits(self):
        self.assertEqual(bf.strikes_by_distance([300, 330, 340, 350, 360], 333.26, limit=3), [330, 340, 350])
        self.assertEqual(bf.strikes_by_distance([None, 0, 336, 331], 333), [331, 336])
        self.assertEqual(bf.strikes_by_distance([], 333), [])


class BracketingExpiriesTest(unittest.TestCase):
    def test_picks_below_and_above_30dte(self):
        as_of = date(2026, 7, 1)
        expiries = [date(2026, 7, 10), date(2026, 7, 24), date(2026, 8, 21), date(2026, 9, 18)]
        picks = bf.select_bracketing_expiries(expiries, as_of, 30)
        # 30 DTE from Jul 1 = Jul 31; nearest below = Jul 24 (23d), nearest above = Aug 21 (51d)
        self.assertEqual(picks, [date(2026, 7, 24), date(2026, 8, 21)])

    def test_only_below_when_target_beyond_range(self):
        as_of = date(2026, 7, 1)
        picks = bf.select_bracketing_expiries([date(2026, 7, 10), date(2026, 7, 15)], as_of, 30)
        self.assertEqual(picks, [date(2026, 7, 15)])

    def test_exact_match_is_single(self):
        as_of = date(2026, 7, 1)
        picks = bf.select_bracketing_expiries([date(2026, 7, 31), date(2026, 8, 30)], as_of, 30)
        self.assertEqual(picks, [date(2026, 7, 31)])  # exactly 30 DTE, below covers it

    def test_no_future_expiries(self):
        self.assertEqual(bf.select_bracketing_expiries([date(2026, 6, 1)], date(2026, 7, 1)), [])


class VolatilityRowTest(unittest.TestCase):
    def test_row_shape(self):
        row = bf.volatility_row('AAPL', date(2026, 3, 2), 0.28, date(2026, 4, 1), 340.0, 30)
        self.assertEqual(row['symbol'], 'AAPL')
        self.assertEqual(row['atm_iv'], 0.28)
        self.assertEqual(row['iv_source'], 'polygon_backfill_bs')
        self.assertEqual(row['atm_dte'], 30)


if __name__ == '__main__':
    unittest.main()
