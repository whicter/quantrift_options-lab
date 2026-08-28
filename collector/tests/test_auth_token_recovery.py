import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import auth  # noqa: E402
import operator_alerts  # noqa: E402


class PersistOrderTests(unittest.TestCase):
    """The successor token must reach disk before it is sent across the network.

    Tastytrade rotates the remember-token on every exchange, so the response to
    a successful renewal carries the ONLY copy of the next one. The original
    code wrote it to PostgreSQL and never to .env when a database connection
    existed. A failure in that write therefore destroyed the old token (already
    spent at the provider) and the new one together, which is a state only an
    interactive re-login can leave.
    """

    def setUp(self):
        self.writes = []
        patcher = patch.object(auth, 'set_key',
                               side_effect=lambda *a: self.writes.append(('env', a[2])))
        patcher.start()
        self.addCleanup(patcher.stop)
        env = patch.dict('os.environ', {'TT_REMEMBER_TOKEN': 'old-token'}, clear=False)
        env.start()
        self.addCleanup(env.stop)

    def _conn(self):
        conn = MagicMock()
        conn.commit.side_effect = lambda: self.writes.append(('db-commit', None))
        return conn

    def test_env_is_written_before_the_database(self):
        conn = self._conn()
        with patch.object(auth, 'renew_session', return_value=('sess', 'new-token')), \
             patch.object(auth, '_store_database_remember_token',
                          side_effect=lambda *a: self.writes.append(('db-write', a[1]))):
            token = auth._exchange_and_persist(conn, 'old-token')

        self.assertEqual(token, 'sess')
        self.assertEqual([w[0] for w in self.writes], ['env', 'db-write', 'db-commit'])
        self.assertEqual(self.writes[0][1], 'new-token')

    def test_a_failed_database_write_still_leaves_the_successor_on_disk(self):
        conn = self._conn()
        with patch.object(auth, 'renew_session', return_value=('sess', 'new-token')), \
             patch.object(auth, '_store_database_remember_token',
                          side_effect=auth.TokenStateError('db down')):
            with self.assertRaises(auth.TokenStateError):
                auth._exchange_and_persist(conn, 'old-token')

        # The whole point: the network write blew up, and the only copy of the
        # new token survives locally for _recover_from_env_seed to find.
        self.assertIn(('env', 'new-token'), self.writes)

    def test_a_provider_that_returns_no_successor_keeps_the_current_token(self):
        conn = self._conn()
        with patch.object(auth, 'renew_session', return_value=('sess', None)), \
             patch.object(auth, '_store_database_remember_token',
                          side_effect=lambda *a: self.writes.append(('db-write', a[1]))):
            auth._exchange_and_persist(conn, 'old-token')

        # No rotation happened, so nothing should be rewritten to .env; the
        # value there already equals the token in play.
        self.assertNotIn('env', [w[0] for w in self.writes])
        self.assertEqual(self.writes[0], ('db-write', 'old-token'))


class EnvSeedRecoveryTests(unittest.TestCase):
    """Divergence between the shared row and the local seed is repairable.

    The two can only differ after an exchange whose .env write landed and whose
    database write did not. From then on the row holds a token the provider has
    already retired and every run re-sends it -- the loop observed from
    2026-08-26 through 2026-08-27, one dead fingerprint repeating while the
    other 29 in the log were each used exactly once.
    """

    def test_recovery_uses_the_local_seed_when_it_differs(self):
        with patch.dict('os.environ', {'TT_REMEMBER_TOKEN': 'fresher-token'}, clear=False), \
             patch.object(auth, '_acquire_remember_token_state', return_value=(None, 'x')), \
             patch.object(auth, '_exchange_and_persist', return_value='sess') as exchange:
            self.assertEqual(auth._recover_from_env_seed('dead-token'), 'sess')
        exchange.assert_called_once()
        self.assertEqual(exchange.call_args[0][1], 'fresher-token')

    def test_recovery_does_not_resend_the_token_that_was_just_rejected(self):
        # A second identical 401 proves nothing and, repeated daily, looks like
        # credential stuffing against the account rather than a retry.
        with patch.dict('os.environ', {'TT_REMEMBER_TOKEN': 'dead-token'}, clear=False), \
             patch.object(auth, '_exchange_and_persist') as exchange:
            self.assertIsNone(auth._recover_from_env_seed('dead-token'))
        exchange.assert_not_called()

    def test_recovery_reports_failure_rather_than_raising(self):
        with patch.dict('os.environ', {'TT_REMEMBER_TOKEN': 'other-token'}, clear=False), \
             patch.object(auth, '_acquire_remember_token_state', return_value=(None, 'x')), \
             patch.object(auth, '_exchange_and_persist',
                          side_effect=auth.RememberTokenRejected('401')):
            self.assertIsNone(auth._recover_from_env_seed('dead-token'))


class BreakerTests(unittest.TestCase):
    """Once both seeds are spent, stop sending credentials entirely.

    A retired remember-token cannot be revived, yet the collector re-sent it on
    every cron run and every daemon cycle. Those register as failed logins on a
    live brokerage account: on 2026-08-27 the provider answered 'temporarily
    locked for 15 minutes due to excessive failed attempts'. Frozen
    `earnings_date` costs one command to repair; a locked trading account during
    market hours does not, and the same credentials gate quote collection.
    """

    def setUp(self):
        auth._SESSION_TOKEN_CACHE = None
        self.addCleanup(setattr, auth, '_SESSION_TOKEN_CACHE', None)

    def _locked_conn(self):
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = ('any-token', '2026-08-27', 'both seeds rejected')
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn

    def test_an_open_breaker_sends_no_credentials_at_all(self):
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=self._locked_conn()), \
             patch('auth.requests.post') as post, \
             patch.object(auth, 'send_alert_email'):
            with self.assertRaises(SystemExit):
                auth.get_session_token()
        # Not "fewer requests" -- zero. The whole point is to stop touching the
        # account until a human has supplied working credentials.
        post.assert_not_called()

    def test_an_unmigrated_database_has_no_breaker_rather_than_a_crash(self):
        # migrate.js ships on Railway's cadence, not the collector's, so this
        # process can meet a provider_auth_state that predates locked_out_at.
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = ('token-only',)
        conn.cursor.return_value.__enter__.return_value = cursor
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn):
            _, token = auth._acquire_remember_token_state()
        self.assertEqual(token, 'token-only')

    def test_only_an_interactive_login_clears_the_breaker(self):
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cursor
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=conn), \
             patch.object(auth, 'set_key'):
            auth._persist_manual_remember_token('fresh-seed')

        statements = ' '.join(str(c.args[0]) for c in cursor.execute.call_args_list)
        self.assertIn('locked_out_at = NULL', statements)
        self.assertIn('INSERT INTO provider_auth_state', statements)

    def test_the_login_wizard_is_not_itself_blocked_by_the_breaker(self):
        # The trap this avoids: a breaker that also blocks the one command that
        # can clear it. _persist_manual_remember_token must not route through
        # _acquire_remember_token_state, which refuses while the breaker is open.
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch('auth.psycopg2.connect', return_value=self._locked_conn()), \
             patch.object(auth, 'set_key'):
            auth._persist_manual_remember_token('fresh-seed')  # must not raise


class AlertRoutingTests(unittest.TestCase):
    """An alert whose only sink is a log file is not an alert.

    SMTP_HOST/USER/PASS/ALERT_EMAIL have been present-but-empty in .env since
    the file was written, so send_alert_email printed and returned. The
    Tastytrade outage that began 2026-08-26 raised its alarm correctly on every
    single run and nobody saw one of them for two days.
    """

    def test_auth_alerts_go_through_the_operator_fan_out(self):
        with patch('operator_alerts.send_operator_alert', return_value=['telegram']) as fan:
            auth.send_alert_email('subject', 'body')
        fan.assert_called_once()
        self.assertEqual(fan.call_args.kwargs.get('severity'), 'critical')

    def test_telegram_is_blocked_rather_than_attempted_when_unconfigured(self):
        with patch.dict('os.environ', {'TG_TOKEN': '', 'TG_CHAT_ID': ''}, clear=False), \
             patch('operator_alerts.requests.post') as post:
            status, reason = operator_alerts.send_telegram('s', 'b')
        self.assertEqual(status, 'blocked')
        self.assertIn('not configured', reason)
        post.assert_not_called()

    def test_telegram_sends_plain_text_so_provider_errors_cannot_break_parsing(self):
        # Provider error bodies carry underscores and asterisks. Requesting
        # Markdown would make Telegram reject the message whenever the text it
        # is reporting happens to contain them.
        with patch.dict('os.environ', {'TG_TOKEN': 'tok', 'TG_CHAT_ID': '42'}, clear=False), \
             patch('operator_alerts.requests.post') as post:
            post.return_value = MagicMock(raise_for_status=lambda: None)
            operator_alerts.send_telegram('subject', 'a_b *c* _d_')
        payload = post.call_args.kwargs['data']
        self.assertNotIn('parse_mode', payload)
        self.assertIn('a_b *c* _d_', payload['text'])

    def test_a_delivery_failure_never_puts_the_bot_token_in_the_log(self):
        import requests as requests_module
        with patch.dict('os.environ', {'TG_TOKEN': 'secret-tok', 'TG_CHAT_ID': '42'}, clear=False), \
             patch('operator_alerts.requests.post',
                   side_effect=requests_module.RequestException('failed for url secret-tok')):
            status, detail = operator_alerts.send_telegram('s', 'b')
        self.assertEqual(status, 'failed')
        self.assertNotIn('secret-tok', detail)
        self.assertIn('<redacted>', detail)


if __name__ == '__main__':
    unittest.main()
