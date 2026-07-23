import os
import unittest
from unittest.mock import Mock, patch

import send_heartbeat


class HeartbeatTest(unittest.TestCase):
    def test_disabled_without_url_and_token(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(send_heartbeat.requests, 'post') as post:
            self.assertEqual(send_heartbeat.run(), 'disabled')
            post.assert_not_called()

    def test_sends_authenticated_runtime_payload(self):
        response = Mock()
        response.raise_for_status.return_value = None
        env = {
            'HEARTBEAT_URL': 'https://api.example.test/api/heartbeat',
            'HEARTBEAT_TOKEN': 'secret',
            'HEARTBEAT_NODE_ID': 'mac-studio',
            'HEARTBEAT_TIMEOUT_SECONDS': '3',
        }
        with patch.dict(os.environ, env, clear=True), patch.object(send_heartbeat.requests, 'post', return_value=response) as post:
            self.assertEqual(send_heartbeat.run(), 'sent')

        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs['headers'], {'Authorization': 'Bearer secret'})
        self.assertEqual(kwargs['json']['node_id'], 'mac-studio')
        self.assertEqual(kwargs['json']['payload']['collector'], 'quantrift-options-collector')
        self.assertEqual(kwargs['timeout'], 3.0)
        response.raise_for_status.assert_called_once_with()

    def test_http_failure_is_not_silently_swallowed(self):
        response = Mock()
        response.raise_for_status.side_effect = RuntimeError('401')
        env = {'HEARTBEAT_URL': 'https://api.example.test/api/heartbeat', 'HEARTBEAT_TOKEN': 'bad'}
        with patch.dict(os.environ, env, clear=True), patch.object(send_heartbeat.requests, 'post', return_value=response):
            with self.assertRaisesRegex(RuntimeError, '401'):
                send_heartbeat.run()


if __name__ == '__main__':
    unittest.main()
