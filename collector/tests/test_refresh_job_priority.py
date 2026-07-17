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

    def test_gex_recompute_uses_latest_persisted_chain_without_provider_call(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (101, 'RKLB')
        cursor.description = [('id',), ('symbol',)]
        metrics = {'snapshot_id': 101}
        with patch.object(run_refresh_worker.compute_gex, 'load_contracts', return_value=['contract']) as load_contracts, \
             patch.object(run_refresh_worker.compute_gex, 'compute_for_snapshot', return_value=metrics), \
             patch.object(run_refresh_worker.compute_gex, 'persist_gex', return_value=88), \
             patch.object(run_refresh_worker.materialize_scan, 'run'):
            summary = run_refresh_worker.run_gex_recompute(conn, {'symbol': 'RKLB'})

        load_contracts.assert_called_once_with(conn, 101)
        self.assertEqual(summary['snapshot_id'], 101)
        self.assertEqual(summary['gex_id'], 88)
