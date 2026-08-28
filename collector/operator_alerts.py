from __future__ import annotations

import json
import logging
import os
import smtplib
from email.mime.text import MIMEText

import requests


log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> tuple[str, str | None]:
    smtp_host = os.getenv('SMTP_HOST', '').strip()
    smtp_user = os.getenv('SMTP_USER', '').strip()
    smtp_pass = os.getenv('SMTP_PASS', '').strip()
    if not all((smtp_host, smtp_user, smtp_pass)):
        return 'blocked', 'SMTP is not configured'
    try:
        message = MIMEText(body)
        message['Subject'] = subject
        message['From'] = smtp_user
        message['To'] = to
        with smtplib.SMTP(smtp_host, int(os.getenv('SMTP_PORT', '587'))) as client:
            client.starttls()
            client.login(smtp_user, smtp_pass)
            client.sendmail(smtp_user, [to], message.as_string())
        return 'sent', None
    except (OSError, smtplib.SMTPException) as exc:
        log.error('email delivery failed: %s', exc)
        return 'failed', str(exc)


def send_web_push(subscription: dict, payload: dict) -> tuple[str, str | None]:
    private_key = os.getenv('WEB_PUSH_VAPID_PRIVATE_KEY', '').strip()
    subject = os.getenv('WEB_PUSH_VAPID_SUBJECT', '').strip()
    if not private_key or not subject:
        return 'blocked', 'VAPID is not configured'
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return 'blocked', 'pywebpush is not installed'
    try:
        webpush(subscription_info=subscription, data=json.dumps(payload), vapid_private_key=private_key, vapid_claims={'sub': subject})
        return 'sent', None
    except WebPushException as exc:
        log.error('web push delivery failed: %s', exc)
        return 'failed', str(exc)


def send_telegram(subject: str, body: str) -> tuple[str, str | None]:
    """Deliver to the Telegram chat the other QuantRift projects already watch.

    Chosen over SMTP because the SMTP variables here have been present but empty
    since the file was written: `send_operator_alert` therefore returned
    channels=['log'] every time, and a real outage -- Tastytrade auth dying on
    2026-08-26 -- sat unnoticed for two days in `logs/collect.log`. An alert
    path whose only sink is a log file is not an alert path.

    Plain text, not Markdown or HTML: a provider error body can contain
    underscores and asterisks, and Telegram rejects the whole message when the
    entities do not parse. An alert that fails to send because the failure it
    describes had an underscore in it is the worst possible failure mode.
    """
    token = os.getenv('TG_TOKEN', '').strip()
    chat_id = os.getenv('TG_CHAT_ID', '').strip()
    if not token or not chat_id:
        return 'blocked', 'Telegram is not configured'
    try:
        response = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            data={'chat_id': chat_id, 'text': f'[Options Lab] {subject}\n\n{body}'[:4096]},
            timeout=10,
        )
        response.raise_for_status()
        return 'sent', None
    except requests.RequestException as exc:
        # Never log `token`; the URL carries it, so log the exception's own text
        # only after stripping anything that looks like the bot path.
        detail = str(exc).replace(token, '<redacted>') if token else str(exc)
        log.error('telegram delivery failed: %s', detail)
        return 'failed', detail


def send_operator_alert(subject: str, body: str, severity: str = 'warning') -> list[str]:
    channels: list[str] = []
    status, _ = send_telegram(subject, body)
    if status == 'sent':
        channels.append('telegram')

    webhook_url = os.getenv('ALERT_WEBHOOK_URL', '').strip()
    if webhook_url:
        try:
            response = requests.post(
                webhook_url,
                json={'subject': subject, 'body': body, 'severity': severity},
                timeout=10,
            )
            response.raise_for_status()
            channels.append('webhook')
        except requests.RequestException as exc:
            log.error('operator alert webhook failed: %s', exc)

    smtp_host = os.getenv('SMTP_HOST', '').strip()
    smtp_user = os.getenv('SMTP_USER', '').strip()
    smtp_pass = os.getenv('SMTP_PASS', '').strip()
    alert_to = os.getenv('ALERT_EMAIL', '').strip()
    if all((smtp_host, smtp_user, smtp_pass, alert_to)):
        try:
            status, _ = send_email(alert_to, subject, body)
            if status == 'sent': channels.append('email')
        except (OSError, smtplib.SMTPException) as exc:
            log.error('operator alert email failed: %s', exc)

    if not channels:
        log.warning('operator alert (no external channel configured): %s %s', subject, json.dumps({
            'severity': severity,
            'body': body,
        }, ensure_ascii=True))
        channels.append('log')
    return channels
