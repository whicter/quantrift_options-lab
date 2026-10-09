import json
import unittest
from unittest.mock import patch

from providers import tastytrade_dxlink as dx


class _FakeWs:
    """Records what was sent; replies just enough to reach the subscribe step."""

    def __init__(self):
        self.sent = []
        self._inbox = [
            {'type': 'SETUP', 'channel': 0},
            {'type': 'AUTH_STATE', 'channel': 0, 'state': 'AUTHORIZED'},
            {'type': 'CHANNEL_OPENED', 'channel': 1},
        ]

    def send(self, raw):
        self.sent.append(json.loads(raw))

    def recv(self):
        if self._inbox:
            return json.dumps(self._inbox.pop(0))
        raise dx.websocket.WebSocketTimeoutException()

    def settimeout(self, _):
        pass

    def close(self):
        pass


class SubscriptionChunkingTests(unittest.TestCase):
    """DXLink drops the channel when a subscription frame passes 64KB.

    Measured 2026-10-09: five underlyings' chains are 922 contracts, and at
    three event types that is 2,766 entries in one frame. The server answered
    `INVALID_MESSAGE / Max frame length of 65536 has been exceeded` on channel 0
    and sent no data at all -- which reads like a missing entitlement rather
    than an oversized message, so it is worth a test that pins the behaviour.
    """

    def _subscribe(self, symbols, event_types=('Quote', 'Greeks', 'Summary')):
        ws = _FakeWs()
        token = dx.DxlinkQuoteToken(token='t', dxlink_url='wss://example/delayed')
        with patch.object(dx.websocket, 'create_connection', return_value=ws):
            dx.collect_dxlink_events(token, list(symbols), list(event_types), timeout_seconds=0.01)
        return ws, [m for m in ws.sent if m.get('type') == 'FEED_SUBSCRIPTION']

    def test_a_large_subscription_is_split_across_frames(self):
        symbols = [f'.SPY2610{i:03d}C500' for i in range(400)]   # 1,200 entries
        _, frames = self._subscribe(symbols)

        self.assertGreater(len(frames), 1, 'expected the subscription to be chunked')
        self.assertTrue(all(len(f['add']) <= dx.SUBSCRIPTION_CHUNK for f in frames))

    def test_every_symbol_and_event_type_still_gets_subscribed(self):
        symbols = [f'.SPY2610{i:03d}C500' for i in range(400)]
        _, frames = self._subscribe(symbols)

        sent = {(e['symbol'], e['type']) for f in frames for e in f['add']}
        self.assertEqual(len(sent), len(symbols) * 3, 'chunking dropped entries')
        for symbol in symbols:
            for event_type in ('Quote', 'Greeks', 'Summary'):
                self.assertIn((symbol, event_type), sent)

    def test_every_frame_stays_well_under_the_64kb_ceiling(self):
        symbols = [f'.SPY2610{i:03d}C500' for i in range(400)]
        ws, frames = self._subscribe(symbols)
        for frame in frames:
            self.assertLess(len(json.dumps(frame).encode('utf-8')), 65536)

    def test_a_small_subscription_still_uses_a_single_frame(self):
        _, frames = self._subscribe(['.SPY261113P719'])
        self.assertEqual(len(frames), 1)
        self.assertEqual(len(frames[0]['add']), 3)

    def test_no_symbols_short_circuits_without_connecting(self):
        token = dx.DxlinkQuoteToken(token='t', dxlink_url='wss://example/delayed')
        with patch.object(dx.websocket, 'create_connection',
                          side_effect=AssertionError('connected with no symbols')):
            result = dx.collect_dxlink_events(token, [], ['Quote'])
        self.assertEqual(result['errors'], ['no_symbols'])


if __name__ == '__main__':
    unittest.main()
