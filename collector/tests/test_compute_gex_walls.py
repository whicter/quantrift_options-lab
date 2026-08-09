import unittest
from datetime import date, datetime, timezone

import compute_gex


class ComputeGexWallTest(unittest.TestCase):
    def test_gex_is_scaled_to_a_one_percent_underlying_move(self):
        expiry = date(2026, 9, 18)
        contracts = [
            compute_gex.Contract(expiry, 100, 'C', 10, 1, 0.02, 0.30),
            compute_gex.Contract(expiry, 100, 'P', 5, 1, 0.02, 0.30),
        ]

        result = compute_gex.aggregate_by_strike(contracts, 100)[100]

        self.assertEqual(result['call_gex'], 2000)
        self.assertEqual(result['put_gex'], -1000)
        self.assertEqual(result['net_gex'], 1000)

    def test_gex_metadata_discloses_unit_and_positioning_proxy(self):
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
        contract = compute_gex.Contract(date(2026, 9, 18), 100, 'C', 10, 1, 0.02, 0.30)
        result = compute_gex.compute_for_snapshot(snapshot, [contract])

        self.assertEqual(result['raw_metrics']['unit'], 'usd_delta_change_per_1pct_move')
        self.assertEqual(result['raw_metrics']['model_version'], 'gex-v2-1pct-positioning-proxy')
        self.assertEqual(result['raw_metrics']['underlying_move_pct'], 1.0)
        self.assertEqual(result['raw_metrics']['positioning_model'], 'call_positive_put_negative_proxy')
        self.assertIn('does not identify actual dealer positions', result['raw_metrics']['positioning_assumption'])

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

    def test_gamma_curve_uses_snapshot_valuation_date_not_runtime_date(self):
        contract = compute_gex.Contract(date(2026, 9, 18), 100, 'C', 10, 1, 0.02, 0.30)

        first = compute_gex.compute_gamma_curve([contract], 100, date(2026, 7, 16))
        second = compute_gex.compute_gamma_curve([contract], 100, date(2026, 7, 16))

        self.assertEqual(first, second)

    def test_pcr_division_by_zero_returns_missing(self):
        self.assertIsNone(compute_gex._safe_ratio(100, 0))
        self.assertEqual(compute_gex._safe_ratio(100, 50), 2)

    @staticmethod
    def _wide_chain(spot=100.0):
        """覆盖面充足的链：spot ±10%、4 个到期。

        原 fixture 是「10 个完全相同的合约、单一行权价、单一到期」——
        它测的是完整性分档，但这种链在生产里根本支撑不起 wall
        （wall 只能落在唯一那个行权价上）。加覆盖面守卫后它会被判 low，
        故换成真实形状，让这条测试继续只测它本来要测的东西。
        """
        return [compute_gex.Contract(exp, strike, right, 10, 1, 0.02, 0.30)
                for exp in (date(2026, 9, 18), date(2026, 10, 16),
                            date(2026, 11, 20), date(2026, 12, 18))
                for strike in (spot * 0.90, spot * 0.95, spot, spot * 1.05, spot * 1.10)
                for right in ('C', 'P')]

    def test_confidence_downgrades_with_completeness(self):
        contracts = self._wide_chain()

        high = {'completeness_pct': 98, 'missing_greeks_ratio': 0.01,
                'missing_oi_ratio': 0.02, 'underlying_price': 100}
        medium = {'completeness_pct': 80, 'missing_greeks_ratio': 0.10,
                  'missing_oi_ratio': 0.10, 'underlying_price': 100}
        low = {'completeness_pct': 70, 'missing_greeks_ratio': 0.20,
               'missing_oi_ratio': 0.20, 'underlying_price': 100}

        self.assertEqual(compute_gex.confidence_for(high, contracts), 'high')
        self.assertEqual(compute_gex.confidence_for(medium, contracts), 'medium')
        self.assertEqual(compute_gex.confidence_for(low, contracts), 'low')

    def test_narrow_chain_cannot_be_high_confidence(self):
        """2026-08-09 实测缺陷的回归：QQQ 36 合约、3 到期、行权 721–726
        （spot 723.03，仅 ±0.4%），missing_greeks_ratio=0 ⇒ 判成 high。

        此时 call_wall/put_wall 挑出的是**采集边界**而非 gamma 集中处，
        推出去会显得很精确但其实是错的点位。完整性守卫防的是数据缺失，
        防不住采集面太窄——必须由覆盖面守卫接住。
        """
        spot = 723.03
        narrow = [compute_gex.Contract(exp, strike, right, 500, 10, 0.02, 0.30)
                  for exp in (date(2026, 8, 10), date(2026, 8, 11), date(2026, 9, 11))
                  for strike in (721, 723, 725, 726)
                  for right in ('C', 'P')]
        perfect = {'completeness_pct': 100, 'missing_greeks_ratio': 0,
                   'missing_oi_ratio': 0, 'underlying_price': spot}

        self.assertEqual(compute_gex.confidence_for(perfect, narrow, spot), 'low',
                         '数据零缺失但覆盖面仅 ±0.4%，不得判 high')

        cov = compute_gex.strike_coverage(narrow, spot)
        self.assertLess(cov['above_pct'], 1.0)
        self.assertLess(cov['below_pct'], 1.0)
        self.assertEqual(cov['expiries'], 3)

    def test_one_sided_coverage_is_not_enough(self):
        """只有上方有行权价 → 下方的 put wall 无从谈起。"""
        spot = 100.0
        upper_only = [compute_gex.Contract(exp, s, r, 10, 1, 0.02, 0.30)
                      for exp in (date(2026, 9, 18), date(2026, 10, 16),
                                  date(2026, 11, 20), date(2026, 12, 18))
                      for s in (100, 105, 110) for r in ('C', 'P')]
        snap = {'completeness_pct': 100, 'missing_greeks_ratio': 0,
                'missing_oi_ratio': 0, 'underlying_price': spot}
        self.assertEqual(compute_gex.confidence_for(snap, upper_only, spot), 'low')

    def test_missing_spot_fails_closed(self):
        """拿不到 spot 就无法判断覆盖面——fail closed 判 low，不做乐观假设。"""
        contracts = self._wide_chain()
        snap = {'completeness_pct': 100, 'missing_greeks_ratio': 0,
                'missing_oi_ratio': 0}          # 无 underlying_price
        self.assertEqual(compute_gex.confidence_for(snap, contracts), 'low')

    def test_coverage_metrics_are_reported(self):
        cov = compute_gex.strike_coverage(self._wide_chain(), 100.0)
        self.assertEqual(cov['strikes'], 5)
        self.assertEqual(cov['expiries'], 4)
        self.assertAlmostEqual(cov['below_pct'], 10.0, places=6)
        self.assertAlmostEqual(cov['above_pct'], 10.0, places=6)
        self.assertEqual(compute_gex.strike_coverage([], 100)['strikes'], 0)


if __name__ == '__main__':
    unittest.main()
