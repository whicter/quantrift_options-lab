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
