import os
import unittest
from unittest.mock import MagicMock, Mock, call, patch

import auth


class AuthTokenRotationTest(unittest.TestCase):
    def setUp(self):
        auth._SESSION_TOKEN_CACHE = None
        self.database_env = patch.dict(os.environ, {'DATABASE_URL': ''}, clear=False)
        self.database_env.start()

    def tearDown(self):
        self.database_env.stop()
        auth._SESSION_TOKEN_CACHE = None

    def test_database_state_is_preferred_and_successor_is_committed(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {'session-token': 'session-1', 'remember-token': 'successor-token'}
        }
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('database-token',)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'stale-seed',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=response) as post, \
             patch('auth.set_key') as set_key:
            token = auth.get_session_token()

        self.assertEqual(token, 'session-1')
        self.assertEqual(post.call_args.kwargs['json']['remember-token'], 'database-token')
        self.assertEqual(cursor.execute.call_args_list[0], call(
            'SELECT pg_advisory_xact_lock(hashtext(%s))', ('tastytrade',)
        ))
        self.assertEqual(cursor.execute.call_args_list[1], call(
            'SELECT remember_token FROM provider_auth_state WHERE provider = %s FOR UPDATE',
            ('tastytrade',),
        ))
        self.assertIn('INSERT INTO provider_auth_state', cursor.execute.call_args_list[2].args[0])
        self.assertEqual(cursor.execute.call_args_list[2].args[1], ('tastytrade', 'successor-token'))
        conn.commit.assert_called_once()
        conn.close.assert_called_once()
        set_key.assert_not_called()

    def test_local_env_fallback_persists_provider_supplied_successor(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {'session-token': 'session-1', 'remember-token': 'successor-token'}
        }

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.set_key') as set_key:
            self.assertEqual(auth.get_session_token(), 'session-1')

        set_key.assert_called_once_with(auth.ENV_FILE, 'TT_REMEMBER_TOKEN', 'successor-token')

    def test_local_env_fallback_keeps_token_when_provider_returns_no_successor(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {'data': {'session-token': 'session-1'}}

        with patch.dict(os.environ, {'TT_LOGIN': 'user@example.com', 'TT_REMEMBER_TOKEN': 'stable-remember'}, clear=False), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.set_key') as set_key:
            self.assertEqual(auth.get_session_token(), 'session-1')

        set_key.assert_not_called()

    def test_renewal_failure_rolls_back_database_without_overwriting_state(self):
        response = Mock()
        response.status_code = 401
        response.text = 'invalid credentials'
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('database-token',)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {'DATABASE_URL': 'postgres://example', 'TT_LOGIN': 'user@example.com'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        self.assertEqual(cursor.execute.call_count, 2)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        conn.close.assert_called_once()

    def test_rejected_database_token_recovers_once_with_distinct_configured_seed(self):
        rejected = Mock()
        rejected.status_code = 401
        rejected.text = 'invalid credentials'
        recovered = Mock()
        recovered.status_code = 201
        recovered.json.return_value = {
            'data': {'session-token': 'session-2', 'remember-token': 'successor-token'}
        }
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('old-database-token',)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'configured-recovery-seed',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', side_effect=[rejected, recovered]) as post:
            self.assertEqual(auth.get_session_token(), 'session-2')

        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[0].kwargs['json']['remember-token'], 'old-database-token')
        self.assertEqual(post.call_args_list[1].kwargs['json']['remember-token'], 'configured-recovery-seed')
        self.assertEqual(cursor.execute.call_args_list[2].args[1], ('tastytrade', 'successor-token'))
        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()

    def test_rejected_database_token_does_not_retry_the_same_configured_seed(self):
        rejected = Mock()
        rejected.status_code = 401
        rejected.text = 'invalid credentials'
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('same-token',)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'same-token',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=rejected) as post, \
             patch('auth.send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        post.assert_called_once()
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_database_write_failure_rolls_back_after_successful_exchange(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {'session-token': 'session-1', 'remember-token': 'successor-token'}
        }
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('database-token',)
        cursor.execute.side_effect = [None, None, auth.psycopg2.Error()]
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {'DATABASE_URL': 'postgres://example', 'TT_LOGIN': 'user@example.com'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        conn.close.assert_called_once()

    def test_manual_login_seed_is_written_to_database_and_local_env(self):
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = None
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {'DATABASE_URL': 'postgres://example'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.set_key') as set_key:
            auth._save_tokens({'session-token': 'session-1', 'remember-token': 'manual-seed'})

        self.assertIn('INSERT INTO provider_auth_state', cursor.execute.call_args_list[2].args[0])
        self.assertEqual(cursor.execute.call_args_list[2].args[1], ('tastytrade', 'manual-seed'))
        conn.commit.assert_called_once()
        conn.close.assert_called_once()
        set_key.assert_called_once_with(auth.ENV_FILE, 'TT_REMEMBER_TOKEN', 'manual-seed')

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
