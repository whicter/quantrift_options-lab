import unittest
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


class _ExitingAuth:
    @staticmethod
    def get_session_token():
        raise SystemExit(1)


if __name__ == '__main__':
    unittest.main()
