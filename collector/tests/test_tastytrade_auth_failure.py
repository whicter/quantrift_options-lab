import unittest
import requests
from unittest.mock import patch

from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider


class TastytradeAuthFailureTest(unittest.TestCase):
    def test_system_exit_auth_failure_becomes_worker_catchable_error(self):
        provider = TastytradeOptionChainProvider()
        provider.remember_token = 'expired-token'
        provider.login = ''
        provider.password = ''

        with patch.dict('sys.modules', {'auth': _ExitingAuth()}):
            with self.assertRaisesRegex(RuntimeError, 'tastytrade auth unavailable'):
                provider._login()

    def test_remember_token_network_failure_does_not_retry_password_login(self):
        provider = TastytradeOptionChainProvider()
        provider.remember_token = 'remember-token'
        provider.login = 'user@example.com'
        provider.password = 'password-that-must-not-be-used'

        with patch.dict('sys.modules', {'auth': _NetworkFailingAuth()}), \
             patch.object(provider._http, 'post') as password_login:
            with self.assertRaisesRegex(RuntimeError, 'tastytrade network unavailable'):
                provider._login()

        password_login.assert_not_called()


class _ExitingAuth:
    @staticmethod
    def get_session_token():
        raise SystemExit(1)


class _NetworkFailingAuth:
    @staticmethod
    def get_session_token():
        raise requests.ConnectTimeout('connection timed out')


if __name__ == '__main__':
    unittest.main()
