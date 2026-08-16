import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from providers.polygon_rate_limit import PolygonStockRequestPacer  # noqa: E402


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
    def _scopes_for(factory):
        """Every scope a provider opens, in construction order.

        A provider may legitimately open more than one: the breadth collector
        reads grouped daily AND /v3/reference/tickers, which are separate
        endpoints with separate limits (5 vs 20+ req/min, measured 2026-08-15).
        Recording only the last one hid that.
        """
        seen = []

        class Recorder:
            def __init__(self, delay=None, state_path=None, scope='stocks', **_kw):
                seen.append(scope)

            def wait(self):
                return None

        with patch.dict('os.environ', {'POLYGON_API_KEY': 'test-key'}, clear=False), \
             patch('providers.polygon_http.PolygonStockRequestPacer', Recorder):
            factory()
        return seen

    @classmethod
    def _scope_for(cls, factory):
        """The provider's primary scope -- the first queue it opens."""
        scopes = cls._scopes_for(factory)
        return scopes[0] if scopes else None

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

        # The breadth collector also sweeps /v3/reference/tickers to build its
        # universe. That is the ticker-reference endpoint, not grouped daily, so
        # it belongs on the reference queue -- sharing a scope with
        # PolygonReferenceProvider is correct here precisely because they call
        # the SAME endpoint. Pacing it as breadth charged a 20+ req/min endpoint
        # the 5 req/min interval: measured 7 requests over the three MICs, 112s
        # at 16s apiece against 3.1s of actual network time.
        self.assertEqual(
            self._scopes_for(PolygonMarketBreadthProvider), ['breadth', 'reference'],
        )

    def test_every_scope_is_distinct(self):
        from providers.polygon_option_chain_provider import PolygonOptionChainProvider
        from providers.polygon_price_provider import PolygonPriceProvider
        from providers.polygon_reference_provider import PolygonReferenceProvider
        from providers.polygon_market_breadth_provider import PolygonMarketBreadthProvider

        # Primary scopes, i.e. the queue each provider's own bulk endpoint uses.
        # Secondary scopes are excluded deliberately: two providers sharing a
        # scope is only a collision when they are hitting DIFFERENT endpoints,
        # and the breadth collector's second scope is the reference endpoint
        # itself. Comparing every scope would forbid the correct sharing.
        scopes = [
            self._scope_for(PolygonOptionChainProvider),
            self._scope_for(PolygonPriceProvider),
            self._scope_for(PolygonReferenceProvider),
            self._scope_for(PolygonMarketBreadthProvider),
        ]
        self.assertEqual(len(scopes), len(set(scopes)), f'scopes collided: {scopes}')


if __name__ == '__main__':
    unittest.main()


class ScopeDelayTests(unittest.TestCase):
    """Each pacing scope may carry its own interval, not just its own counter.

    Scopes were introduced so option pagination would stop queueing behind the
    price sweep, but only the counters were separated -- every scope still read
    POLYGON_STOCK_REQUEST_DELAY. Options therefore inherited 16s, a value that
    originated as a price-collection default and was never measured against the
    options endpoints. A chain fetch issues ~35 requests, so that was ~9 minutes
    of deliberate sleeping inside a 601s median job, and it -- not the provider's
    15-minute delay -- was what made intraday chains stale.
    """

    def _delay(self, scope, env):
        with patch.dict(os.environ, env, clear=False):
            return PolygonStockRequestPacer(scope=scope).delay

    def test_scope_specific_delay_overrides_the_stock_default(self):
        env = {'POLYGON_STOCK_REQUEST_DELAY': '16', 'POLYGON_OPTIONS_REQUEST_DELAY': '1.5'}
        self.assertEqual(self._delay('options', env), 1.5)

    def test_other_scopes_are_untouched_by_an_options_override(self):
        # Lowering the option interval must not quietly speed up the price sweep
        # or the breadth collector, whose limits were never probed.
        env = {'POLYGON_STOCK_REQUEST_DELAY': '16', 'POLYGON_OPTIONS_REQUEST_DELAY': '1.5'}
        self.assertEqual(self._delay('stocks', env), 16.0)
        self.assertEqual(self._delay('breadth', env), 16.0)

    def test_absent_override_falls_back_to_the_previous_behaviour(self):
        env = {'POLYGON_STOCK_REQUEST_DELAY': '16'}
        for scope in ('stocks', 'options', 'breadth'):
            with self.subTest(scope=scope):
                self.assertEqual(self._delay(scope, env), 16.0)

    def test_an_explicit_delay_argument_still_wins(self):
        with patch.dict(os.environ, {'POLYGON_OPTIONS_REQUEST_DELAY': '1.5'}, clear=False):
            self.assertEqual(PolygonStockRequestPacer(scope='options', delay=7).delay, 7.0)
