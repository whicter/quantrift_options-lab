import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class PacingScopeIsolationTest(unittest.TestCase):
    """Different Polygon endpoints must not serialize behind one another.

    Every client hardcoded scope='stocks', so option-chain, price, reference and
    breadth requests -- separate endpoints with separate quotas -- shared a
    single 16s-spaced queue. Measured 2026-08-03: a price sweep costing 2.7h on
    its own took ~10h queued behind a round-the-clock option refresh, while total
    demand across all of them was only 33% of the budget. The limiter always
    accepted a scope; nothing ever passed one.
    """

    @staticmethod
    def _scope_for(factory):
        seen = {}

        class Recorder:
            def __init__(self, delay=None, state_path=None, scope='stocks', **_kw):
                seen['scope'] = scope

            def wait(self):
                return None

        with patch.dict('os.environ', {'POLYGON_API_KEY': 'test-key'}, clear=False), \
             patch('providers.polygon_http.PolygonStockRequestPacer', Recorder):
            factory()
        return seen.get('scope')

    def test_option_chain_and_price_use_different_queues(self):
        from providers.polygon_option_chain_provider import PolygonOptionChainProvider
        from providers.polygon_price_provider import PolygonPriceProvider

        options = self._scope_for(PolygonOptionChainProvider)
        prices = self._scope_for(PolygonPriceProvider)

        self.assertEqual(options, 'options')
        self.assertEqual(prices, 'stocks')
        self.assertNotEqual(options, prices, 'the two heaviest consumers must not share a queue')

    def test_low_volume_clients_do_not_sit_behind_the_heavy_ones(self):
        from providers.polygon_reference_provider import PolygonReferenceProvider
        from providers.polygon_market_breadth_provider import PolygonMarketBreadthProvider

        self.assertEqual(self._scope_for(PolygonReferenceProvider), 'reference')
        self.assertEqual(self._scope_for(PolygonMarketBreadthProvider), 'breadth')

    def test_every_scope_is_distinct(self):
        from providers.polygon_option_chain_provider import PolygonOptionChainProvider
        from providers.polygon_price_provider import PolygonPriceProvider
        from providers.polygon_reference_provider import PolygonReferenceProvider
        from providers.polygon_market_breadth_provider import PolygonMarketBreadthProvider

        scopes = [
            self._scope_for(PolygonOptionChainProvider),
            self._scope_for(PolygonPriceProvider),
            self._scope_for(PolygonReferenceProvider),
            self._scope_for(PolygonMarketBreadthProvider),
        ]
        self.assertEqual(len(scopes), len(set(scopes)), f'scopes collided: {scopes}')


if __name__ == '__main__':
    unittest.main()
