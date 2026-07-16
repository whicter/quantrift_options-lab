import os
import tempfile
import unittest
from unittest.mock import Mock, patch

import auth


class AuthTokenRotationTest(unittest.TestCase):
    def setUp(self):
        auth._SESSION_TOKEN_CACHE = None

    def tearDown(self):
        auth._SESSION_TOKEN_CACHE = None

    def test_get_session_token_persists_provider_supplied_successor(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {
                'session-token': 'session-1',
                'remember-token': 'new-remember-token-that-must-be-saved',
            }
        }

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response) as post, \
             patch('auth.set_key') as set_key:
            token = auth.get_session_token()

        self.assertEqual(token, 'session-1')
        set_key.assert_called_once_with(
            auth.ENV_FILE,
            'TT_REMEMBER_TOKEN',
            'new-remember-token-that-must-be-saved',
        )
        post.assert_called_once()

    def test_get_session_token_reuses_process_cache(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {'data': {'session-token': 'session-1'}}

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response) as post:
            self.assertEqual(auth.get_session_token(), 'session-1')
            self.assertEqual(auth.get_session_token(), 'session-1')

        post.assert_called_once()

    def test_get_session_token_keeps_token_when_provider_returns_no_successor(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {'data': {'session-token': 'session-1'}}

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.set_key') as set_key:
            self.assertEqual(auth.get_session_token(), 'session-1')

        set_key.assert_not_called()

    def test_get_session_token_does_not_persist_when_renewal_fails(self):
        response = Mock()
        response.status_code = 401
        response.text = 'invalid credentials'

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.set_key') as set_key, \
             patch('auth.send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        set_key.assert_not_called()

    def test_successor_uses_configured_durable_state_path(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = os.path.join(directory, 'remember-token')
            with patch.dict(os.environ, {'TT_REMEMBER_TOKEN_STATE_PATH': state_path}, clear=False), \
                 patch('auth.set_key') as set_key:
                changed = auth._persist_replacement_remember_token('old-token', 'new-token')

            self.assertTrue(changed)
            with open(state_path, encoding='utf-8') as state_file:
                self.assertEqual(state_file.read(), 'new-token\n')
            set_key.assert_not_called()

    def test_required_durable_state_refuses_to_consume_token_without_volume(self):
        with patch.dict(os.environ, {
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'seed-token',
            'TT_REMEMBER_TOKEN_STATE_PATH': '/data/tastytrade-remember-token',
            'TT_REMEMBER_TOKEN_STATE_REQUIRED': 'true',
        }, clear=False), \
             patch('auth.requests.post') as post, \
             patch('auth.send_alert_email') as send_alert:
            os.environ.pop('RAILWAY_VOLUME_MOUNT_PATH', None)
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        post.assert_not_called()
        send_alert.assert_called_once()

    def test_session_request_uses_tastytrade_compliant_user_agent(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {'data': {'session-token': 'session-1'}}

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com'}, clear=False), \
             patch('auth.requests.post', return_value=response) as post:
            auth.renew_session('stable-remember')

        headers = post.call_args.kwargs['headers']
        self.assertRegex(headers['User-Agent'], r'^[^/]+/[^/]+$')


if __name__ == '__main__':
    unittest.main()
