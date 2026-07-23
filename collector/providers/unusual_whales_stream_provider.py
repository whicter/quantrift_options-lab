from __future__ import annotations

import json
import os
from collections.abc import Iterator

import websocket


class UnusualWhalesStreamProvider:
    source = 'unusual_whales'

    def __init__(self, connection_factory=None) -> None:
        self.url = os.getenv('UW_WS_URL', '').strip()
        self.api_token = os.getenv('UW_API_TOKEN', '').strip()
        self.user_agent = os.getenv('UW_USER_AGENT', 'Quantrift/1.0').strip()
        self.subscribe_json = os.getenv('UW_WS_SUBSCRIBE_JSON', '').strip()
        self.timeout = max(float(os.getenv('UW_WS_TIMEOUT_SECONDS', '30')), 1)
        if not self.url or not self.api_token:
            raise RuntimeError('UW_WS_URL and UW_API_TOKEN are required')
        self._connection_factory = connection_factory or websocket.create_connection

    def messages(self, max_messages: int = 0) -> Iterator[dict]:
        headers = [f'Authorization: Bearer {self.api_token}', f'User-Agent: {self.user_agent}']
        connection = self._connection_factory(self.url, header=headers, timeout=self.timeout)
        try:
            if self.subscribe_json:
                subscription = json.loads(self.subscribe_json)
                connection.send(json.dumps(subscription, separators=(',', ':')))
            received = 0
            while max_messages <= 0 or received < max_messages:
                raw = connection.recv()
                if raw is None:
                    break
                payload = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
                received += 1
                yield payload
        finally:
            connection.close()
