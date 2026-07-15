import unittest
from datetime import date, datetime, timezone

import compute_gex


class ComputeGexWallTest(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
