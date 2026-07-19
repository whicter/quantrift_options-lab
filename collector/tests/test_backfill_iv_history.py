import unittest
from datetime import date

import backfill_iv_history as bf
from implied_vol import bs_price


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

    def test_monthly_expiries_are_tried_before_weeklies(self):
        as_of = date(2026, 3, 2)
        weekly = date(2026, 4, 1)
        monthly_near = date(2026, 3, 20)
        monthly_far = date(2026, 4, 17)
        ordered = bf.expiry_walk_order([weekly, monthly_near, monthly_far], as_of)
        self.assertEqual(ordered[:2], [monthly_near, monthly_far])
        self.assertEqual(ordered[-1], weekly)


class PolygonGridPaginationTest(unittest.TestCase):
    def test_grid_merges_every_page_for_both_expired_states(self):
        client = object.__new__(bf.PolygonHistory)
        client._grid_cache = {}
        calls = []
        responses = [
            {'results': [{'expiration_date': '2026-04-01', 'strike_price': 685}], 'next_url': 'https://next/expired'},
            {'results': [{'expiration_date': '2026-04-17', 'strike_price': 685}]},
            {'results': [{'expiration_date': '2026-04-17', 'strike_price': 690}]},
        ]

        def fake_get(path_or_url, params=None):
            calls.append((path_or_url, params))
            return responses.pop(0)

        client._get = fake_get
        grid = client.expiry_strike_grid('SPY', date(2026, 3, 1), date(2026, 4, 30))

        self.assertEqual(grid[date(2026, 4, 1)], [685.0])
        self.assertEqual(grid[date(2026, 4, 17)], [685.0, 690.0])
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[1][0], 'https://next/expired')

    def test_grid_cache_reuses_rolling_bucket_without_widening_result(self):
        client = object.__new__(bf.PolygonHistory)
        client._grid_cache = {}
        calls = []
        responses = [
            {'results': [
                {'expiration_date': '2026-04-10', 'strike_price': 680},
                {'expiration_date': '2026-04-16', 'strike_price': 685},
            ]},
            {'results': []},
        ]

        def fake_get(path_or_url, params=None):
            calls.append((path_or_url, params))
            return responses.pop(0)

        client._get = fake_get
        first = client.expiry_strike_grid('SPY', date(2026, 3, 2), date(2026, 4, 15))
        second = client.expiry_strike_grid('SPY', date(2026, 3, 3), date(2026, 4, 16))

        self.assertEqual(len(calls), 2)  # one request for each expired state
        self.assertEqual(first, {date(2026, 4, 10): [680.0]})
        self.assertEqual(second, {
            date(2026, 4, 10): [680.0],
            date(2026, 4, 16): [685.0],
        })


class ExpiryFallbackTest(unittest.TestCase):
    def test_compute_day_falls_back_from_unlisted_weekly_to_monthly(self):
        as_of = date(2026, 3, 2)
        weekly = date(2026, 4, 1)
        monthly = date(2026, 4, 17)

        class FakePolygon:
            def expiry_strike_grid(self, symbol, exp_gte, exp_lte):
                return {weekly: [685.0], monthly: [685.0]}

            def option_close(self, ticker, day):
                if '260401' in ticker:
                    return None
                is_call = 'C00685000' in ticker
                return bs_price(686.0, 685.0, (monthly - as_of).days / 365, 0.045, 0.30, is_call)

        iv30, chosen, points = bf.compute_day_iv30(FakePolygon(), 'SPY', 686.0, as_of)
        self.assertIsNotNone(iv30)
        self.assertEqual(chosen[0], monthly)
        self.assertEqual(chosen[2], 46)
        self.assertEqual(len(points), 1)


class VolatilityRowTest(unittest.TestCase):
    def test_row_shape(self):
        row = bf.volatility_row('AAPL', date(2026, 3, 2), 0.28, date(2026, 4, 1), 340.0, 30)
        self.assertEqual(row['symbol'], 'AAPL')
        self.assertEqual(row['atm_iv'], 0.28)
        self.assertEqual(row['iv_source'], 'polygon_backfill_bs')
        self.assertEqual(row['atm_dte'], 30)


if __name__ == '__main__':
    unittest.main()
