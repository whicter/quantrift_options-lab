"""
Tastytrade authentication with remember-token auto-renewal.

Flow:
  - Normal run: use remember-token to get a session-token (fully automated)
  - If remember-token expired: send alert email and exit (requires manual re-login)

Manual first login / re-login: run `python auth.py --login` and follow prompts.
"""

import os
import sys
import json
import smtplib
import argparse
import requests
import psycopg2
from email.mime.text import MIMEText
from dotenv import load_dotenv, set_key

load_dotenv()

TT_BASE   = os.getenv('TT_BASE_URL', 'https://api.tastyworks.com').rstrip('/')
TT_USER_AGENT = os.getenv('TT_USER_AGENT', 'quantrift-options-lab/0.1')
ENV_FILE  = os.path.join(os.path.dirname(__file__), '.env')
_SESSION_TOKEN_CACHE = None
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


def send_alert_email(subject, body):
    """Send alert via SMTP when human intervention is needed."""
    smtp_host = os.getenv('SMTP_HOST')
    smtp_port = int(os.getenv('SMTP_PORT', 587))
    smtp_user = os.getenv('SMTP_USER')
    smtp_pass = os.getenv('SMTP_PASS')
    alert_to  = os.getenv('ALERT_EMAIL')

    if not all([smtp_host, smtp_user, smtp_pass, alert_to]):
        print(f'[ALERT] {subject}: {body}')
        return

    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From']    = smtp_user
    msg['To']      = alert_to

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, [alert_to], msg.as_string())
        print(f'[AUTH] Alert email sent to {alert_to}')
    except Exception as e:
        print(f'[AUTH] Failed to send alert email: {e}')


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


def _acquire_remember_token_state():
    """Lock the shared provider state for one renewal, or fall back to local .env."""
    database_url = _database_url()
    if not database_url:
        return None, os.getenv('TT_REMEMBER_TOKEN', '').strip()

    try:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (AUTH_STATE_PROVIDER,))
            cur.execute(
                'SELECT remember_token FROM provider_auth_state WHERE provider = %s FOR UPDATE',
                (AUTH_STATE_PROVIDER,),
            )
            row = cur.fetchone()
        return conn, (row[0] if row else os.getenv('TT_REMEMBER_TOKEN', '').strip())
    except psycopg2.Error as exc:
        raise TokenStateError('PostgreSQL provider authentication state is unavailable.') from exc


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
    """Save a manually-issued seed to the shared database and local .env."""
    conn = None
    try:
        conn, _ = _acquire_remember_token_state()
        if conn:
            _store_database_remember_token(conn, remember_token)
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
    try:
        conn, remember_token = _acquire_remember_token_state()
        if not remember_token:
            raise TokenStateError('No TT_REMEMBER_TOKEN seed is available; run `python auth.py --login` first.')
        try:
            session_token, replacement_token = renew_session(remember_token)
        except RememberTokenRejected:
            # A Railway deployment may retain an older database token while its
            # TT_REMEMBER_TOKEN variable has been replaced with a fresh seed.
            # Use that seed only for this explicit credential rejection, never
            # for transient failures and never when it is the same token.
            bootstrap_token = os.getenv('TT_REMEMBER_TOKEN', '').strip()
            if not conn or not bootstrap_token or bootstrap_token == remember_token:
                raise
            print('[AUTH] Database remember token rejected; trying configured recovery seed once.')
            session_token, replacement_token = renew_session(bootstrap_token)
            remember_token = bootstrap_token
        persisted_token = replacement_token or remember_token
        if conn:
            _store_database_remember_token(conn, persisted_token)
            conn.commit()
            print('[AUTH] Remember-token state committed to PostgreSQL.')
        elif replacement_token and replacement_token != remember_token:
            set_key(ENV_FILE, 'TT_REMEMBER_TOKEN', replacement_token)
            os.environ['TT_REMEMBER_TOKEN'] = replacement_token
            print('[AUTH] Provider-supplied remember-token successor persisted.')
        _SESSION_TOKEN_CACHE = session_token
        print('[AUTH] Session token renewed.')
        return session_token
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
