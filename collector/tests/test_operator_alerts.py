import os
import unittest
from unittest.mock import patch

import operator_alerts


class OperatorAlertsTest(unittest.TestCase):
    def test_logs_when_no_external_channel_is_configured(self):
        clean_env = {
            key: value for key, value in os.environ.items()
            if key not in {'ALERT_WEBHOOK_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ALERT_EMAIL'}
        }
        with patch.dict(os.environ, clean_env, clear=True):
            with self.assertLogs(operator_alerts.log, level='WARNING'):
                channels = operator_alerts.send_operator_alert('test', 'body')

        self.assertEqual(channels, ['log'])
