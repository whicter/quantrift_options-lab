import os
import unittest
from unittest.mock import patch

import operator_alerts


class OperatorAlertsTest(unittest.TestCase):
    def test_logs_when_no_external_channel_is_configured(self):
        # TG_* belongs in this set for the same reason as the rest: the test
        # asserts the no-transport path, so every transport must be absent.
        # Leaving it out did not merely break the assertion -- with real
        # credentials in the environment the suite posted an actual "test/body"
        # message to the operator's Telegram chat on every run.
        clean_env = {
            key: value for key, value in os.environ.items()
            if key not in {'ALERT_WEBHOOK_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
                           'ALERT_EMAIL', 'TG_TOKEN', 'TG_CHAT_ID'}
        }
        with patch.dict(os.environ, clean_env, clear=True):
            with self.assertLogs(operator_alerts.log, level='WARNING'):
                channels = operator_alerts.send_operator_alert('test', 'body')

        self.assertEqual(channels, ['log'])


class HealthReportFormattingTest(unittest.TestCase):
    """A push notification has to say what is wrong in its first line.

    The health alert body was `json.dumps(report, indent=2)`. Delivered to a
    phone on 2026-08-28 it was half a screen of fingerprint, expected_count and
    a nested issues array -- about 30 lines to convey "coverage 95.65%, two thin
    chains, some failed jobs". The reader could not tell whether it needed
    acting on.
    """

    REPORT = {
        'status': 'degraded',
        'generated_at': '2026-08-28T16:19:46.355814+00:00',
        'expected_count': 322, 'covered_count': 308, 'coverage_pct': 95.65,
        'missing_count': 14, 'stale_count': 0, 'incomplete_count': 2,
        'failed_count_24h': 77,
        'issues': [
            {'code': 'failed_jobs_above_threshold', 'value': 77, 'threshold': 0, 'symbols': []},
            {'code': 'completeness_below_threshold', 'value': 2, 'threshold': 75.0,
             'symbols': ['HOOD', 'LVHI']},
        ],
    }

    def test_the_first_line_carries_status_and_coverage(self):
        first = operator_alerts.format_health_report(self.REPORT).splitlines()[0]
        self.assertIn('degraded', first)
        self.assertIn('308/322', first)

    def test_every_issue_becomes_a_sentence_not_a_code(self):
        text = operator_alerts.format_health_report(self.REPORT)
        self.assertIn('24 小时内 77 个任务失败', text)
        self.assertIn('HOOD、LVHI', text)
        # The raw codes are for the log, not the push.
        self.assertNotIn('failed_jobs_above_threshold', text)
        self.assertNotIn('completeness_below_threshold', text)

    def test_it_stays_short_enough_to_read_on_a_phone(self):
        import json
        text = operator_alerts.format_health_report(self.REPORT)
        raw = json.dumps(self.REPORT, indent=2)
        self.assertLess(len(text.splitlines()), 10)
        self.assertLess(len(text.splitlines()), len(raw.splitlines()) / 2)

    def test_a_long_symbol_list_is_truncated(self):
        # Naming 300 tickers in a push is the JSON problem in another costume.
        report = dict(self.REPORT, issues=[{
            'code': 'snapshot_age_above_threshold', 'value': 40, 'threshold': 180,
            'symbols': [f'SYM{i}' for i in range(40)],
        }])
        text = operator_alerts.format_health_report(report)
        self.assertIn('…', text)
        self.assertLess(len(text), 400)

    def test_an_unrecognised_issue_code_is_still_legible(self):
        # A new issue type must not render as a blank bullet; ugly beats silent.
        report = dict(self.REPORT, issues=[
            {'code': 'some_future_check', 'value': 3, 'threshold': 1, 'symbols': ['AAPL']}])
        text = operator_alerts.format_health_report(report)
        self.assertIn('some_future_check', text)
        self.assertIn('AAPL', text)

    def test_the_fingerprint_is_shortened_to_correlate_not_to_fill_the_screen(self):
        text = operator_alerts.format_health_report(self.REPORT, 'a' * 64)
        self.assertIn('a' * 8, text)
        self.assertNotIn('a' * 20, text)

    def test_zero_counts_are_omitted_rather_than_printed_as_noise(self):
        text = operator_alerts.format_health_report(self.REPORT)
        self.assertIn('缺失 14', text)
        self.assertNotIn('过期 0', text)
