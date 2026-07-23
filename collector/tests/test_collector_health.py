import unittest
from datetime import datetime, timedelta, timezone

import check_collector_health


class CollectorHealthTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 7, 15, 20, 0, tzinfo=timezone.utc)
        self.thresholds = check_collector_health.HealthThresholds(
            min_coverage_pct=90,
            max_failed_24h=0,
            max_snapshot_age_minutes=180,
            min_completeness_pct=75,
            alert_cooldown_minutes=60,
        )

    def row(self, *, age_minutes=10, completeness=98, contract_count=40, provider_status='ok'):
        return {
            'snapshot_ts': self.now - timedelta(minutes=age_minutes),
            'completeness_pct': completeness,
            'contract_count': contract_count,
            'provider_status': provider_status,
        }

    def test_healthy_report_has_no_issues(self):
        report = check_collector_health.evaluate_health(
            ['AAPL', 'SPY'],
            {'AAPL': self.row(), 'SPY': self.row()},
            0,
            self.now,
            self.thresholds,
        )

        self.assertEqual(report['status'], 'ok')
        self.assertEqual(report['coverage_pct'], 100)
        self.assertEqual(report['issues'], [])

    def test_reports_coverage_failures_staleness_and_completeness(self):
        report = check_collector_health.evaluate_health(
            ['AAPL', 'SPY', 'QQQ'],
            {
                'AAPL': self.row(age_minutes=181),
                'SPY': self.row(completeness=70),
            },
            2,
            self.now,
            self.thresholds,
        )

        self.assertEqual(report['status'], 'degraded')
        self.assertEqual(report['covered_count'], 2)
        self.assertEqual(report['missing_count'], 1)
        self.assertEqual(report['stale_count'], 1)
        self.assertEqual(report['incomplete_count'], 1)
        self.assertEqual(
            {issue['code'] for issue in report['issues']},
            {
                'coverage_below_threshold',
                'failed_jobs_above_threshold',
                'snapshot_age_above_threshold',
                'completeness_below_threshold',
            },
        )

    def test_empty_or_metadata_only_snapshot_is_not_covered(self):
        report = check_collector_health.evaluate_health(
            ['AAPL'],
            {'AAPL': self.row(contract_count=0, provider_status='metadata_only')},
            0,
            self.now,
            self.thresholds,
        )

        self.assertEqual(report['covered_count'], 0)
        self.assertEqual(report['issues'][0]['code'], 'coverage_below_threshold')

    def test_alert_cooldown_suppresses_duplicate_notification(self):
        self.assertTrue(check_collector_health.should_notify(None, self.now, 60))
        self.assertFalse(check_collector_health.should_notify(self.now - timedelta(minutes=59), self.now, 60))
        self.assertTrue(check_collector_health.should_notify(self.now - timedelta(minutes=60), self.now, 60))

    def test_fingerprint_is_stable_for_issue_order(self):
        first = {'issues': [
            {'code': 'stale', 'symbols': ['SPY', 'AAPL']},
            {'code': 'failed', 'symbols': []},
        ]}
        second = {'issues': [
            {'code': 'stale', 'symbols': ['AAPL', 'SPY']},
            {'code': 'failed', 'symbols': []},
        ]}

        self.assertEqual(
            check_collector_health.alert_fingerprint(first),
            check_collector_health.alert_fingerprint(second),
        )
