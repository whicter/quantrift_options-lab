import math
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock

from derive_volatility import annualized_hv, build_hv_rows, calculate_iv_rank, fetch_atm_observations


class DerivedVolatilityTests(unittest.TestCase):
    def test_hv_uses_log_returns_sample_stddev_and_252_annualization(self):
        closes = [100.0]
        returns = [0.01, -0.02, 0.015, -0.005]
        for value in returns:
            closes.append(closes[-1] * math.exp(value))

        result = annualized_hv(closes, 4)

        mean = sum(returns) / len(returns)
        expected = math.sqrt(sum((value - mean) ** 2 for value in returns) / 3) * math.sqrt(252)
        self.assertAlmostEqual(result, expected)

    def test_hv_rows_do_not_mix_non_price_sources_inside_calculation(self):
        start = date(2026, 1, 1)
        prices = [(start + timedelta(days=index), 100 + index) for index in range(100)]

        rows = build_hv_rows('AAPL', prices)

        self.assertEqual(rows[-1]['hv_source'], 'polygon_derived')
        self.assertEqual(rows[-1]['hv30_observations'], 30)
        self.assertEqual(rows[-1]['hv60_observations'], 60)
        self.assertEqual(rows[-1]['hv90_observations'], 90)

    def test_iv_rank_is_fail_closed_before_252_observations(self):
        result = calculate_iv_rank([0.2, 0.3, 0.25], min_observations=252)
        self.assertEqual(result, {
            'iv_rank': None,
            'iv_percentile': None,
            'count': 3,
            'ready': False,
        })

    def test_iv_rank_and_percentile_are_computed_when_ready(self):
        values = [0.10 + index / 1000 for index in range(251)] + [0.20]

        result = calculate_iv_rank(values, min_observations=252)

        self.assertTrue(result['ready'])
        self.assertEqual(result['count'], 252)
        self.assertAlmostEqual(result['iv_rank'], 40.0)
        self.assertAlmostEqual(result['iv_percentile'], 40.48)

    def test_atm_observation_uses_new_york_market_date(self):
        cursor = MagicMock()
        cursor.description = []
        cursor.fetchall.return_value = []
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor

        fetch_atm_observations(connection, ['QQQ'])

        sql = cursor.execute.call_args.args[0]
        self.assertIn("snapshot_ts AT TIME ZONE 'America/New_York'", sql)
        self.assertNotIn('snapshot_ts::date', sql)


if __name__ == '__main__':
    unittest.main()
