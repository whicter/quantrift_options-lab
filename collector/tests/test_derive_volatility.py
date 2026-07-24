import math
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock

from derive_volatility import (
    annualized_hv,
    build_cm30_rows,
    build_hv_rows,
    calculate_iv_rank,
    fetch_atm_observations,
    fetch_cm30_observations,
)
import implied_vol as iv


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


class Cm30ObservationTests(unittest.TestCase):
    @staticmethod
    def _row(symbol, metric_date, expiry_dte, strike, call_iv, put_iv, snapshot_id=1, source='polygon_licensed'):
        return {
            'symbol': symbol, 'metric_date': metric_date, 'snapshot_id': snapshot_id,
            'source': source, 'expiry': metric_date + timedelta(days=expiry_dte),
            'dte': expiry_dte, 'strike': strike, 'call_iv': call_iv, 'put_iv': put_iv,
        }

    def test_interpolates_to_constant_30_day_and_labels_source(self):
        d = date(2026, 7, 23)
        raw = [
            self._row('TSLA', d, 24, 320, 0.50, 0.52),  # atm 0.51
            self._row('TSLA', d, 33, 320, 0.40, 0.42),  # atm 0.41
        ]
        rows = build_cm30_rows(raw, target_days=30)
        self.assertEqual(len(rows), 1)
        expected = iv.constant_maturity_iv([(24, 0.51), (33, 0.41)], 30)
        self.assertAlmostEqual(rows[0]['atm_iv'], expected)
        self.assertEqual(rows[0]['iv_source'], 'polygon_snapshot_cm30')

    def test_provenance_anchors_to_the_expiry_nearest_the_target(self):
        d = date(2026, 7, 23)
        raw = [
            self._row('SPY', d, 14, 500, 0.14, 0.14),
            self._row('SPY', d, 28, 500, 0.15, 0.15),  # nearest to 30
            self._row('SPY', d, 49, 500, 0.16, 0.16),
        ]
        rows = build_cm30_rows(raw, target_days=30)
        self.assertEqual(rows[0]['atm_dte'], 28)
        self.assertEqual(rows[0]['atm_expiry'], d + timedelta(days=28))

    def test_symbol_day_without_usable_iv_is_dropped(self):
        d = date(2026, 7, 23)
        raw = [self._row('XYZ', d, 30, 100, None, None)]
        self.assertEqual(build_cm30_rows(raw, target_days=30), [])

    def test_groups_independently_per_symbol_day(self):
        d1, d2 = date(2026, 7, 22), date(2026, 7, 23)
        raw = [
            self._row('AAPL', d1, 28, 210, 0.20, 0.20),
            self._row('AAPL', d2, 28, 210, 0.25, 0.25),
            self._row('MSFT', d2, 28, 400, 0.18, 0.18),
        ]
        rows = build_cm30_rows(raw, target_days=30)
        self.assertEqual({(r['symbol'], r['metric_date']) for r in rows},
                         {('AAPL', d1), ('AAPL', d2), ('MSFT', d2)})

    def test_query_brackets_30_dte_and_reads_snapshot_iv_both_rights(self):
        cursor = MagicMock()
        cursor.description = []
        cursor.fetchall.return_value = []
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor

        fetch_cm30_observations(connection, ['QQQ'], dte_min=12, dte_max=50)

        sql, params = cursor.execute.call_args.args
        self.assertIn("FILTER (WHERE c.option_right = 'C')", sql)
        self.assertIn("FILTER (WHERE c.option_right = 'P')", sql)
        self.assertIn("snapshot_ts AT TIME ZONE 'America/New_York'", sql)
        self.assertEqual(params, (['QQQ'], 12, 50))


if __name__ == '__main__':
    unittest.main()
