import os
import sys
import unittest
from datetime import timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collect_unusual_whales import normalize_message, run
from providers.unusual_whales_stream_provider import UnusualWhalesStreamProvider


class FakeConnection:
    def __init__(self, messages):
        self.messages = list(messages)
        self.sent = []
        self.closed = False

    def send(self, message):
        self.sent.append(message)

    def recv(self):
        return self.messages.pop(0)

    def close(self):
        self.closed = True


class UnusualWhalesFlowTests(unittest.TestCase):
    def test_normalizes_official_flow_alert_fields_and_osi_contract(self):
        event = normalize_message({'topic': 'flow-alerts', 'data': {
            'id': 'flow-1', 'ticker': 'pltr', 'option_chain': 'PLTR260821C00150000',
            'underlying_price': 141.25, 'price': 3.1, 'total_size': 200,
            'total_premium': 62000, 'total_ask_side_prem': 50000,
            'total_bid_side_prem': 12000, 'open_interest': 1000, 'volume': 2200,
            'has_sweep': True, 'all_opening_trades': True, 'executed_at': 1787000000000,
        }})
        self.assertEqual(event['event_type'], 'option_flow')
        self.assertEqual(event['symbol'], 'PLTR')
        self.assertEqual(str(event['expiry']), '2026-08-21')
        self.assertEqual(event['option_right'], 'C')
        self.assertEqual(event['strike'], Decimal('150'))
        self.assertTrue(event['has_sweep'])
        self.assertEqual(event['executed_at'].tzinfo, timezone.utc)

    def test_only_trf_market_centers_become_dark_pool_events(self):
        base = {'topic': 'all-trade-report', 'data': {
            'symbol': 'AAPL', 'control_number': 'print-1', 'price': '215.50',
            'size': 10000, 'volume': 20000, 'executed_at': 1787000000000,
        }}
        lit = {'topic': base['topic'], 'data': {**base['data'], 'market_center': 'Q'}}
        dark = {'topic': base['topic'], 'data': {**base['data'], 'market_center': 'L'}}
        self.assertIsNone(normalize_message(lit))
        event = normalize_message(dark)
        self.assertEqual(event['event_type'], 'dark_pool')
        self.assertEqual(event['premium'], Decimal('2155000.00'))

    def test_flow_without_required_identity_or_timestamp_is_rejected(self):
        self.assertIsNone(normalize_message({'topic': 'flow-alerts', 'data': {
            'id': 'flow-1', 'ticker': 'AAPL', 'option_chain': 'AAPL260821C00200000',
        }}))

    @patch.dict(os.environ, {}, clear=True)
    def test_collector_is_disabled_safe_without_credentials(self):
        self.assertEqual(run(), {'status': 'disabled', 'received': 0, 'inserted': 0})

    @patch.dict(os.environ, {
        'UW_WS_URL': 'wss://example.test/feed', 'UW_API_TOKEN': 'token',
        'UW_WS_SUBSCRIBE_JSON': '{"topics":["flow-alerts"]}',
    }, clear=False)
    def test_websocket_transport_sends_account_subscription_and_closes(self):
        connection = FakeConnection(['{"topic":"heartbeat"}'])
        calls = []

        def factory(url, **kwargs):
            calls.append((url, kwargs))
            return connection

        provider = UnusualWhalesStreamProvider(factory)
        self.assertEqual(list(provider.messages(1)), [{'topic': 'heartbeat'}])
        self.assertEqual(calls[0][0], 'wss://example.test/feed')
        self.assertIn('Authorization: Bearer token', calls[0][1]['header'])
        self.assertEqual(connection.sent, ['{"topics":["flow-alerts"]}'])
        self.assertTrue(connection.closed)


if __name__ == '__main__':
    unittest.main()
