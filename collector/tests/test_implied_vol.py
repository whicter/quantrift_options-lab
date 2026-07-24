import math
import unittest

import implied_vol as iv


class BlackScholesTest(unittest.TestCase):
    def test_norm_cdf_known_values(self):
        self.assertAlmostEqual(iv.norm_cdf(0.0), 0.5, places=9)
        self.assertAlmostEqual(iv.norm_cdf(1.96), 0.9750, places=3)
        self.assertAlmostEqual(iv.norm_cdf(-1.96), 0.0250, places=3)

    def test_put_call_parity(self):
        spot, strike, t, rate, sigma = 100.0, 100.0, 0.25, 0.045, 0.30
        call = iv.bs_price(spot, strike, t, rate, sigma, True)
        put = iv.bs_price(spot, strike, t, rate, sigma, False)
        # C - P == S - K e^{-rT}
        self.assertAlmostEqual(call - put, spot - strike * math.exp(-rate * t), places=9)

    def test_bs_price_rejects_nonpositive_inputs(self):
        self.assertIsNone(iv.bs_price(100, 100, 0, 0.045, 0.30, True))
        self.assertIsNone(iv.bs_price(100, 100, 0.25, 0.045, 0, True))
        self.assertIsNone(iv.bs_price(0, 100, 0.25, 0.045, 0.30, True))


class ImpliedVolTest(unittest.TestCase):
    def test_round_trips_a_known_sigma(self):
        for sigma in (0.15, 0.30, 0.65, 1.20):
            for is_call in (True, False):
                price = iv.bs_price(100, 105, 0.10, 0.045, sigma, is_call)
                recovered = iv.implied_vol_from_price(price, 100, 105, 0.10, 0.045, is_call)
                self.assertIsNotNone(recovered)
                self.assertAlmostEqual(recovered, sigma, places=4)

    def test_price_below_intrinsic_is_none(self):
        # Deep ITM call priced below its intrinsic value is not arbitrage-consistent.
        self.assertIsNone(iv.implied_vol_from_price(1.0, 200, 100, 0.10, 0.045, True))

    def test_price_above_maximum_is_none(self):
        # A call cannot be worth more than the underlying.
        self.assertIsNone(iv.implied_vol_from_price(250.0, 100, 100, 0.10, 0.045, True))

    def test_nonpositive_inputs_are_none(self):
        self.assertIsNone(iv.implied_vol_from_price(0, 100, 100, 0.10, 0.045, True))
        self.assertIsNone(iv.implied_vol_from_price(5, 100, 100, 0, 0.045, True))
        self.assertIsNone(iv.implied_vol_from_price(None, 100, 100, 0.10, 0.045, True))


class ConstantMaturityTest(unittest.TestCase):
    def test_interpolates_in_total_variance(self):
        result = iv.constant_maturity_iv([(20, 0.30), (45, 0.20)], 30)
        var20, var45 = 0.30 ** 2 * 20, 0.20 ** 2 * 45
        weight = (30 - 20) / (45 - 20)
        expected = math.sqrt((var20 + weight * (var45 - var20)) / 30)
        self.assertAlmostEqual(result, expected, places=9)

    def test_single_point_returns_itself(self):
        self.assertAlmostEqual(iv.constant_maturity_iv([(35, 0.42)], 30), 0.42)

    def test_holds_nearest_flat_outside_range(self):
        self.assertAlmostEqual(iv.constant_maturity_iv([(40, 0.25), (70, 0.22)], 30), 0.25)  # below shortest
        self.assertAlmostEqual(iv.constant_maturity_iv([(10, 0.50), (20, 0.40)], 30), 0.40)  # above longest

    def test_empty_or_invalid_is_none(self):
        self.assertIsNone(iv.constant_maturity_iv([], 30))
        self.assertIsNone(iv.constant_maturity_iv([(None, 0.30), (20, None), (-5, 0.3), (30, 0)], 30))

    def test_atm_iv_from_call_put(self):
        self.assertAlmostEqual(iv.atm_iv_from_call_put(0.30, 0.32), 0.31)
        self.assertAlmostEqual(iv.atm_iv_from_call_put(0.30, None), 0.30)
        self.assertIsNone(iv.atm_iv_from_call_put(None, None))


class ConstantMaturityAtmIvTest(unittest.TestCase):
    def test_averages_call_put_then_interpolates_to_target(self):
        # Expiry 20d: atm=(0.30+0.32)/2=0.31; expiry 45d: atm=(0.20+0.22)/2=0.21.
        # Same as constant_maturity_iv([(20,0.31),(45,0.21)], 30).
        expected = iv.constant_maturity_iv([(20, 0.31), (45, 0.21)], 30)
        result = iv.constant_maturity_atm_iv([(20, 0.30, 0.32), (45, 0.20, 0.22)], 30)
        self.assertAlmostEqual(result, expected)

    def test_missing_leg_uses_the_present_one(self):
        # 24d put-only -> atm 0.40; 33d call-only -> atm 0.30.
        expected = iv.constant_maturity_iv([(24, 0.40), (33, 0.30)], 30)
        result = iv.constant_maturity_atm_iv([(24, None, 0.40), (33, 0.30, None)], 30)
        self.assertAlmostEqual(result, expected)

    def test_single_usable_expiry_holds_flat(self):
        self.assertAlmostEqual(iv.constant_maturity_atm_iv([(35, 0.42, 0.44)], 30), 0.43)

    def test_no_usable_leg_is_none(self):
        self.assertIsNone(iv.constant_maturity_atm_iv([(20, None, None), (40, 0, 0)], 30))


if __name__ == '__main__':
    unittest.main()
