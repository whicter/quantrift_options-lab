import json
import unittest
from pathlib import Path


COLLECTOR_DIR = Path(__file__).resolve().parents[1]


class RailwayRefreshCronTest(unittest.TestCase):
    def test_config_is_one_shot_five_minute_refresh_cron(self):
        config = json.loads((COLLECTOR_DIR / 'railway.metrics.json').read_text())
        self.assertEqual(config['build']['builder'], 'DOCKERFILE')
        self.assertEqual(config['build']['dockerfilePath'], 'collector/Dockerfile.metrics')
        self.assertEqual(config['deploy']['startCommand'], 'python run_railway_refresh_cycle.py')
        self.assertEqual(config['deploy']['cronSchedule'], '*/5 * * * 1-5')
        self.assertEqual(config['deploy']['restartPolicyType'], 'NEVER')

    def test_container_runs_the_one_shot_refresh_cycle(self):
        dockerfile = (COLLECTOR_DIR / 'Dockerfile.metrics').read_text()
        self.assertIn('FROM python:3.11-slim', dockerfile)
        self.assertIn('COPY collector/requirements.txt ./', dockerfile)
        self.assertIn('COPY collector/ ./', dockerfile)
        self.assertIn('CMD ["python", "run_railway_refresh_cycle.py"]', dockerfile)
        self.assertIn('COLLECTOR_RUNTIME=railway-refresh-cron', dockerfile)
        self.assertIn('TT_METRICS_ENABLED=false', dockerfile)
        self.assertNotIn('run_collector_daemon.py', dockerfile)
        dockerignore = (COLLECTOR_DIR / '.dockerignore').read_text()
        self.assertIn('.env', dockerignore)
        self.assertIn('venv311/', dockerignore)

    def test_refresh_cycle_schedules_then_consumes_then_materializes(self):
        source = (COLLECTOR_DIR / 'run_railway_refresh_cycle.py').read_text()
        self.assertLess(source.index('schedule_option_refresh.run()'), source.index('run_refresh_worker.run()'))
        self.assertLess(source.index('run_refresh_worker.run()'), source.index('materialize_scan.run()'))


if __name__ == '__main__':
    unittest.main()
