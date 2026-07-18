import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from providers.polygon_option_chain_provider import PolygonOptionChainProvider, build_term_structure
from providers.base import OptionContractSnapshot


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, responses):
        self.headers = {}
        self.responses = list(responses)
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return FakeResponse(self.responses.pop(0))


def option_item(expiry, right, strike=100):
    contract_type = 'call' if right == 'C' else 'put'
    return {
        'details': {
            'expiration_date': expiry.isoformat(),
            'strike_price': strike,
            'contract_type': contract_type,
            'ticker': f'O:TEST{expiry.strftime("%y%m%d")}{right}00100000',
        },
        'implied_volatility': 0.3,
        'greeks': {'delta': 0.2 if right == 'C' else -0.2, 'gamma': 0.02, 'theta': -0.01, 'vega': 0.1},
        'last_quote': {'bid': 1.0, 'ask': 1.2},
        'open_interest': 100,
        'day': {'volume': 10, 'close': 1.1},
    }


class PolygonOptionProviderTests(unittest.TestCase):
    def test_missing_30_to_45_dte_is_supplemented_and_preserved(self):
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            # dedicated ATM term-structure fetch (last call)
            {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
        ])
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        dtes = {(contract.expiry - today).days for contract in snapshot.contracts}
        self.assertEqual(dtes, {2, 35})
        option_calls = [call for call in session.calls if '/v3/snapshot/options/' in call[0]]
        # main chain, 30-45 supplement, then the term-structure fetch
        self.assertEqual(len(option_calls), 3)
        self.assertEqual(option_calls[1][1]['expiration_date.gte'], (today + timedelta(days=30)).isoformat())

    def test_term_structure_uses_a_narrow_dedicated_fetch(self):
        # The dedicated ATM fetch uses a narrow strike window and spans every
        # expiry it returns, independent of the bucket-trimmed stored chain.
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        far_expiry = today + timedelta(days=60)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            # dedicated term-structure fetch returns THREE expiries at the ATM strike
            {'status': 'OK', 'results': [
                option_item(short_expiry, 'C'), option_item(short_expiry, 'P'),
                option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P'),
                option_item(far_expiry, 'C'), option_item(far_expiry, 'P'),
            ]},
        ])
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'OPTION_TERM_STRUCTURE_STRIKE_PCT': '4',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        ts_dtes = {row['dte'] for row in snapshot.term_structure}
        self.assertEqual(ts_dtes, {2, 35, 60})
        # the dedicated fetch used the narrow ±4% window, not the ±15% chain window
        ts_call = [call for call in session.calls if '/v3/snapshot/options/' in call[0]][-1]
        self.assertEqual(ts_call[1]['strike_price.gte'], round(100 * 0.96, 4))

    def test_term_structure_falls_back_to_main_chain_on_fetch_error(self):
        # If the dedicated fetch fails, the snapshot still ships with a term
        # structure derived from the main chain rather than failing.
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([  # no term-structure response queued -> fetch raises
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        # fallback derives from the main-chain parsed contracts (2 and 35 DTE)
        self.assertEqual({row['dte'] for row in snapshot.term_structure}, {2, 35})


class BuildTermStructureTests(unittest.TestCase):
    def _c(self, expiry, right, strike, iv):
        return OptionContractSnapshot(
            symbol='T', expiry=expiry, strike=strike, right=right,
            bid=1.0, ask=1.1, last=1.0, mark=1.05, volume=1, open_interest=1, iv=iv,
            delta=None, gamma=None, theta=None, vega=None, rho=None,
        )

    def test_picks_nearest_strike_and_averages_call_put(self):
        today = date.today()
        e = today + timedelta(days=30)
        contracts = [
            self._c(e, 'C', 100, 0.30), self._c(e, 'P', 100, 0.34),
            self._c(e, 'C', 120, 0.50),  # farther strike ignored for ATM
        ]
        rows = build_term_structure(contracts, spot=101, today=today)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['atm_strike'], 100)
        self.assertAlmostEqual(rows[0]['atm_iv'], 0.32)
        self.assertEqual(rows[0]['dte'], 30)

    def test_skips_expiries_without_positive_iv_and_sorts(self):
        today = date.today()
        e1 = today + timedelta(days=10)
        e2 = today + timedelta(days=40)
        contracts = [
            self._c(e2, 'C', 100, 0.40),
            self._c(e1, 'C', 100, 0.0),  # no positive IV -> skipped
        ]
        rows = build_term_structure(contracts, spot=100, today=today)
        self.assertEqual([r['dte'] for r in rows], [40])

    def test_empty_inputs(self):
        self.assertEqual(build_term_structure([], 100), [])
        self.assertEqual(build_term_structure([self._c(date.today(), 'C', 100, 0.3)], 0), [])


if __name__ == '__main__':
    unittest.main()


class SpotHintTests(unittest.TestCase):
    """A fresh daily close from the database is an equally good previous-day
    spot, so passing it must remove the /prev request entirely."""

    def _provider(self, session):
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            return PolygonOptionChainProvider()

    def test_spot_hint_skips_the_prev_aggregate_request(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        # No /prev payload queued: if the provider asked for it, .pop(0) would
        # hand back the option page and the test would fail on the DTE window.
        session = FakeSession([
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        snapshot = provider.fetch_option_chain('TEST', spot_hint=100.0)

        prev_calls = [call for call in session.calls if '/prev' in call[0]]
        self.assertEqual(prev_calls, [])
        self.assertEqual(float(snapshot.underlying.price), 100.0)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'db_spot_hint')

    def test_no_hint_still_fetches_prev(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        provider.fetch_option_chain('TEST')

        prev_calls = [call for call in session.calls if '/prev' in call[0]]
        self.assertEqual(len(prev_calls), 1)
