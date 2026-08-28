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


def format_health_report(report: dict, fingerprint: str | None = None) -> str:
    """Turn a collector health report into something readable on a phone.

    The previous alert body was `json.dumps(report, indent=2)`. On a phone that
    is half a screen of fingerprint, expected_count and a nested issues array,
    and the reader still has to work out what it means. An operator alert has
    one job: say what is wrong and how bad, in the first line.

    Written in Chinese because the operator who reads these does. Keep the code
    comments English to match the rest of the collector.

    Returns text only -- what to do with it is the caller's decision, so this
    stays a pure function that a log line and a push can share.
    """
    lines = []
    status = report.get('status', 'unknown')
    covered = report.get('covered_count')
    expected = report.get('expected_count')
    pct = report.get('coverage_pct')
    if covered is not None and expected is not None:
        lines.append(f'采集器 {status} —— 覆盖 {covered}/{expected}'
                     + (f'({pct}%)' if pct is not None else ''))
    else:
        lines.append(f'采集器 {status}')

    counts = [
        ('缺失', report.get('missing_count')),
        ('过期', report.get('stale_count')),
        ('不完整', report.get('incomplete_count')),
    ]
    shown = [f'{label} {value}' for label, value in counts if value]
    if shown:
        lines.append('，'.join(shown))

    for issue in report.get('issues') or []:
        lines.append('• ' + _describe_issue(issue))

    when = report.get('generated_at')
    if when:
        lines.append('')
        lines.append(str(when)[:16].replace('T', ' ') + ' UTC')
    if fingerprint:
        # Enough to correlate with the log line, without pasting 64 hex characters
        # into a push notification.
        lines.append(f'fingerprint {fingerprint[:8]}')
    return '\n'.join(lines)


def _describe_issue(issue: dict) -> str:
    code = issue.get('code', '')
    value = issue.get('value')
    threshold = issue.get('threshold')
    symbols = issue.get('symbols') or []
    # Naming at most a handful: a push listing 300 tickers is the JSON problem
    # again in a different costume.
    named = '、'.join(symbols[:5]) + ('…' if len(symbols) > 5 else '')

    if code == 'coverage_below_threshold':
        text = f'覆盖率 {value}% 低于 {threshold}%'
        return f'{text}，缺 {len(symbols)} 个：{named}' if symbols else text
    if code == 'failed_jobs_above_threshold':
        return f'24 小时内 {value} 个任务失败（阈值 {threshold}）'
    if code == 'snapshot_age_above_threshold':
        text = f'{len(symbols)} 个标的快照超过 {threshold} 分钟未更新'
        return f'{text}：{named}' if symbols else text
    if code == 'completeness_below_threshold':
        text = f'{value} 个标的链完整度低于 {threshold}%'
        return f'{text}：{named}' if symbols else text
    # An unknown code must still be legible rather than silently dropped -- a new
    # issue type appearing as a blank bullet is worse than an ugly one.
    detail = f'{code}: value={value} threshold={threshold}'
    return f'{detail}（{named}）' if symbols else detail


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
