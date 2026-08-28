import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import auth  # noqa: E402

OAUTH_ENV = {
    'TT_OAUTH_CLIENT_SECRET': 'client-secret',
    'TT_OAUTH_REFRESH_TOKEN': 'refresh-jwt',
}


def _ok(token='access-1', expires_in=900):
    response = Mock()
    response.status_code = 200
    response.json.return_value = {'access_token': token, 'expires_in': expires_in}
    response.text = ''
    return response


class OAuthTokenTests(unittest.TestCase):
    """Tastytrade retired session/remember-token auth for API clients.

    Their OAuth guide states plainly that "all tastytrade API users must use
    Oauth2 access tokens". The legacy path died on 2026-08-26 and the password
    login now stops at a request-token step no unattended cron can satisfy.
    """

    def setUp(self):
        auth._ACCESS_TOKEN_CACHE['token'] = None
        auth._ACCESS_TOKEN_CACHE['expires_at'] = 0.0
        self.addCleanup(auth._ACCESS_TOKEN_CACHE.update, {'token': None, 'expires_at': 0.0})

    def test_request_carries_exactly_the_three_documented_parameters(self):
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=_ok()) as post:
            self.assertEqual(auth.get_access_token(), 'access-1')

        body = post.call_args.kwargs['json']
        self.assertEqual(set(body), {'grant_type', 'refresh_token', 'client_secret'})
        self.assertEqual(body['grant_type'], 'refresh_token')
        # client_id is NOT part of the contract; the provider's guide lists
        # three parameters and this file has a history of carrying unchecked ones.
        self.assertNotIn('client_id', body)

    def test_the_user_agent_is_sent_and_matches_the_required_shape(self):
        # The OAuth guide rejects requests without a User-Agent and requires the
        # form <product>/<version>.
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=_ok()) as post:
            auth.get_access_token()
        agent = post.call_args.kwargs['headers']['User-Agent']
        self.assertRegex(agent, r'^[^/\s]+/[^/\s]+$')

    def test_a_live_token_is_reused_instead_of_refetched(self):
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=_ok()) as post:
            auth.get_access_token()
            auth.get_access_token()
        post.assert_called_once()

    def test_an_expiring_token_is_replaced_before_it_lapses(self):
        """The failure this prevents is specific to the daemon.

        Access tokens live 15 minutes; the session tokens they replace lived 24
        hours. `run_collector_daemon.py` runs for weeks, so caching once per
        process -- correct under the old scheme -- would authenticate for a
        quarter of an hour and 401 for every cycle after that.
        """
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', side_effect=[_ok('access-1'), _ok('access-2')]):
            first = auth.get_access_token()
            auth._ACCESS_TOKEN_CACHE['expires_at'] = 0.0   # simulate the clock moving past it
            second = auth.get_access_token()
        self.assertEqual((first, second), ('access-1', 'access-2'))

    def test_the_refresh_margin_stops_us_using_a_token_to_its_last_second(self):
        with patch.dict('os.environ', {**OAUTH_ENV, 'TT_ACCESS_TOKEN_MARGIN_SECONDS': '60'},
                        clear=False), \
             patch('auth.time.monotonic', return_value=1000.0), \
             patch('auth.requests.post', return_value=_ok(expires_in=900)):
            auth.get_access_token()
        # 900s of life, used for 840. The 60s of slack covers the gap between
        # our check and the server reading the request.
        self.assertEqual(auth._ACCESS_TOKEN_CACHE['expires_at'], 1000.0 + 840)

    def test_a_revoked_grant_is_non_retryable(self):
        revoked = Mock()
        revoked.status_code = 400
        revoked.text = '{"error_code":"invalid_grant","error_description":"Invalid refresh token"}'
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=revoked):
            with self.assertRaises(auth.RememberTokenRejected):
                auth.get_access_token()

    def test_a_server_error_stays_retryable(self):
        # A 500 must not be classed with a deleted grant: one clears by itself,
        # the other needs a human to issue a new grant on my.tastytrade.com.
        boom = Mock()
        boom.status_code = 503
        boom.text = 'upstream unavailable'
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=boom):
            with self.assertRaises(ValueError) as caught:
                auth.get_access_token()
        self.assertNotIsInstance(caught.exception, auth.RememberTokenRejected)


class AuthorizationHeaderTests(unittest.TestCase):
    """One function owns the header, because the two schemes are not swappable.

    OAuth sends `Bearer <token>`; the legacy session token was sent bare. A call
    site that formats its own header works under whichever scheme it was written
    for and 401s under the other -- and only once the token it already held
    expires, so the break surfaces minutes after the deploy that caused it.
    """

    def setUp(self):
        auth._ACCESS_TOKEN_CACHE['token'] = None
        auth._ACCESS_TOKEN_CACHE['expires_at'] = 0.0
        self.addCleanup(auth._ACCESS_TOKEN_CACHE.update, {'token': None, 'expires_at': 0.0})

    def test_oauth_credentials_produce_a_bearer_header(self):
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch('auth.requests.post', return_value=_ok()):
            self.assertEqual(auth.authorization_header(), 'Bearer access-1')

    def test_without_oauth_it_falls_back_to_the_bare_legacy_token(self):
        with patch.dict('os.environ',
                        {'TT_OAUTH_CLIENT_SECRET': '', 'TT_OAUTH_REFRESH_TOKEN': ''},
                        clear=False), \
             patch.object(auth, 'get_session_token', return_value='legacy-session'):
            self.assertEqual(auth.authorization_header(), 'legacy-session')

    def test_half_configured_credentials_do_not_select_oauth(self):
        # A secret with no refresh token would otherwise send `Bearer ` plus an
        # exception, or worse, an empty bearer. Both halves or neither.
        with patch.dict('os.environ',
                        {'TT_OAUTH_CLIENT_SECRET': 'set', 'TT_OAUTH_REFRESH_TOKEN': ''},
                        clear=False), \
             patch.object(auth, 'get_session_token', return_value='legacy-session'):
            self.assertEqual(auth.authorization_header(), 'legacy-session')

    def test_the_metrics_collector_sends_the_resolved_header(self):
        import collect
        response = Mock()
        response.status_code = 200
        response.json.return_value = {'data': {'items': []}}
        response.raise_for_status = lambda: None
        with patch.object(collect, 'authorization_header', return_value='Bearer live'), \
             patch('collect.requests.get', return_value=response) as get:
            collect.fetch_metrics('ignored-legacy-argument', ['SPY'])
        self.assertEqual(get.call_args.kwargs['headers']['Authorization'], 'Bearer live')


class NoCallerFormatsItsOwnHeaderTests(unittest.TestCase):
    """Static sweep: nothing may reach the legacy token getter or hand-build the header.

    `run_refresh_worker.run_symbol_metrics_snapshot` called
    `collect.get_session_token()` directly and was missed when the other two call
    sites were converted. Under OAuth that one line walks into the credential
    breaker and fails every metrics job while the OAuth path beside it works --
    a split-brain that looks like a provider outage, not a bug in our code.

    A behavioural test would not have caught it: the function is only reachable
    with a live job row and a database, so the suite never executes that line.
    """

    # The provider is excluded on purpose: its `_login()` IS the legacy path,
    # reachable only when OAuth is unconfigured. It gets a behavioural test
    # below instead, which is the stronger check anyway -- it proves the OAuth
    # branch short-circuits rather than merely that a string is absent.
    SOURCES = ('collect.py', 'run_refresh_worker.py')

    def test_no_module_calls_the_legacy_session_getter(self):
        offenders = []
        for name in self.SOURCES:
            for number, line in enumerate(open(ROOT / name), start=1):
                code = line.split('#', 1)[0]
                if 'get_session_token()' in code:
                    offenders.append(f'{name}:{number}')
        self.assertEqual(offenders, [], 'use auth.authorization_header() instead')

    def test_no_module_hand_builds_a_bearer_prefix(self):
        offenders = []
        for name in self.SOURCES + ('providers/tastytrade_option_chain_provider.py',):
            for number, line in enumerate(open(ROOT / name), start=1):
                code = line.split('#', 1)[0]
                if "'Bearer" in code or '"Bearer' in code:
                    offenders.append(f'{name}:{number}')
        self.assertEqual(offenders, [],
                         'the Bearer prefix belongs only in auth.authorization_header()')

    def test_the_chain_provider_never_reaches_login_while_oauth_is_configured(self):
        """The provider caches a token on the instance and lives inside a daemon.

        Under the old 24-hour session tokens that cache was harmless. A 15-minute
        access token makes it wrong: the provider would authenticate once and
        then send an expired token for the rest of the process's life.
        """
        from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider

        provider = TastytradeOptionChainProvider.__new__(TastytradeOptionChainProvider)
        provider.session_token = ''
        provider.user_agent = 'quantrift-options-lab/0.1'
        with patch.dict('os.environ', OAUTH_ENV, clear=False), \
             patch.object(TastytradeOptionChainProvider, '_login',
                          side_effect=AssertionError('legacy login must not run under OAuth')), \
             patch('auth.requests.post', return_value=_ok()):
            headers = provider._headers()
        self.assertEqual(headers['Authorization'], 'Bearer access-1')


if __name__ == '__main__':
    unittest.main()
