import unittest
from pathlib import Path


OPS_DIR = Path(__file__).resolve().parents[2] / 'ops' / 'ib-gateway'


class IbCloudEvaluationTest(unittest.TestCase):
    def test_gateway_template_is_pinned_read_only_and_loopback_only(self):
        compose = (OPS_DIR / 'docker-compose.yml').read_text()
        self.assertIn('ghcr.io/gnzsnz/ib-gateway:10.45.1f', compose)
        self.assertNotIn('ib-gateway:latest', compose)
        self.assertNotIn('ib-gateway:stable', compose)
        self.assertIn('READ_ONLY_API: ${READ_ONLY_API:-yes}', compose)
        self.assertIn('TRADING_MODE: ${TRADING_MODE:-paper}', compose)
        self.assertIn('127.0.0.1:4001:4001', compose)
        self.assertIn('127.0.0.1:4002:4002', compose)
        self.assertNotIn('0.0.0.0:400', compose)

    def test_password_uses_a_secret_file_not_plain_environment(self):
        compose = (OPS_DIR / 'docker-compose.yml').read_text()
        self.assertIn('TWS_PASSWORD_FILE: /run/secrets/tws_password', compose)
        self.assertNotIn('TWS_PASSWORD:', compose)
        self.assertFalse((OPS_DIR / 'secrets' / 'tws_password.txt').exists())


if __name__ == '__main__':
    unittest.main()
