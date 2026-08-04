import unittest
from unittest.mock import MagicMock, patch

import run_refresh_worker


class RefreshJobPriorityTests(unittest.TestCase):
    def test_worker_claims_higher_priority_jobs_first(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = []
        cursor.description = []

        run_refresh_worker.fetch_jobs(conn)

        sql = cursor.execute.call_args.args[0]
        self.assertIn("ORDER BY COALESCE((request_params->>'priority')::int, 0) DESC", sql)
        params = cursor.execute.call_args.args[1]
        self.assertEqual(params[1:3], ('primary', 'primary'))

    def test_quote_lane_claims_only_quote_jobs(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = []
        cursor.description = []

        run_refresh_worker.fetch_jobs(conn, queue_lane='quotes', batch_size=1)

        sql, params = cursor.execute.call_args.args
        self.assertIn("job_type = 'option_quote_snapshot'", sql)
        self.assertIn("job_type <> 'option_quote_snapshot'", sql)
        self.assertEqual(params[1:3], ('quotes', 'quotes'))
        self.assertEqual(params[-1], 1)

    def test_gex_recompute_uses_latest_persisted_chain_without_provider_call(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (101, 'RKLB', '2026-07-17T12:00:00+00:00', 'polygon_licensed')
        cursor.description = [('id',), ('symbol',), ('snapshot_ts',), ('source',)]
        metrics = {'snapshot_id': 101}
        with patch.object(run_refresh_worker.compute_gex, 'load_contracts', return_value=['contract']) as load_contracts, \
             patch.object(run_refresh_worker.compute_gex, 'compute_for_snapshot', return_value=metrics), \
             patch.object(run_refresh_worker.compute_gex, 'persist_gex', return_value=88), \
             patch.object(run_refresh_worker.materialize_scan, 'run'):
            summary = run_refresh_worker.run_gex_recompute(conn, {'symbol': 'RKLB'})

        load_contracts.assert_called_once_with(conn, 101)
        self.assertEqual(summary['snapshot_id'], 101)
        self.assertEqual(summary['gex_id'], 88)


class RetryBackoffTest(unittest.TestCase):
    """A re-queued job used to be instantly claimable, and the quote worker polls
    every 5s -- so all three attempts burned in ~10-15 seconds against a provider
    that was still down, on identical work that failed the same way each time.
    Transient faults (IB restart, Polygon blip) are exactly what retries are for,
    and were exactly what they could not survive."""

    def test_backoff_grows_so_retries_outlast_a_transient_outage(self):
        import run_refresh_worker as w
        first = w.retry_delay_seconds(1)
        second = w.retry_delay_seconds(2)
        third = w.retry_delay_seconds(3)
        self.assertEqual([first, second, third], [30.0, 120.0, 480.0])
        self.assertGreater(third, 300, 'the last retry must clear a multi-minute outage')

    def test_first_attempt_is_not_penalized(self):
        import run_refresh_worker as w
        self.assertEqual(w.retry_delay_seconds(0), w.retry_delay_seconds(1))

    def test_claim_query_skips_jobs_still_in_backoff(self):
        import inspect
        import run_refresh_worker as w
        sql = inspect.getsource(w.fetch_jobs)
        self.assertIn('next_attempt_at IS NULL OR next_attempt_at <= NOW()', sql)
