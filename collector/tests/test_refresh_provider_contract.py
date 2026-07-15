import unittest
from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch


WORKER_SOURCE = Path(__file__).resolve().parents[1] / 'run_refresh_worker.py'
SERVER_REFRESH_SOURCE = Path(__file__).resolve().parents[2] / 'server' / 'src' / 'lib' / 'refreshJobs.js'


class RefreshProviderContractTest(unittest.TestCase):
    def test_api_default_provider_is_supported_by_worker(self):
        worker_source = WORKER_SOURCE.read_text()
        server_source = SERVER_REFRESH_SOURCE.read_text()
        self.assertIn("process.env.OPTIONS_REFRESH_PROVIDER || 'tt_internal'", server_source)
        self.assertIn("SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal'}", worker_source)

    def test_placeholder_provider_is_not_supported_by_worker(self):
        source = WORKER_SOURCE.read_text()
        supported_line = next(
            line for line in source.splitlines()
            if line.startswith('SUPPORTED_OPTION_PROVIDERS')
        )
        self.assertNotIn('licensed_options_provider', supported_line)

    def test_unsupported_option_provider_is_non_retryable(self):
        import run_refresh_worker

        self.assertFalse(run_refresh_worker.should_retry(
            RuntimeError('unsupported option provider for worker: licensed_options_provider')
        ))
        self.assertTrue(run_refresh_worker.should_retry(
            RuntimeError('temporary provider timeout')
        ))

    def test_worker_recovers_stale_running_jobs(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('recover_stale_running_jobs', source)
        self.assertIn("status = 'queued'", source)
        self.assertIn('REFRESH_WORKER_RUNNING_TIMEOUT_MINUTES', source)

    def test_metrics_auth_system_exit_is_catchable(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('except SystemExit as exc', source)
        self.assertIn('tastytrade metrics auth unavailable', source)

    def test_auth_failures_are_non_retryable_and_block_provider_for_run(self):
        import run_refresh_worker

        self.assertFalse(run_refresh_worker.should_retry(
            RuntimeError('tastytrade auth unavailable: session renewal requires manual login')
        ))
        self.assertEqual(
            run_refresh_worker.auth_provider_for_job({
                'job_type': 'option_chain_snapshot',
                'provider': 'tt_internal',
            }),
            'tastytrade',
        )
        self.assertTrue(run_refresh_worker.is_auth_unavailable(
            RuntimeError('tastytrade metrics auth unavailable: session renewal requires manual login')
        ))

    def test_option_chain_job_falls_back_from_tt_to_ib(self):
        import run_refresh_worker

        class FakeConn:
            def rollback(self):
                pass

        def fake_fetch(_conn, _symbol, provider):
            if provider == 'tt_internal':
                raise RuntimeError('tastytrade auth unavailable: session renewal requires manual login')
            return 123, SimpleNamespace(
                contracts=[],
                provider_status='ok',
                snapshot_ts=datetime(2026, 7, 15, tzinfo=timezone.utc),
            )

        auth_blocked = set()
        with patch.dict('os.environ', {'OPTION_FALLBACK_PROVIDERS': 'ib_internal'}, clear=False), \
             patch.object(run_refresh_worker, 'reserve_budget'), \
             patch.object(run_refresh_worker, 'fetch_and_persist_option_snapshot', side_effect=fake_fetch), \
             patch.object(run_refresh_worker, 'finalize_option_snapshot', return_value={'scanner_materialized': True}):
            summary = run_refresh_worker.run_option_chain_snapshot(
                FakeConn(),
                {'id': 99, 'symbol': 'STX', 'job_type': 'option_chain_snapshot', 'provider': 'tt_internal'},
                auth_blocked,
            )

        self.assertEqual(summary['provider'], 'ib_internal')
        self.assertEqual(summary['fallback_from'], 'tt_internal')
        self.assertEqual(summary['attempted_providers'], ['tt_internal', 'ib_internal'])
        self.assertIn('tastytrade', auth_blocked)


if __name__ == '__main__':
    unittest.main()
