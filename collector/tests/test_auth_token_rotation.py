import os
import unittest
from unittest.mock import Mock, patch

import auth


class AuthTokenRotationTest(unittest.TestCase):
    def setUp(self):
        auth._SESSION_TOKEN_CACHE = None

    def tearDown(self):
        auth._SESSION_TOKEN_CACHE = None

    def test_get_session_token_does_not_rotate_remember_token_on_success(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {
                'session-token': 'session-1',
                'remember-token': 'new-remember-token-that-must-not-be-saved',
            }
        }

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response) as post, \
             patch('auth.set_key') as set_key:
            token = auth.get_session_token()

        self.assertEqual(token, 'session-1')
        set_key.assert_not_called()
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
