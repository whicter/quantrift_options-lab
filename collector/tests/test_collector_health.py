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

    def _with_failure_budget(self, n):
        return check_collector_health.HealthThresholds(
            min_coverage_pct=90, max_failed_24h=n, max_snapshot_age_minutes=180,
            min_completeness_pct=75, alert_cooldown_minutes=60,
        )

    def test_failures_are_counted_per_lane_not_pooled(self):
        # 20 + 20 pooled would be 40 against a threshold of 25, but neither lane
        # has actually broken. The 2026-10-02 alert was this shape in reverse:
        # a standing 15 of VIX chain noise left only 10 of headroom for IB.
        report = check_collector_health.evaluate_health(
            ['AAPL'], {'AAPL': self.row()},
            {'option_chain_snapshot': 20, 'option_quote_snapshot': 20},
            self.now, self._with_failure_budget(25),
        )

        self.assertEqual(report['status'], 'ok')
        self.assertEqual(report['failed_count_24h'], 40)
        self.assertEqual(report['failed_by_type_24h'],
                         {'option_chain_snapshot': 20, 'option_quote_snapshot': 20})

    def test_the_breaching_lane_is_named_in_the_issue(self):
        report = check_collector_health.evaluate_health(
            ['AAPL'], {'AAPL': self.row()},
            {'option_chain_snapshot': 2, 'option_quote_snapshot': 30},
            self.now, self._with_failure_budget(25),
        )

        issues = [i for i in report['issues'] if i['code'] == 'failed_jobs_above_threshold']
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]['job_type'], 'option_quote_snapshot')
        self.assertEqual(issues[0]['value'], 30)

    def test_a_second_lane_breaking_is_a_new_fingerprint(self):
        one = check_collector_health.evaluate_health(
            ['AAPL'], {'AAPL': self.row()}, {'option_chain_snapshot': 30},
            self.now, self._with_failure_budget(25),
        )
        both = check_collector_health.evaluate_health(
            ['AAPL'], {'AAPL': self.row()},
            {'option_chain_snapshot': 30, 'option_quote_snapshot': 30},
            self.now, self._with_failure_budget(25),
        )

        # Otherwise the second outage is folded into the open incident and the
        # operator is never told.
        self.assertNotEqual(
            check_collector_health.alert_fingerprint(one),
            check_collector_health.alert_fingerprint(both),
        )

    def test_an_int_total_is_still_accepted(self):
        report = check_collector_health.evaluate_health(
            ['AAPL'], {'AAPL': self.row()}, 30, self.now, self._with_failure_budget(25),
        )
        self.assertEqual(report['failed_count_24h'], 30)
        self.assertEqual(report['issues'][0]['code'], 'failed_jobs_above_threshold')

    def _universe(self, total, thin):
        symbols = [f'S{i:03d}' for i in range(total)]
        rows = {s: self.row(completeness=70 if i < thin else 98) for i, s in enumerate(symbols)}
        return symbols, rows

    def test_a_couple_of_chronically_thin_chains_are_reported_but_not_escalated(self):
        # The 2026-09-24 shape: FBND and SRVR, 2 of 330, never reach 75%.
        symbols, rows = self._universe(330, 2)
        report = check_collector_health.evaluate_health(symbols, rows, 0, self.now, self.thresholds)

        self.assertEqual(report['status'], 'ok')
        self.assertEqual(report['issues'], [])
        # Still visible -- demoted from an alert, not hidden.
        self.assertEqual(report['incomplete_count'], 2)
        self.assertEqual(report['incomplete_symbols'], ['S000', 'S001'])

    def test_a_broad_completeness_drop_still_alerts(self):
        symbols, rows = self._universe(330, 20)   # ~6% of the universe
        report = check_collector_health.evaluate_health(symbols, rows, 0, self.now, self.thresholds)

        self.assertEqual(report['status'], 'degraded')
        issue = next(i for i in report['issues'] if i['code'] == 'completeness_below_threshold')
        self.assertEqual(issue['value'], 20)
        self.assertEqual(issue['pct'], round(20 / 330 * 100, 2))

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


class AlertDedupeAndSessionTest(unittest.TestCase):
    """2026-09-23：过期名单一变指纹就变，冷却失效，一天推 50–100 条。"""

    def test_fingerprint_ignores_which_symbols(self):
        a = {'issues': [{'code': 'snapshot_age_above_threshold', 'symbols': ['A', 'B']}]}
        b = {'issues': [{'code': 'snapshot_age_above_threshold', 'symbols': ['A', 'B', 'C', 'D']}]}
        self.assertEqual(check_collector_health.alert_fingerprint(a),
                         check_collector_health.alert_fingerprint(b))

    def test_fingerprint_changes_when_issue_type_changes(self):
        a = {'issues': [{'code': 'snapshot_age_above_threshold', 'symbols': ['A']}]}
        b = {'issues': [{'code': 'snapshot_age_above_threshold', 'symbols': ['A']},
                        {'code': 'failed_jobs_above_threshold', 'symbols': []}]}
        self.assertNotEqual(check_collector_health.alert_fingerprint(a),
                            check_collector_health.alert_fingerprint(b))

    def _et(self, *args):
        from zoneinfo import ZoneInfo
        return datetime(*args, tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)

    def test_reference_is_now_in_session(self):
        now = self._et(2026, 9, 23, 11, 0)
        self.assertEqual(check_collector_health.staleness_reference(now), now)

    def test_reference_is_today_close_after_close(self):
        self.assertEqual(check_collector_health.staleness_reference(self._et(2026, 9, 23, 18, 7)),
                         self._et(2026, 9, 23, 16, 0))

    def test_reference_before_open_is_previous_close(self):
        self.assertEqual(check_collector_health.staleness_reference(self._et(2026, 9, 24, 8, 0)),
                         self._et(2026, 9, 23, 16, 0))

    def test_reference_on_weekend_is_friday_close(self):
        self.assertEqual(check_collector_health.staleness_reference(self._et(2026, 9, 27, 12, 0)),
                         self._et(2026, 9, 25, 16, 0))
        self.assertEqual(check_collector_health.staleness_reference(self._et(2026, 9, 28, 7, 0)),
                         self._et(2026, 9, 25, 16, 0))

    def test_after_close_staleness_does_not_grow(self):
        th = check_collector_health.HealthThresholds(max_snapshot_age_minutes=180)
        row = {'snapshot_ts': self._et(2026, 9, 23, 14, 30), 'completeness_pct': 99,
               'contract_count': 40, 'provider_status': 'ok'}
        for hh in (17, 20, 23):
            r = check_collector_health.evaluate_health(['X'], {'X': row}, 0, self._et(2026, 9, 23, hh, 0), th)
            self.assertEqual(r['stale_count'], 0, hh)
        old = dict(row, snapshot_ts=self._et(2026, 9, 23, 12, 0))   # 盘中真没刷到的仍然报
        r = check_collector_health.evaluate_health(['X'], {'X': old}, 0, self._et(2026, 9, 23, 20, 0), th)
        self.assertEqual(r['stale_count'], 1)
