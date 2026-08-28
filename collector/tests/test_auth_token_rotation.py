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
        cursor.fetchone.return_value = ('database-token', None, None)
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
        self.assertIn('FROM provider_auth_state', cursor.execute.call_args_list[1].args[0])
        self.assertIn('FOR UPDATE', cursor.execute.call_args_list[1].args[0])
        # locked_out_at must be read in the SAME locked SELECT as the token.
        # Reading it separately would leave a window where one process sees an
        # open breaker and another has already started spending credentials.
        self.assertIn('locked_out_at', cursor.execute.call_args_list[1].args[0])
        self.assertIn('INSERT INTO provider_auth_state', cursor.execute.call_args_list[2].args[0])
        self.assertEqual(cursor.execute.call_args_list[2].args[1], ('tastytrade', 'successor-token'))
        conn.commit.assert_called_once()
        conn.close.assert_called_once()
        # Reversed 2026-08-27. This previously asserted set_key was NOT called:
        # the database was the sole home of the rotating token and .env stayed a
        # frozen bootstrap seed. That is what made the crash window fatal -- an
        # exchange succeeds, the provider retires the old token, the database
        # write then fails, and the successor exists nowhere. .env is now a
        # write-ahead copy, written first precisely because a local file write
        # cannot fail for the network reasons the database write can.
        set_key.assert_called_once_with(auth.ENV_FILE, 'TT_REMEMBER_TOKEN', 'successor-token')

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
        cursor.fetchone.return_value = ('database-token', None, None)
        conn.cursor.return_value.__enter__.return_value = cursor

        # Seeds pinned equal so no recovery attempt runs and this stays a test of
        # the rollback alone. Left unset, the process environment supplied a real
        # different seed and the second attempt's two queries turned the expected
        # count of 2 into 4 -- the test would have been measuring recovery.
        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'database-token',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=response), \
             patch('auth.send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        # Two statements for the locked read, then one more: the breaker being
        # recorded. What must NOT appear is a write to remember_token -- the
        # exchange failed, so the stored token is still the live one.
        self.assertEqual(cursor.execute.call_count, 3)
        self.assertNotIn('INSERT INTO provider_auth_state',
                         ' '.join(c.args[0] for c in cursor.execute.call_args_list))
        self.assertIn('locked_out_at = COALESCE', cursor.execute.call_args_list[2].args[0])
        conn.rollback.assert_called_once()

    def test_rejected_database_token_falls_back_to_a_distinct_local_seed(self):
        """Reversal of `..._does_not_consume_a_distinct_configured_seed`, 2026-08-27.

        The old rule protected .env as an immutable bootstrap seed that automatic
        recovery must never spend. It made sense while .env held only a hand-issued
        starting value -- and it is exactly what left the collector wedged from
        2026-08-26 to 2026-08-27, retrying one dead token daily with a human as
        the only way out.

        The premise changed underneath it. `_exchange_and_persist` now mirrors
        every rotation to .env before touching the database, so a divergence
        between the two stores has exactly one cause: an exchange whose local
        write landed and whose database write did not. In that state the shared
        row holds a token the provider already retired and the local file holds
        the live one. Preferring the row is preferring the dead copy.

        Spending the local seed is cheap when it is stale (one 401, then the
        same alert as before) and decisive when it is not.
        """
        rejected = Mock()
        rejected.status_code = 401
        rejected.text = 'invalid credentials'
        accepted = Mock()
        accepted.status_code = 201
        accepted.json.return_value = {
            'data': {'session-token': 'session-2', 'remember-token': 'successor-token'}
        }
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('old-database-token', None, None)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'configured-recovery-seed',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', side_effect=[rejected, accepted]) as post, \
             patch('auth.set_key'), \
             patch('auth.send_alert_email') as alert:
            self.assertEqual(auth.get_session_token(), 'session-2')

        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[0].kwargs['json']['remember-token'],
                         'old-database-token')
        self.assertEqual(post.call_args_list[1].kwargs['json']['remember-token'],
                         'configured-recovery-seed')
        # Self-healed: no operator is paged for a fault the process just repaired.
        alert.assert_not_called()

    def test_a_dead_local_seed_still_ends_in_an_alert_and_a_non_zero_exit(self):
        # Recovery must not swallow the real failure. When both stores are spent
        # the collector still exits loudly -- that is the case a human must act on.
        rejected = Mock()
        rejected.status_code = 401
        rejected.text = 'invalid credentials'
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('old-database-token', None, None)
        conn.cursor.return_value.__enter__.return_value = cursor

        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://example',
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': 'also-dead-seed',
        }, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch('auth.requests.post', return_value=rejected) as post, \
             patch('auth.send_alert_email') as alert:
            with self.assertRaises(SystemExit):
                auth.get_session_token()

        self.assertEqual(post.call_count, 2)
        alert.assert_called_once()
        # The alert has to name the remedy; it is all the operator sees before
        # the process is gone.
        self.assertIn('auth.py --login', alert.call_args.kwargs['body'])

    def test_rejected_database_token_does_not_retry_the_same_configured_seed(self):
        rejected = Mock()
        rejected.status_code = 401
        rejected.text = 'invalid credentials'
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('same-token', None, None)
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
        # The one commit is the breaker, not a token rotation: after two dead
        # seeds the process must stop asking rather than retry on the next cron.
        statements = ' '.join(c.args[0] for c in cursor.execute.call_args_list)
        self.assertNotIn('INSERT INTO provider_auth_state', statements)
        self.assertIn('locked_out_at = COALESCE', statements)

    def test_quoted_environment_seed_is_normalized_before_the_request(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {'session-token': 'session-1', 'remember-token': 'successor-token'}
        }

        with patch.dict(os.environ, {
            'TT_LOGIN': 'user@example.com',
            'TT_REMEMBER_TOKEN': '"quoted-seed"',
        }, clear=False), \
             patch('auth.requests.post', return_value=response) as post, \
             patch('auth.set_key'):
            self.assertEqual(auth.get_session_token(), 'session-1')

        self.assertEqual(post.call_args.kwargs['json']['remember-token'], 'quoted-seed')

    def test_database_write_failure_rolls_back_after_successful_exchange(self):
        response = Mock()
        response.status_code = 201
        response.json.return_value = {
            'data': {'session-token': 'session-1', 'remember-token': 'successor-token'}
        }
        conn = MagicMock()
        cursor = Mock()
        cursor.fetchone.return_value = ('database-token', None, None)
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

        self.assertIn('INSERT INTO provider_auth_state', cursor.execute.call_args_list[1].args[0])
        self.assertEqual(cursor.execute.call_args_list[1].args[1], ('tastytrade', 'manual-seed'))
        # An interactive login is the ONLY thing that closes the breaker, and it
        # must do so in the same transaction that stores the working token --
        # otherwise a crash between them leaves valid credentials unusable.
        self.assertIn('locked_out_at = NULL', cursor.execute.call_args_list[2].args[0])
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

    def test_missing_login_fails_before_making_a_tastytrade_request(self):
        with patch.dict(os.environ, {'TT_LOGIN': ''}, clear=False), \
             patch('auth.requests.post') as post:
            with self.assertRaisesRegex(auth.TokenStateError, 'TT_LOGIN is required'):
                auth.renew_session('stable-remember')

        post.assert_not_called()


if __name__ == '__main__':
    unittest.main()
