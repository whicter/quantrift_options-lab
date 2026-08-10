import unittest
from unittest.mock import MagicMock

import run_refresh_worker


class ScanScopedJobSweepTests(unittest.TestCase):
    """The invalid-symbol sweep must exempt every scan-scoped job type.

    `provider_fetch_jobs.symbol` is normally a ticker, and `fail_unrunnable_queued_jobs`
    sweeps anything that does not look like one. Universe-wide jobs carry the
    '__SCAN__' pseudo-symbol instead, so each one needs an explicit exemption.

    Until 2026-08-09 the sweep hardcoded a single job type while the enqueue side
    (`SCAN_LEVEL_JOB_TYPES` in server/src/lib/refreshJobs.js) already accepted two.
    Every 'scanner_candidate_materialize' job routes/scannerCandidates.js queued on
    a stale batch was therefore failed with 'invalid queued refresh symbol' before
    it could run, and candidate batches were only ever produced by the daemon's
    timer -- the on-demand path had never worked.
    """

    def _sweep_sql(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.rowcount = 0
        run_refresh_worker.fail_unrunnable_queued_jobs(conn)
        return cursor.execute.call_args.args

    def test_sweep_exempts_every_scan_scoped_job_type(self):
        sql, params = self._sweep_sql()
        self.assertIn('__SCAN__', sql)
        self.assertIn('job_type = ANY(%s)', sql)
        exempted = params[-1]
        self.assertIn('scanner_materialize', exempted)
        self.assertIn('scanner_candidate_materialize', exempted)

    def test_exemption_is_a_list_not_a_single_hardcoded_literal(self):
        # A literal in the SQL is what let the two sides drift apart; passing the
        # set as a parameter is what keeps the next scan-scoped job type from
        # repeating the bug.
        sql, _ = self._sweep_sql()
        self.assertNotIn("job_type = 'scanner_materialize'", sql)

    def test_scan_scoped_types_match_the_enqueue_side(self):
        # server/src/lib/refreshJobs.js::SCAN_LEVEL_JOB_TYPES is the enqueue-side
        # allowlist. If a type can be queued with '__SCAN__' but not swept-exempt,
        # it is queued only to be failed.
        self.assertEqual(
            set(run_refresh_worker.SCAN_SCOPED_JOB_TYPES),
            {'scanner_materialize', 'scanner_candidate_materialize'},
        )


if __name__ == '__main__':
    unittest.main()
