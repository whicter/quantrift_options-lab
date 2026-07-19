import unittest
from decimal import Decimal
from pathlib import Path
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch


WORKER_SOURCE = Path(__file__).resolve().parents[1] / 'run_refresh_worker.py'
SERVER_REFRESH_SOURCE = Path(__file__).resolve().parents[2] / 'server' / 'src' / 'lib' / 'refreshJobs.js'


class RefreshProviderContractTest(unittest.TestCase):
    def test_option_snapshot_json_payload_serializes_provider_decimal_metadata(self):
        import collect_options

        payload = collect_options.json_payload({'quote': {'bid': Decimal('1.25')}})
        self.assertEqual(payload.dumps(payload.adapted), '{"quote": {"bid": 1.25}}')

    def test_api_default_provider_is_supported_by_worker(self):
        worker_source = WORKER_SOURCE.read_text()
        server_source = SERVER_REFRESH_SOURCE.read_text()
        self.assertIn("process.env.OPTIONS_REFRESH_PROVIDER || 'polygon_licensed'", server_source)
        self.assertIn("'polygon_licensed'", worker_source)
        self.assertIn("'polygon_licensed'", server_source)

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

    def test_unquoted_option_snapshot_is_non_retryable(self):
        import run_refresh_worker

        self.assertFalse(run_refresh_worker.should_retry(
            RuntimeError('option quote unavailable: polygon_licensed returned no usable bid/ask quotes')
        ))

    def test_default_quote_fallback_is_ib(self):
        import run_refresh_worker

        self.assertEqual(run_refresh_worker.DEFAULT_OPTION_FALLBACK_PROVIDERS, 'ib_internal')

    def test_exhausted_budget_is_non_retryable(self):
        import run_refresh_worker

        # A spent daily budget will not replenish until the next budget day, so
        # retrying the job only multiplies failures against the wall.
        self.assertFalse(run_refresh_worker.should_retry(
            RuntimeError('provider budget exhausted: provider=polygon_licensed, job_type=option_chain_snapshot, budget=50000')
        ))

    def test_worker_recovers_stale_running_jobs(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('recover_stale_running_jobs', source)
        self.assertIn("status = 'queued'", source)
        self.assertIn('REFRESH_WORKER_RUNNING_TIMEOUT_MINUTES', source)

    def test_worker_deduplicates_queued_jobs_before_claiming_work(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('deduplicate_queued_jobs(conn)', source)
        self.assertIn('superseded by newer queued refresh job', source)
        self.assertIn('PARTITION BY symbol, job_type, provider', source)

    def test_worker_supports_explicit_tt_circuit_breaker(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('TT_CIRCUIT_OPEN', source)
        self.assertIn("{'tastytrade'} if TT_CIRCUIT_OPEN else set()", source)

    def test_worker_fails_exhausted_and_malformed_queued_jobs(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('fail_unrunnable_queued_jobs(conn)', source)
        self.assertIn('maximum worker attempts exhausted', source)
        self.assertIn('invalid queued refresh symbol', source)

    def test_metrics_auth_system_exit_is_catchable(self):
        source = WORKER_SOURCE.read_text()
        self.assertIn('except SystemExit as exc', source)
        self.assertIn('tastytrade metrics auth unavailable', source)

    def test_ready_derived_rank_skips_tastytrade_metrics_request(self):
        import run_refresh_worker

        class Cursor:
            def execute(self, *_args):
                pass

            def fetchone(self):
                return (True,)

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                pass

        cursor = Cursor()
        conn = SimpleNamespace(cursor=lambda: cursor)
        with patch.object(run_refresh_worker.collect, 'get_session_token') as get_token, \
             patch.object(run_refresh_worker, 'reserve_budget') as reserve:
            summary = run_refresh_worker.run_symbol_metrics_snapshot(
                conn, {'symbol': 'AAPL', 'provider': 'tastytrade'},
            )

        self.assertEqual(summary['status'], 'already_ready')
        self.assertEqual(summary['source'], 'derived')
        get_token.assert_not_called()
        reserve.assert_not_called()

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

        def fake_fetch(_conn, _symbol, provider, _provider_cache=None):
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

    def test_option_chain_job_falls_back_on_tt_network_timeout(self):
        import run_refresh_worker

        class FakeConn:
            def rollback(self):
                pass

        calls = []

        def fake_fetch(_conn, _symbol, provider, _provider_cache=None):
            calls.append(provider)
            if provider == 'tt_internal':
                raise RuntimeError('tastytrade network unavailable: ConnectTimeout')
            return 124, SimpleNamespace(
                contracts=[],
                provider_status='partial',
                snapshot_ts=datetime(2026, 7, 15, tzinfo=timezone.utc),
            )

        blocked = set()
        with patch.dict('os.environ', {'OPTION_FALLBACK_PROVIDERS': 'ib_internal'}, clear=False), \
             patch.object(run_refresh_worker, 'reserve_budget'), \
             patch.object(run_refresh_worker, 'fetch_and_persist_option_snapshot', side_effect=fake_fetch), \
             patch.object(run_refresh_worker, 'finalize_option_snapshot', return_value={}):
            summary = run_refresh_worker.run_option_chain_snapshot(
                FakeConn(),
                {'id': 100, 'symbol': 'TSLA', 'job_type': 'option_chain_snapshot', 'provider': 'tt_internal'},
                blocked,
            )

        self.assertEqual(calls, ['tt_internal', 'ib_internal'])
        self.assertEqual(summary['provider'], 'ib_internal')
        self.assertIn('tastytrade', blocked)
        self.assertTrue(run_refresh_worker.is_provider_unavailable(
            RuntimeError('tastytrade network unavailable: ConnectTimeout')
        ))

    def test_quote_required_job_falls_back_when_primary_has_no_bid_ask(self):
        import run_refresh_worker

        class FakeConn:
            def rollback(self):
                pass

        calls = []

        def fake_fetch(_conn, _symbol, provider, _provider_cache=None):
            calls.append(provider)
            contracts = [] if provider == 'polygon_licensed' else [
                SimpleNamespace(bid=1.0, ask=1.2),
            ]
            return 200 + len(calls), SimpleNamespace(
                contracts=contracts,
                provider_status='ok',
                snapshot_ts=datetime(2026, 7, 15, tzinfo=timezone.utc),
            )

        with patch.dict('os.environ', {'OPTION_FALLBACK_PROVIDERS': 'tt_internal'}, clear=False), \
             patch.object(run_refresh_worker, 'reserve_budget'), \
             patch.object(run_refresh_worker, 'fetch_and_persist_option_snapshot', side_effect=fake_fetch), \
             patch.object(run_refresh_worker, 'finalize_option_snapshot', return_value={}):
            summary = run_refresh_worker.run_option_chain_snapshot(
                FakeConn(),
                {
                    'id': 101,
                    'symbol': 'RKLB',
                    'job_type': 'option_chain_snapshot',
                    'provider': 'polygon_licensed',
                    'request_params': {'require_quotes': True},
                },
            )

        self.assertEqual(calls, ['polygon_licensed', 'tt_internal'])
        self.assertEqual(summary['provider'], 'tt_internal')
        self.assertEqual(summary['fallback_from'], 'polygon_licensed')

    def test_quote_required_job_falls_back_when_polygon_is_not_configured(self):
        import run_refresh_worker

        class FakeConn:
            def rollback(self):
                pass

        calls = []

        def fake_fetch(_conn, _symbol, provider, _provider_cache=None):
            calls.append(provider)
            if provider == 'polygon_licensed':
                raise RuntimeError('POLYGON_API_KEY is required for PolygonOptionChainProvider')
            return 202, SimpleNamespace(
                contracts=[SimpleNamespace(bid=1.0, ask=1.2)],
                provider_status='ok',
                snapshot_ts=datetime(2026, 7, 15, tzinfo=timezone.utc),
            )

        with patch.dict('os.environ', {'OPTION_FALLBACK_PROVIDERS': 'tt_internal'}, clear=False), \
             patch.object(run_refresh_worker, 'reserve_budget'), \
             patch.object(run_refresh_worker, 'fetch_and_persist_option_snapshot', side_effect=fake_fetch), \
             patch.object(run_refresh_worker, 'finalize_option_snapshot', return_value={}):
            summary = run_refresh_worker.run_option_chain_snapshot(
                FakeConn(),
                {
                    'id': 102,
                    'symbol': 'RKLB',
                    'job_type': 'option_chain_snapshot',
                    'provider': 'polygon_licensed',
                    'request_params': {'require_quotes': True},
                },
            )

        self.assertEqual(calls, ['polygon_licensed', 'tt_internal'])
        self.assertEqual(summary['provider'], 'tt_internal')
        self.assertTrue(run_refresh_worker.is_provider_unavailable(
            RuntimeError('POLYGON_API_KEY is required for PolygonOptionChainProvider')
        ))

    def test_worker_reuses_one_provider_instance_for_all_jobs(self):
        import run_refresh_worker

        class FakeProvider:
            def fetch_option_chain(self, symbol):
                return SimpleNamespace(symbol=symbol)

        class FakeConn:
            pass

        provider = FakeProvider()
        cache = {}
        with patch.object(run_refresh_worker.collect_options, 'make_provider', return_value=provider) as make_provider, \
             patch.object(run_refresh_worker.collect_options, 'persist_snapshot', side_effect=[201, 202]):
            first_id, _ = run_refresh_worker.fetch_and_persist_option_snapshot(
                FakeConn(), 'STX', 'tt_internal', cache,
            )
            second_id, _ = run_refresh_worker.fetch_and_persist_option_snapshot(
                FakeConn(), 'TSLA', 'tt_internal', cache,
            )

        self.assertEqual((first_id, second_id), (201, 202))
        self.assertIs(cache['tt_internal'], provider)
        make_provider.assert_called_once()

    def test_price_history_job_reuses_provider_and_persists_both_timeframes(self):
        import run_refresh_worker

        provider = SimpleNamespace(source='polygon_licensed')
        conn = SimpleNamespace(commit=lambda: None)
        cache = {}
        daily_bars = [
            SimpleNamespace(date=date(2026, 7, 16)),
            SimpleNamespace(date=date(2026, 7, 17)),
        ]
        intraday_bars = [SimpleNamespace(bar_ts=datetime(2026, 7, 17, 19, 30, tzinfo=timezone.utc))]
        with patch.object(run_refresh_worker.collect_prices, 'make_provider', return_value=provider) as make_provider, \
             patch.object(run_refresh_worker.collect_prices, 'fetch_price_rows', return_value=(daily_bars, intraday_bars)), \
             patch.object(run_refresh_worker.collect_prices, 'upsert_price_rows', return_value=2), \
             patch.object(run_refresh_worker.collect_prices, 'upsert_30m_rows', return_value=1), \
             patch.object(run_refresh_worker, 'reserve_budget'), \
             patch.object(run_refresh_worker.derive_volatility, 'run', return_value={'hv_rows': 1}):
            summary = run_refresh_worker.run_price_history_snapshot(
                conn, {'symbol': 'AAPL', 'job_type': 'price_history_snapshot'}, cache,
            )
            run_refresh_worker.run_price_history_snapshot(
                conn, {'symbol': 'PLTR', 'job_type': 'price_history_snapshot'}, cache,
            )
        self.assertEqual(summary['daily_written'], 2)
        self.assertEqual(summary['intraday_written'], 1)
        self.assertIs(cache['price:polygon'], provider)
        make_provider.assert_called_once()


if __name__ == '__main__':
    unittest.main()
