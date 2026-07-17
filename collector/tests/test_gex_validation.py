import unittest

from gex_validation import validate_fixture


class GexValidationFixtureTest(unittest.TestCase):
    def test_fixed_etf_and_single_stock_fixture_is_reproducible(self):
        result = validate_fixture()

        self.assertEqual(result['fixture_version'], 'gex-validation-v1')
        self.assertEqual(result['model_version'], 'gex-v2-1pct-positioning-proxy')
        self.assertEqual(result['gamma_flip'], 97.5)
        self.assertEqual([row['symbol'] for row in result['validated']], ['SPY', 'AAPL'])


if __name__ == '__main__':
    unittest.main()
