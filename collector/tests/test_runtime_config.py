import unittest
from pathlib import Path


class RuntimeConfigTests(unittest.TestCase):
    def test_pm2_config_uses_polygon_without_embedding_credentials(self):
        config_path = Path(__file__).resolve().parents[1] / 'ecosystem.config.cjs'
        config = config_path.read_text(encoding='utf-8')

        self.assertIn("OPTION_REFRESH_PROVIDER: 'polygon_licensed'", config)
        self.assertIn("PRICE_PROVIDER: 'polygon'", config)
        self.assertIn("SYMBOLS: 'watchlist'", config)
        self.assertIn("PRICE_30M_LOOKBACK_DAYS: '35'", config)
        self.assertGreaterEqual(config.count("POLYGON_STOCK_REQUEST_DELAY: '16'"), 2)
        self.assertIn("COLLECTOR_HEALTH_CHECK_ENABLED: 'true'", config)
        self.assertNotIn('POLYGON_API_KEY:', config)


if __name__ == '__main__':
    unittest.main()
