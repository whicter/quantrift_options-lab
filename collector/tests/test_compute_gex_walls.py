import unittest
from datetime import date, datetime, timezone

import compute_gex


class ComputeGexWallTest(unittest.TestCase):
    def test_call_gex_is_positive_and_put_gex_is_negative(self):
        expiry = date(2026, 9, 18)
        contracts = [
            compute_gex.Contract(expiry, 100, 'C', 10, 1, 0.02, 0.30),
            compute_gex.Contract(expiry, 100, 'P', 5, 1, 0.02, 0.30),
        ]

        result = compute_gex.aggregate_by_strike(contracts, 100)[100]

        self.assertEqual(result['call_gex'], 200000)
        self.assertEqual(result['put_gex'], -100000)
        self.assertEqual(result['net_gex'], 100000)

    def test_walls_stay_on_their_expected_side_of_spot(self):
        snapshot = {
            'id': 1,
            'symbol': 'TEST',
            'snapshot_ts': datetime.now(timezone.utc),
            'source': 'test',
            'underlying_price': 100,
            'missing_greeks_ratio': 0,
            'missing_oi_ratio': 0,
            'completeness_pct': 100,
        }
        expiry = date(2026, 9, 18)
        contracts = [
            compute_gex.Contract(expiry, 90, 'C', 1000, 10, 0.10, 0.30),
            compute_gex.Contract(expiry, 110, 'C', 100, 10, 0.05, 0.30),
            compute_gex.Contract(expiry, 90, 'P', 100, 10, 0.05, 0.30),
            compute_gex.Contract(expiry, 110, 'P', 1000, 10, 0.10, 0.30),
        ]

        result = compute_gex.compute_for_snapshot(snapshot, contracts)

        self.assertEqual(result['call_wall'], 110)
        self.assertEqual(result['put_wall'], 90)

    def test_wall_is_missing_when_no_strike_exists_on_expected_side(self):
        by_strike = {90: {'call_gex': 100}, 110: {'put_abs_gex': 100}}

        self.assertIsNone(compute_gex._max_strike_by(by_strike, 'call_gex', min_strike=100))
        self.assertIsNone(compute_gex._max_strike_by(by_strike, 'put_abs_gex', max_strike=100))

    def test_gamma_flip_interpolates_sign_change(self):
        curve = [
            {'price': 90, 'net_gex': -300},
            {'price': 100, 'net_gex': 100},
        ]

        self.assertEqual(compute_gex.find_gamma_flip(curve), 97.5)

    def test_gamma_flip_falls_back_to_nearest_zero(self):
        curve = [
            {'price': 90, 'net_gex': 30},
            {'price': 100, 'net_gex': 5},
            {'price': 110, 'net_gex': 20},
        ]

        self.assertEqual(compute_gex.find_gamma_flip(curve), 100)

    def test_pcr_division_by_zero_returns_missing(self):
        self.assertIsNone(compute_gex._safe_ratio(100, 0))
        self.assertEqual(compute_gex._safe_ratio(100, 50), 2)

    def test_confidence_downgrades_with_completeness(self):
        expiry = date(2026, 9, 18)
        contracts = [compute_gex.Contract(expiry, 100, 'C', 10, 1, 0.02, 0.30)] * 10

        high = {'completeness_pct': 98, 'missing_greeks_ratio': 0.01, 'missing_oi_ratio': 0.02}
        medium = {'completeness_pct': 80, 'missing_greeks_ratio': 0.10, 'missing_oi_ratio': 0.10}
        low = {'completeness_pct': 70, 'missing_greeks_ratio': 0.20, 'missing_oi_ratio': 0.20}

        self.assertEqual(compute_gex.confidence_for(high, contracts), 'high')
        self.assertEqual(compute_gex.confidence_for(medium, contracts), 'medium')
        self.assertEqual(compute_gex.confidence_for(low, contracts), 'low')


if __name__ == '__main__':
    unittest.main()
