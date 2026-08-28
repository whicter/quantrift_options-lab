"""
Tastytrade authentication with remember-token auto-renewal.

Flow:
  - Normal run: use remember-token to get a session-token (fully automated)
  - If remember-token expired: send alert email and exit (requires manual re-login)

Manual first login / re-login: run `python auth.py --login` and follow prompts.
"""

import os
import sys
import time
import argparse
import hashlib
import requests
import psycopg2
from dotenv import set_key
from collector_runtime import load_collector_env

load_collector_env(__file__)

TT_BASE   = os.getenv('TT_BASE_URL', 'https://api.tastyworks.com').rstrip('/')
TT_USER_AGENT = os.getenv('TT_USER_AGENT', 'quantrift-options-lab/0.1')
ENV_FILE  = os.path.join(os.path.dirname(__file__), '.env')
_SESSION_TOKEN_CACHE = None
_ACCESS_TOKEN_CACHE = {'token': None, 'expires_at': 0.0}
# Refresh this many seconds early: the token can lapse between our check and
# the server reading the request, and a 15-minute lifetime leaves no slack.
ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = int(os.getenv('TT_ACCESS_TOKEN_MARGIN_SECONDS', '60'))
AUTH_STATE_PROVIDER = 'tastytrade'


class TokenStateError(RuntimeError):
    """Raised when durable provider authentication state cannot be used."""


class RememberTokenRejected(ValueError):
    """Raised when Tastytrade explicitly rejects a remember token."""


def _headers(session_token=None):
    h = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': TT_USER_AGENT,
    }
    if session_token:
        h['Authorization'] = session_token
    return h


def _remember_token_from_env():
    """Read a Railway/local seed defensively without persisting quote characters."""
    token = os.getenv('TT_REMEMBER_TOKEN', '').strip()
    if len(token) >= 2 and token[0] == token[-1] and token[0] in ('"', "'"):
        return token[1:-1]
    return token


def _token_fingerprint(token):
    """Return a short non-reversible identifier suitable for operational logs."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()[:12]


def _auth_consumer():
    return os.getenv('COLLECTOR_RUNTIME', 'collector').strip() or 'collector'


def send_alert_email(subject, body):
    """Raise an operator alert when human intervention is needed.

    Kept under its original name because three call sites and the tests use it,
    but it is no longer SMTP-only. It routed through SMTP variables that have
    been present-but-empty in .env since this file was written, so every alert
    fell through to a bare print into `logs/collect.log`. That is how the
    2026-08-26 auth failure ran for two days without anyone knowing: the alarm
    worked perfectly and rang inside a file nobody opens.

    `send_operator_alert` fans out to whatever transport is actually configured
    -- Telegram today -- and still logs when none is.
    """
    from operator_alerts import send_operator_alert

    channels = send_operator_alert(subject, body, severity='critical')
    print(f'[AUTH] Alert delivered via: {", ".join(channels)}')


def _oauth_configured():
    return bool(os.getenv('TT_OAUTH_CLIENT_SECRET', '').strip()
                and os.getenv('TT_OAUTH_REFRESH_TOKEN', '').strip())


def _fetch_oauth_access_token():
    """Exchange the long-lived refresh token for a 15-minute access token.

    Only three parameters, per the provider's OAuth guide: grant_type,
    refresh_token, client_secret. No client_id -- sending one is harmless but it
    is not part of the contract, and the earlier version of this file grew a
    reputation for carrying fields nobody had checked.

    Unlike the remember-token it replaces, the refresh token does NOT rotate.
    The whole class of failures that produced the 2026-08-26 outage -- a
    single-use credential whose successor was lost between the API call and the
    database write -- cannot occur here, which is why this path needs neither
    the write-ahead persist nor the env-seed recovery.
    """
    secret = os.getenv('TT_OAUTH_CLIENT_SECRET', '').strip()
    refresh = os.getenv('TT_OAUTH_REFRESH_TOKEN', '').strip()
    resp = requests.post(
        f'{TT_BASE}/oauth/token',
        headers=_headers(),
        json={
            'grant_type': 'refresh_token',
            'refresh_token': refresh,
            'client_secret': secret,
        },
        timeout=15,
    )
    if resp.status_code == 200:
        body = resp.json()
        token = body.get('access_token')
        if not token:
            raise ValueError(f'OAuth token response carried no access_token: {resp.text[:200]}')
        return token, int(body.get('expires_in') or 900)

    message = f'OAuth token request failed: {resp.status_code} {resp.text[:300]}'
    # invalid_grant means the refresh token was revoked or the grant deleted --
    # a human must issue a new grant, so it is not worth retrying. Everything
    # else (5xx, throttling) may well be transient.
    if resp.status_code in (400, 401) and 'invalid_grant' in resp.text:
        raise RememberTokenRejected(message)
    raise ValueError(message)


def get_access_token():
    """A currently-valid OAuth2 access token, refreshed as it ages out.

    Access tokens live 15 minutes, where the session tokens they replace lived
    24 hours. `run_collector_daemon.py` runs for weeks, so the old
    cache-once-per-process approach would authenticate correctly for a quarter
    of an hour and then 401 forever. The margin exists because the token can
    expire between the check and the server receiving the request.
    """
    now = time.monotonic()
    if _ACCESS_TOKEN_CACHE['token'] and now < _ACCESS_TOKEN_CACHE['expires_at']:
        return _ACCESS_TOKEN_CACHE['token']
    token, ttl = _fetch_oauth_access_token()
    _ACCESS_TOKEN_CACHE['token'] = token
    _ACCESS_TOKEN_CACHE['expires_at'] = now + max(ttl - ACCESS_TOKEN_REFRESH_MARGIN_SECONDS, 30)
    print(f'[AUTH] OAuth access token acquired; valid {ttl}s.')
    return token


def authorization_header():
    """The exact `Authorization` value for a Tastytrade API call.

    Every caller must go through this rather than formatting the header itself.
    The two schemes differ in more than the token: OAuth sends
    `Bearer <token>` while the legacy session token was sent bare, so a caller
    that pastes the raw value into the header works under one scheme and 401s
    under the other -- silently, and only once the token it already had expires.
    """
    if _oauth_configured():
        return f'Bearer {get_access_token()}'
    return get_session_token()


def renew_session(remember_token):
    """
    Exchange remember-token for a new session-token.
    Returns the session token and any provider-supplied replacement
    remember token, or raises on failure.
    """
    login = os.getenv('TT_LOGIN', '').strip()
    if not login:
        raise TokenStateError('TT_LOGIN is required for remember-token renewal.')
    resp = requests.post(
        f'{TT_BASE}/sessions',
        headers=_headers(),
        json={'login': login, 'remember-token': remember_token, 'remember-me': True},
        timeout=15,
    )

    if resp.status_code == 201:
        data = resp.json()['data']
        return data['session-token'], data.get('remember-token')

    message = f'remember-token renewal failed: {resp.status_code} {resp.text}'
    if resp.status_code in (401, 403):
        raise RememberTokenRejected(message)
    raise ValueError(message)


def _database_url():
    return os.getenv('DATABASE_URL', '').strip()


class AuthLockedOut(TokenStateError):
    """Raised when the breaker is open and no request may be sent."""


def _acquire_remember_token_state():
    """Lock the shared provider state for one renewal, or fall back to local .env."""
    database_url = _database_url()
    if not database_url:
        return None, _remember_token_from_env()

    try:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (AUTH_STATE_PROVIDER,))
            cur.execute(
                '''SELECT remember_token, locked_out_at, locked_out_reason
                   FROM provider_auth_state WHERE provider = %s FOR UPDATE''',
                (AUTH_STATE_PROVIDER,),
            )
            row = cur.fetchone()
        # len(row) is checked because the collector can run against a database
        # that has not taken the locked_out_* migration yet -- migrate.js is
        # deployed on Railway's cadence, not this process's. An un-migrated
        # database simply has no breaker rather than a crash on every start.
        if row and len(row) > 2 and row[1] is not None:
            conn.close()
            raise AuthLockedOut(
                f'Tastytrade authentication is circuit-broken since {row[1]:%Y-%m-%d %H:%M %Z}: '
                f'{row[2]}'
            )
        return conn, (row[0] if row else _remember_token_from_env())
    except psycopg2.Error as exc:
        raise TokenStateError('PostgreSQL provider authentication state is unavailable.') from exc


def _open_breaker(reason):
    """Stop sending credentials until a human re-authenticates.

    A spent remember-token cannot be revived by retrying, but the collector
    re-sent it on every cron run and every daemon cycle anyway. Those land on a
    live brokerage account as failed logins, and on 2026-08-27 the provider
    answered 'temporarily locked for 15 minutes due to excessive failed
    attempts'. Frozen `earnings_date` is recoverable in one command; an account
    locked out during market hours is not, and it takes IB-independent quote
    collection down with it.

    So the failure is recorded once and every later process refuses to ask.
    `_persist_manual_remember_token` clears it, which means the breaker can only
    be reset by the interactive login that actually fixes the cause.
    """
    if not _database_url():
        return
    try:
        conn = psycopg2.connect(_database_url())
        with conn.cursor() as cur:
            cur.execute(
                '''UPDATE provider_auth_state
                   SET locked_out_at = COALESCE(locked_out_at, NOW()), locked_out_reason = %s
                   WHERE provider = %s''',
                (str(reason)[:500], AUTH_STATE_PROVIDER),
            )
        conn.commit()
        conn.close()
        print('[AUTH] Breaker opened; no further credentials will be sent until re-login.')
    except psycopg2.Error as exc:
        print(f'[AUTH] Could not record the lockout: {exc}')


def _store_database_remember_token(conn, remember_token):
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO provider_auth_state (provider, remember_token, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (provider) DO UPDATE
                SET remember_token = EXCLUDED.remember_token,
                    updated_at = NOW()
                ''',
                (AUTH_STATE_PROVIDER, remember_token),
            )
    except psycopg2.Error as exc:
        raise TokenStateError('PostgreSQL provider authentication state could not be updated.') from exc


def _persist_manual_remember_token(remember_token):
    """Save a manually-issued seed to the shared database and local .env.

    Also the only thing that closes the breaker. Deliberately not a separate
    `--reset` flag: the breaker exists because credentials were being spent
    against a live account, so clearing it must be inseparable from having
    supplied working credentials.
    """
    conn = None
    try:
        # Bypasses _acquire_remember_token_state on purpose -- that helper now
        # refuses to hand out a connection while the breaker is open, and this
        # is the path that closes it.
        conn = psycopg2.connect(_database_url()) if _database_url() else None
        if conn:
            with conn.cursor() as cur:
                cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (AUTH_STATE_PROVIDER,))
            _store_database_remember_token(conn, remember_token)
            with conn.cursor() as cur:
                cur.execute(
                    '''UPDATE provider_auth_state
                       SET locked_out_at = NULL, locked_out_reason = NULL
                       WHERE provider = %s''',
                    (AUTH_STATE_PROVIDER,),
                )
            conn.commit()
        set_key(ENV_FILE, 'TT_REMEMBER_TOKEN', remember_token)
        os.environ['TT_REMEMBER_TOKEN'] = remember_token
    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def _exchange_and_persist(conn, remember_token):
    """Consume one remember-token and durably record the successor it returns.

    Tastytrade rotates on EVERY exchange: the token sent here is dead the moment
    the call returns 201, and the response body carries its only replacement.
    Measured 2026-08-27 in `logs/collect.log`: 29 distinct fingerprints across 30
    exchanges, the single repeat being the dead token retried forever.

    Order matters, and it is the reverse of what the code did before. The
    successor is written to .env FIRST and to PostgreSQL second, because .env is
    a local file write that cannot fail for network reasons while the database
    sits across the internet. Persisting to the database first meant a dropped
    connection in that gap burned the old token and lost the new one -- no copy
    anywhere, and an interactive re-login the only way back. Now the disk always
    holds the newest token even when the shared state write fails, which is what
    `_recover_from_env_seed` needs to repair itself unattended.
    """
    print(
        '[AUTH] Exchanging remember-token '
        f'fingerprint={_token_fingerprint(remember_token)} consumer={_auth_consumer()}.'
    )
    session_token, replacement_token = renew_session(remember_token)
    persisted_token = replacement_token or remember_token

    if persisted_token != _remember_token_from_env():
        set_key(ENV_FILE, 'TT_REMEMBER_TOKEN', persisted_token)
        os.environ['TT_REMEMBER_TOKEN'] = persisted_token

    if conn:
        _store_database_remember_token(conn, persisted_token)
        conn.commit()
        print('[AUTH] Remember-token state committed to PostgreSQL.')
    print('[AUTH] Session token renewed.')
    return session_token


def _recover_from_env_seed(rejected_token):
    """Second and last attempt, using the local seed when it is a different token.

    The shared row and the local file can diverge exactly once: when an exchange
    succeeded, .env took the successor, and the database write then failed. The
    row keeps a token the provider has already retired, and every later run
    re-sends that dead token -- which is precisely the loop observed from
    2026-08-26. Trying the disk copy costs one request and ends that loop
    without a human.

    Only attempted when the seeds actually differ. Re-sending the same rejected
    token would be a second guaranteed 401, and enough of those look like an
    attack on the account rather than a retry.
    """
    seed = _remember_token_from_env()
    if not seed or seed == rejected_token:
        return None
    print('[AUTH] Shared remember-token was rejected; retrying with the local .env seed.')
    conn = None
    try:
        conn, _ = _acquire_remember_token_state()
        return _exchange_and_persist(conn, seed)
    except (ValueError, TokenStateError) as exc:
        if conn:
            conn.rollback()
        print(f'[AUTH] Local seed failed as well: {exc}')
        return None
    finally:
        if conn:
            conn.close()


def get_session_token():
    """
    Returns a valid session-token.
    Uses PostgreSQL-backed remember-token state to create one session-token per
    process run. The database transaction lock prevents concurrent collectors
    from consuming the same token.
    """
    global _SESSION_TOKEN_CACHE
    if _SESSION_TOKEN_CACHE:
        return _SESSION_TOKEN_CACHE

    conn = None
    rejected_token = None
    try:
        conn, remember_token = _acquire_remember_token_state()
        if not remember_token:
            raise TokenStateError('No TT_REMEMBER_TOKEN seed is available; run `python auth.py --login` first.')
        _SESSION_TOKEN_CACHE = _exchange_and_persist(conn, remember_token)
        return _SESSION_TOKEN_CACHE
    except RememberTokenRejected as e:
        if conn:
            conn.rollback()
            conn.close()
            conn = None
        rejected_token = remember_token
        recovered = _recover_from_env_seed(rejected_token)
        if recovered:
            _SESSION_TOKEN_CACHE = recovered
            return recovered
        _open_breaker(e)
        # Both seeds are dead. Say so in the terminal state's own words: this is
        # not a transient provider error and every retry is one more 401 against
        # the account. Naming the remedy in the alert matters because the alert
        # is all the operator sees -- the collector is about to exit.
        msg = (
            f'{e}\n\nThe stored remember-token is spent and no local seed could '
            'replace it. Retrying cannot fix this; the account needs an '
            'interactive re-login:\n\n'
            '  cd collector && PYTHONPATH=$PWD ./venv311/bin/python auth.py --login\n\n'
            'Until then `earnings_date` and `term_structure` stay frozen -- '
            'Tastytrade is their only source.'
        )
        print(f'[AUTH] {msg}')
        send_alert_email(
            subject='Tastytrade remember-token is spent; re-login required',
            body=msg,
        )
        sys.exit(1)
    except (ValueError, TokenStateError) as e:
        if conn:
            conn.rollback()
        msg = str(e)
        print(f'[AUTH] {msg}')
        send_alert_email(
            subject='[Options Lab] Tastytrade authentication unavailable',
            body=(
                'The Tastytrade collector could not establish a session.\n\n'
                f'Error: {msg}'
            ),
        )
        sys.exit(1)
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Manual login wizard (run once, or when remember-token expires)
# ---------------------------------------------------------------------------

def _post(path, payload, extra_headers=None):
    h = _headers()
    if extra_headers:
        h.update(extra_headers)
    return requests.post(f'{TT_BASE}{path}', headers=h, json=payload, timeout=15)


def manual_login():
    """Interactive multi-step Tastytrade login. Run when remember-token expires."""
    login    = os.getenv('TT_LOGIN')    or input('Tastytrade email: ').strip()
    password = os.getenv('TT_PASSWORD') or input('Tastytrade password: ').strip()

    # Step 1: Initial POST /sessions — expect 403 + challenge token
    print('\n[1/4] Initiating session...')
    r = _post('/sessions', {'login': login, 'password': password, 'remember-me': True})
    challenge_token = r.headers.get('x-tastyworks-challenge-token')
    if not challenge_token:
        if r.status_code == 201:
            # No device challenge required (rare)
            _save_tokens(r.json()['data'])
            return
        print(f'Unexpected response: {r.status_code} {r.text}')
        sys.exit(1)

    print(f'  Challenge token received (status {r.status_code})')

    # Step 2: Request device challenge (security question or OTP)
    print('\n[2/4] Requesting device challenge...')
    r2 = _post(
        '/device-challenge',
        {'challenge-token': challenge_token},
        extra_headers={'x-tastyworks-challenge-token': challenge_token},
    )
    data2 = r2.json()
    step = data2.get('data', {}).get('step') or data2.get('step', '')
    print(f'  Step: {step}')

    if step == 'security_question':
        question = data2['data'].get('question', '')
        print(f'\n[3/4] Security question: {question}')
        answer = input('Your answer: ').strip()
        r3 = _post(
            '/device-challenge',
            {'challenge-token': challenge_token, 'answer': answer},
            extra_headers={'x-tastyworks-challenge-token': challenge_token},
        )
        print(f'  Response: {r3.status_code}')
        step3 = (r3.json().get('data', {}) or {}).get('step', '')
        if step3 == 'otp_verification':
            otp = input('\n[4/4] OTP sent to your email. Enter OTP: ').strip()
            _complete_otp(login, password, challenge_token, otp)
        else:
            print(f'Unexpected step after answer: {step3}')
            sys.exit(1)

    elif step == 'otp_verification':
        otp = input('\n[3/4] OTP sent to your email. Enter OTP: ').strip()
        _complete_otp(login, password, challenge_token, otp)

    else:
        print(f'Unknown step: {step}')
        sys.exit(1)


def _complete_otp(login, password, challenge_token, otp):
    print('\n[4/4] Completing login with OTP...')
    r = _post(
        '/sessions',
        {'login': login, 'password': password, 'remember-me': True},
        extra_headers={
            'x-tastyworks-challenge-token': challenge_token,
            'x-tastyworks-otp': otp,
        },
    )
    if r.status_code == 201:
        _save_tokens(r.json()['data'])
    else:
        print(f'Login failed: {r.status_code} {r.text}')
        sys.exit(1)


def _save_tokens(data):
    session_token  = data['session-token']
    remember_token = data.get('remember-token', '')
    _persist_manual_remember_token(remember_token)
    print(f'\n[AUTH] Login successful!')
    print(f'  session-token : {session_token[:20]}...')
    print(f'  remember-token: {remember_token[:20]}...')
    print(f'  remember-token saved to PostgreSQL and .env')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--login', action='store_true', help='Run interactive login wizard')
    args = parser.parse_args()

    if args.login:
        manual_login()
    else:
        token = get_session_token()
        print(f'Session token: {token[:20]}...')
