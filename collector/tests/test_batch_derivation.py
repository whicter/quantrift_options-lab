import unittest
from unittest.mock import patch


class BatchDerivationTest(unittest.TestCase):
    """OI delta and scanner materialization read every symbol, so their cost is
    independent of which job requested them. A batch must run each exactly once
    no matter how many jobs invalidated them."""

    def test_many_option_jobs_materialize_globals_once_per_batch(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()

        with patch.object(run_refresh_worker, 'load_chain_snapshot_by_id', return_value={'id': 1}), \
             patch.object(run_refresh_worker.compute_gex, 'load_contracts', return_value=[]), \
             patch.object(run_refresh_worker.compute_gex, 'compute_for_snapshot', return_value={'confidence': 'high'}), \
             patch.object(run_refresh_worker.compute_gex, 'persist_gex', return_value=7), \
             patch.object(run_refresh_worker.materialize_oi_delta, 'run') as oi_run, \
             patch.object(run_refresh_worker.materialize_scan, 'run') as scan_run:

            # Ten option snapshots land in one batch.
            for _ in range(10):
                summary = run_refresh_worker.finalize_option_snapshot(None, 1, pending)
                self.assertTrue(summary['scanner_deferred'])
                self.assertTrue(summary['oi_delta_deferred'])

            # Per-symbol GEX ran each time; nothing global ran yet.
            self.assertEqual(oi_run.call_count, 0)
            self.assertEqual(scan_run.call_count, 0)

            result = run_refresh_worker.run_pending_derivations(_FakeConn(), pending)

            self.assertEqual(oi_run.call_count, 1)
            self.assertEqual(scan_run.call_count, 1)

        self.assertEqual(result['oi_delta'], 'materialized')
        self.assertEqual(result['scan'], 'materialized')

    def test_gex_recompute_defers_scanner_materialization(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()

        with patch.object(run_refresh_worker.compute_gex, 'load_contracts', return_value=[]), \
             patch.object(run_refresh_worker.compute_gex, 'compute_for_snapshot', return_value={'confidence': 'high'}), \
             patch.object(run_refresh_worker.compute_gex, 'persist_gex', return_value=5), \
             patch.object(run_refresh_worker.materialize_scan, 'run') as scan_run:

            summary = run_refresh_worker.run_gex_recompute(
                _FakeConn(
                    rows=[(1, '2026-07-17T12:00:00+00:00', 'polygon_licensed')],
                    columns=['id', 'snapshot_ts', 'source'],
                ),
                {'symbol': 'AAPL'},
                pending,
            )

            self.assertTrue(summary['scanner_deferred'])
            self.assertEqual(scan_run.call_count, 0)
            self.assertTrue(pending.scan)

    def test_batch_with_no_requests_runs_no_global_derivation(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()

        with patch.object(run_refresh_worker.materialize_oi_delta, 'run') as oi_run, \
             patch.object(run_refresh_worker.materialize_scan, 'run') as scan_run:
            result = run_refresh_worker.run_pending_derivations(_FakeConn(), pending)

        self.assertEqual(oi_run.call_count, 0)
        self.assertEqual(scan_run.call_count, 0)
        self.assertEqual(result['oi_delta'], 'skipped')
        self.assertEqual(result['scan'], 'skipped')

    def test_deferred_scanner_job_succeeds_only_after_the_batch_run(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()
        pending.request_scan(job_id=42)

        finished = []
        with patch.object(run_refresh_worker.materialize_scan, 'run'), \
             patch.object(run_refresh_worker, 'finish_job', side_effect=lambda conn, job_id, status, **kw: finished.append((job_id, status))):
            run_refresh_worker.run_pending_derivations(_FakeConn(), pending)

        self.assertEqual(finished, [(42, 'succeeded')])

    def test_failed_batch_materialization_fails_the_job_it_was_deferred_from(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()
        pending.request_scan(job_id=42)
        pending.request_oi_delta()

        finished = []
        with patch.object(run_refresh_worker.materialize_oi_delta, 'run', side_effect=RuntimeError('oi boom')), \
             patch.object(run_refresh_worker.materialize_scan, 'run', side_effect=RuntimeError('scan boom')), \
             patch.object(run_refresh_worker, 'finish_job', side_effect=lambda conn, job_id, status, **kw: finished.append((job_id, status, kw.get('error')))):
            result = run_refresh_worker.run_pending_derivations(_FakeConn(), pending)

        # A deferred derivation that fails must never report success.
        self.assertEqual(result['scan'], 'failed')
        self.assertEqual(result['oi_delta'], 'failed')
        self.assertEqual(finished[0][0], 42)
        self.assertEqual(finished[0][1], 'failed')
        self.assertIn('scan boom', finished[0][2])

    def test_oi_delta_failure_does_not_prevent_scanner_materialization(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()
        pending.request_oi_delta()
        pending.request_scan()

        with patch.object(run_refresh_worker.materialize_oi_delta, 'run', side_effect=RuntimeError('oi boom')), \
             patch.object(run_refresh_worker.materialize_scan, 'run') as scan_run:
            result = run_refresh_worker.run_pending_derivations(_FakeConn(), pending)

        self.assertEqual(result['oi_delta'], 'failed')
        self.assertEqual(result['scan'], 'materialized')
        self.assertEqual(scan_run.call_count, 1)

    def test_scanner_materialize_job_defers_instead_of_running_inline(self):
        import run_refresh_worker

        pending = run_refresh_worker.PendingDerivations()

        with patch.object(run_refresh_worker, 'run_scanner_materialize') as inline, \
             patch.object(run_refresh_worker, 'finish_job') as finish:
            run_refresh_worker.handle_job(
                _FakeConn(),
                {'id': 7, 'symbol': '__SCAN__', 'job_type': 'scanner_materialize', 'provider': None},
                set(),
                {},
                pending,
            )

        # Neither ran inline, and the job row stays open for the batch outcome.
        self.assertEqual(inline.call_count, 0)
        self.assertEqual(finish.call_count, 0)
        self.assertEqual(pending.scan_job_ids, [7])

    def test_finalize_without_a_batch_still_materializes_inline(self):
        import run_refresh_worker

        with patch.object(run_refresh_worker, 'load_chain_snapshot_by_id', return_value={'id': 1}), \
             patch.object(run_refresh_worker.compute_gex, 'load_contracts', return_value=[]), \
             patch.object(run_refresh_worker.compute_gex, 'compute_for_snapshot', return_value={'confidence': 'high'}), \
             patch.object(run_refresh_worker.compute_gex, 'persist_gex', return_value=7), \
             patch.object(run_refresh_worker.materialize_oi_delta, 'run') as oi_run, \
             patch.object(run_refresh_worker.materialize_scan, 'run') as scan_run:
            summary = run_refresh_worker.finalize_option_snapshot(None, 1)

        self.assertEqual(oi_run.call_count, 1)
        self.assertEqual(scan_run.call_count, 1)
        self.assertTrue(summary['scanner_materialized'])


class _FakeCursor:
    def __init__(self, rows, columns):
        self._rows = list(rows)
        self.description = [(name,) for name in columns] if columns else None

    def execute(self, *_args, **_kwargs):
        return None

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class _FakeConn:
    def __init__(self, rows=(), columns=()):
        self._rows = rows
        self._columns = columns

    def cursor(self):
        return _FakeCursor(self._rows, self._columns)

    def rollback(self):
        return None

    def commit(self):
        return None


if __name__ == '__main__':
    unittest.main()


class SpotHintWorkerTests(unittest.TestCase):
    """The Polygon option job should reuse a fresh persisted daily close as spot
    rather than always fetching /prev; tt/ib carry spot in their own payloads."""

    def test_latest_db_spot_returns_a_fresh_close(self):
        import run_refresh_worker
        conn = _FakeConn(rows=[(212.5,)], columns=['close'])
        self.assertEqual(run_refresh_worker.latest_db_spot(conn, 'AAPL'), 212.5)

    def test_latest_db_spot_returns_none_when_missing_or_stale(self):
        import run_refresh_worker
        # The SQL's date filter excludes stale rows, so a stale symbol simply
        # returns no row and the caller falls back to /prev.
        conn = _FakeConn(rows=[], columns=['close'])
        self.assertIsNone(run_refresh_worker.latest_db_spot(conn, 'AAPL'))

    def test_polygon_job_passes_the_spot_hint(self):
        import run_refresh_worker
        captured = {}

        class _Provider:
            source = 'polygon_licensed'
            def fetch_option_chain(self, symbol, spot_hint=None):
                captured['spot_hint'] = spot_hint
                return _FakeSnapshot()

        with patch.object(run_refresh_worker, 'latest_db_spot', return_value=205.0), \
             patch.object(run_refresh_worker.collect_options, 'persist_snapshot', return_value=1):
            run_refresh_worker.fetch_and_persist_option_snapshot(
                _FakeConn(), 'AAPL', 'polygon_licensed', {'polygon_licensed': _Provider()},
            )
        self.assertEqual(captured['spot_hint'], 205.0)

    def test_non_polygon_job_does_not_pass_a_spot_hint(self):
        import run_refresh_worker
        captured = {}

        class _Provider:
            source = 'tt_internal'
            def fetch_option_chain(self, symbol):
                captured['called'] = True
                return _FakeSnapshot()

        with patch.object(run_refresh_worker, 'latest_db_spot') as db_spot, \
             patch.object(run_refresh_worker.collect_options, 'persist_snapshot', return_value=1):
            run_refresh_worker.fetch_and_persist_option_snapshot(
                _FakeConn(), 'AAPL', 'tt_internal', {'tt_internal': _Provider()},
            )
        # tt provider carries its own spot; no DB lookup, no extra kwarg.
        self.assertTrue(captured['called'])
        self.assertEqual(db_spot.call_count, 0)


class _FakeSnapshot:
    contracts = []
    provider_status = 'ok'
