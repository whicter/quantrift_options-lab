import os
import unittest
from unittest.mock import patch

import evaluate_scanner_alerts
import operator_alerts


class ScannerAlertsTest(unittest.TestCase):
    def test_rules_are_conjunctive_and_fail_closed(self):
        row = {'symbol': 'AAPL', 'iv_rank': 60, 'gamma_regime': 'positive', 'unusual_oi_count': 2}
        self.assertTrue(evaluate_scanner_alerts.matches_rules(row, {'min_iv_rank': 50, 'gamma_regime': 'positive', 'unusual_only': True}))
        self.assertFalse(evaluate_scanner_alerts.matches_rules(row, {'symbols': ['SPY']}))
        self.assertFalse(evaluate_scanner_alerts.matches_rules({**row, 'iv_rank': None}, {'min_iv_rank': 50}))

    def test_payload_links_to_real_symbol_analysis(self):
        with patch.dict(os.environ, {'PUBLIC_APP_URL': 'https://www.quantrift.io'}):
            payload = evaluate_scanner_alerts.build_payload({'symbol': 'AAPL', 'iv_rank': 62, 'gamma_regime': 'positive', 'signal_score': 80})
        self.assertEqual(payload['url'], 'https://www.quantrift.io/analyze?symbol=AAPL&tab=0')

    def test_delivery_is_blocked_without_smtp_or_vapid(self):
        clean = {key: value for key, value in os.environ.items() if key not in {
            'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT'
        }}
        with patch.dict(os.environ, clean, clear=True):
            self.assertEqual(operator_alerts.send_email('test@example.com', 'subject', 'body')[0], 'blocked')
            self.assertEqual(operator_alerts.send_web_push({}, {})[0], 'blocked')


if __name__ == '__main__':
    unittest.main()
