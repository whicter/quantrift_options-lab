from __future__ import annotations

import json
import logging
import os
import smtplib
from email.mime.text import MIMEText

import requests


log = logging.getLogger(__name__)


def send_operator_alert(subject: str, body: str, severity: str = 'warning') -> list[str]:
    channels: list[str] = []
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
            message = MIMEText(body)
            message['Subject'] = subject
            message['From'] = smtp_user
            message['To'] = alert_to
            with smtplib.SMTP(smtp_host, int(os.getenv('SMTP_PORT', '587'))) as client:
                client.starttls()
                client.login(smtp_user, smtp_pass)
                client.sendmail(smtp_user, [alert_to], message.as_string())
            channels.append('email')
        except (OSError, smtplib.SMTPException) as exc:
            log.error('operator alert email failed: %s', exc)

    if not channels:
        log.warning('operator alert (no external channel configured): %s %s', subject, json.dumps({
            'severity': severity,
            'body': body,
        }, ensure_ascii=True))
        channels.append('log')
    return channels
