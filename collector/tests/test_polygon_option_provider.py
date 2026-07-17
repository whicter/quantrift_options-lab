import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from providers.polygon_option_chain_provider import PolygonOptionChainProvider


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
        self.assertEqual(len(option_calls), 2)
        self.assertEqual(option_calls[1][1]['expiration_date.gte'], (today + timedelta(days=30)).isoformat())


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
        ])
        provider = self._provider(session)
        provider.fetch_option_chain('TEST')

        prev_calls = [call for call in session.calls if '/prev' in call[0]]
        self.assertEqual(len(prev_calls), 1)
