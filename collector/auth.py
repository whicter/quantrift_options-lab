"""
Tastytrade authentication with remember-token auto-renewal.

Flow:
  - Normal run: use remember-token to get a new session-token (fully automated)
  - If remember-token expired: send alert email and exit (requires manual re-login)

Manual first login / re-login: run `python auth.py --login` and follow prompts.
"""

import os
import sys
import json
import smtplib
import argparse
import requests
from email.mime.text import MIMEText
from dotenv import load_dotenv, set_key

load_dotenv()

TT_BASE   = 'https://api.tastyworks.com'
ENV_FILE  = os.path.join(os.path.dirname(__file__), '.env')


def _headers(session_token=None):
    h = {'Content-Type': 'application/json'}
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
    Returns (session_token, new_remember_token) or raises on failure.
    """
    login = os.getenv('TT_LOGIN')
    resp = requests.post(
        f'{TT_BASE}/sessions',
        headers=_headers(),
        json={'login': login, 'remember-token': remember_token, 'remember-me': True},
        timeout=15,
    )

    if resp.status_code == 201:
        data = resp.json()['data']
        session_token   = data['session-token']
        new_remember    = data.get('remember-token', remember_token)
        return session_token, new_remember

    # 401 means remember-token expired → need manual re-login
    raise ValueError(f'remember-token renewal failed: {resp.status_code} {resp.text}')


def get_session_token():
    """
    Returns a valid session-token.
    Auto-renews via remember-token; sends alert and exits if token expired.
    Updates .env with the new remember-token.
    """
    remember_token = os.getenv('TT_REMEMBER_TOKEN')
    if not remember_token:
        print('[AUTH] No TT_REMEMBER_TOKEN in .env — run `python auth.py --login` first.')
        sys.exit(1)

    try:
        session_token, new_remember = renew_session(remember_token)
        # Persist updated remember-token
        if new_remember != remember_token:
            set_key(ENV_FILE, 'TT_REMEMBER_TOKEN', new_remember)
            print('[AUTH] remember-token updated in .env')
        print('[AUTH] Session token renewed.')
        return session_token
    except ValueError as e:
        msg = str(e)
        print(f'[AUTH] {msg}')
        send_alert_email(
            subject='[Options Lab] Tastytrade remember-token expired — action required',
            body=(
                'The Tastytrade remember-token has expired.\n\n'
                'Please run: python auth.py --login\n\n'
                f'Error: {msg}'
            ),
        )
        sys.exit(1)


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
    set_key(ENV_FILE, 'TT_REMEMBER_TOKEN', remember_token)
    print(f'\n[AUTH] Login successful!')
    print(f'  session-token : {session_token[:20]}...')
    print(f'  remember-token: {remember_token[:20]}...')
    print(f'  remember-token saved to .env')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--login', action='store_true', help='Run interactive login wizard')
    args = parser.parse_args()

    if args.login:
        manual_login()
    else:
        token = get_session_token()
        print(f'Session token: {token[:20]}...')
