import os
import unittest
from unittest.mock import patch

import requests

from providers.polygon_http import PolygonHttpClient


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'HTTP {self.status_code}')


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.headers = {}
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.responses.pop(0)


class PolygonHttpClientTests(unittest.TestCase):
    def client(self, responses):
        session = FakeSession(responses)
        with patch.dict(os.environ, {
            'POLYGON_API_KEY': 'test-key',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_PRICE_RATE_LIMIT_BACKOFF': '3',
            'POLYGON_PRICE_RATE_LIMIT_RETRIES': '2',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_http_test',
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
        }, clear=False):
            client = PolygonHttpClient(session=session, required_for='test')
        return client, session

    def test_adds_auth_and_applies_base_url_timeout_and_params(self):
        client, session = self.client([FakeResponse({'status': 'OK', 'results': [1]})])
        with patch.object(client.pacer, 'wait'):
            payload = client.get_json('/v1/example', params={'limit': 1})
        self.assertEqual(payload['results'], [1])
        self.assertEqual(session.headers['Authorization'], 'Bearer test-key')
        self.assertEqual(session.calls[0][0], 'https://api.polygon.io/v1/example')
        self.assertEqual(session.calls[0][1], {'params': {'limit': 1}, 'timeout': 30.0})

    def test_retries_429_and_penalizes_the_shared_pacer(self):
        client, _ = self.client([
            FakeResponse({}, 429, {'Retry-After': '2'}),
            FakeResponse({'status': 'OK', 'results': []}),
        ])
        with patch.object(client.pacer, 'wait'), patch.object(client.pacer, 'penalize') as penalize:
            self.assertEqual(client.get_json('/v1/example')['results'], [])
        penalize.assert_called_once_with(2.0)

    def test_missing_http_or_payload_status_returns_none_only_when_declared(self):
        client, _ = self.client([
            FakeResponse({}, 404),
            FakeResponse({'status': 'NOT_AUTHORIZED'}),
        ])
        with patch.object(client.pacer, 'wait'):
            self.assertIsNone(client.get_json('/missing', missing_http_statuses=(404,)))
            self.assertIsNone(
                client.get_json(
                    '/unentitled',
                    missing_payload_statuses=('NOT_AUTHORIZED',),
                ),
            )

    def test_unexpected_provider_status_fails_closed(self):
        client, _ = self.client([FakeResponse({'status': 'ERROR'})])
        with patch.object(client.pacer, 'wait'):
            with self.assertRaisesRegex(RuntimeError, 'failed: ERROR'):
                client.get_json('/v1/example', context='example')


if __name__ == '__main__':
    unittest.main()
