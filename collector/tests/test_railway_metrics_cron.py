import json
import unittest
from pathlib import Path


COLLECTOR_DIR = Path(__file__).resolve().parents[1]


class RailwayMetricsCronTest(unittest.TestCase):
    def test_config_is_one_shot_weekday_cron(self):
        config = json.loads((COLLECTOR_DIR / 'railway.metrics.json').read_text())
        self.assertEqual(config['build']['builder'], 'DOCKERFILE')
        self.assertEqual(config['build']['dockerfilePath'], 'collector/Dockerfile.metrics')
        self.assertEqual(config['deploy']['startCommand'], 'python collect.py')
        self.assertEqual(config['deploy']['cronSchedule'], '30 22 * * 1-5')
        self.assertEqual(config['deploy']['restartPolicyType'], 'NEVER')

    def test_container_runs_only_the_metrics_collector(self):
        dockerfile = (COLLECTOR_DIR / 'Dockerfile.metrics').read_text()
        self.assertIn('FROM python:3.11-slim', dockerfile)
        self.assertIn('COPY collector/requirements.txt ./', dockerfile)
        self.assertIn('COPY collector/ ./', dockerfile)
        self.assertIn('CMD ["python", "collect.py"]', dockerfile)
        self.assertIn('COLLECTOR_AUTH_CONSUMER=railway-metrics-cron', dockerfile)
        self.assertNotIn('run_collector_daemon.py', dockerfile)
        dockerignore = (COLLECTOR_DIR / '.dockerignore').read_text()
        self.assertIn('.env', dockerignore)
        self.assertIn('venv311/', dockerignore)


if __name__ == '__main__':
    unittest.main()
