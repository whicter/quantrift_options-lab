import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault('PROVIDER_RATE_LIMIT_BACKEND', 'file')

import run_refresh_worker  # noqa: E402


class FakeCursor:
    """Captures executed SQL instead of talking to Postgres."""

    def __init__(self, rowcounts):
        self.rowcounts = list(rowcounts)
        self.statements = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        self.statements.append((' '.join(sql.split()), params))
        self.rowcount = self.rowcounts.pop(0) if self.rowcounts else 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConn:
    def __init__(self, rowcounts):
        self._cursor = FakeCursor(rowcounts)
        self.commits = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1


class StaleJobTerminationTests(unittest.TestCase):
    """A stale job that ran out of attempts must terminate, not linger.

    The requeue is guarded by `attempts < WORKER_MAX_ATTEMPTS`, so a job that had
    both gone stale AND spent its attempts matched nothing and stayed `running`
    forever. Because active jobs are deduplicated regardless of age, no
    replacement could be enqueued for that symbol either -- it was frozen out
    entirely. Observed 2026-08-20: SMH and PEP had been `running` for 17.2 and
    14.2 days, `last_error` still NULL, with no option_chain_snapshot row to show
    for it.
    """

    def test_both_branches_run_and_counts_are_summed(self):
        conn = FakeConn([2, 3])
        recovered = run_refresh_worker.recover_stale_running_jobs(conn)

        self.assertEqual(recovered, 5, 'requeued and terminated must both be counted')
        self.assertEqual(len(conn._cursor.statements), 2)
        self.assertEqual(conn.commits, 1)

    def test_the_two_branches_partition_on_attempts(self):
        conn = FakeConn([0, 0])
        run_refresh_worker.recover_stale_running_jobs(conn)
        requeue, terminate = (s for s, _ in conn._cursor.statements)

        # Requeue keeps the retry budget guard...
        self.assertIn("SET status = 'queued'", requeue)
        self.assertIn('attempts < %s', requeue)

        # ...and termination covers exactly the complement, so no stale job can
        # fall between the two and stay 'running'.
        self.assertIn("SET status = 'failed'", terminate)
        self.assertIn('attempts >= %s', terminate)

        for stmt in (requeue, terminate):
            self.assertIn("WHERE status = 'running'", stmt)
            self.assertIn('started_at < NOW()', stmt)

    def test_termination_records_a_reason(self):
        # The frozen rows carried last_error NULL, so nothing on the row said why
        # it had been running for two weeks.
        conn = FakeConn([0, 1])
        run_refresh_worker.recover_stale_running_jobs(conn)
        _, terminate = (s for s, _ in conn._cursor.statements)
        self.assertIn('exhausted attempts', terminate)
        self.assertIn('finished_at = NOW()', terminate)

    def test_both_branches_use_the_same_per_type_timeout(self):
        # An option_quote_snapshot legitimately runs ~16 minutes; terminating it
        # on the ordinary 15-minute timeout would kill healthy work.
        conn = FakeConn([0, 0])
        run_refresh_worker.recover_stale_running_jobs(conn)
        (_, requeue_params), (_, terminate_params) = conn._cursor.statements
        self.assertEqual(requeue_params, terminate_params)
        self.assertIn(run_refresh_worker.SLOW_RUNNING_JOB_TIMEOUT_MINUTES, terminate_params)
        self.assertIn(run_refresh_worker.RUNNING_JOB_TIMEOUT_MINUTES, terminate_params)


if __name__ == '__main__':
    unittest.main()
