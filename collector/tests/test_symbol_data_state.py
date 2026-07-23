import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import symbol_data_state


class RecordStateTest(unittest.TestCase):
    def test_success_records_snapshot_facts(self):
        conn = _FakeConn()
        symbol_data_state.record_success(
            conn,
            'aapl',
            symbol_data_state.PRODUCT_OPTION_CHAIN,
            snapshot_ts=datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc),
            source='polygon_licensed',
            job_id=9,
        )

        params = conn.executed[0][1]
        # Symbol is canonicalized so a lowercase job cannot create a second row.
        self.assertEqual(params[0], 'AAPL')
        self.assertEqual(params[1], 'option_chain')
        self.assertEqual(params[5], symbol_data_state.STATUS_OK)
        self.assertEqual(params[6], 9)
        self.assertIsNone(params[7])

    def test_unknown_product_is_rejected(self):
        with self.assertRaises(ValueError):
            symbol_data_state.record_success(_FakeConn(), 'AAPL', 'not_a_product')

    def test_blank_symbol_is_rejected(self):
        with self.assertRaises(ValueError):
            symbol_data_state.record_success(_FakeConn(), '   ', symbol_data_state.PRODUCT_GEX)

    def test_failure_records_a_coarse_code_not_the_raw_message(self):
        conn = _FakeConn()
        symbol_data_state.record_failure(
            conn,
            'AAPL',
            symbol_data_state.PRODUCT_METRICS,
            'tastytrade auth failed: 403 device_challenge_required',
            job_id=3,
        )

        params = conn.executed[0][1]
        self.assertEqual(params[5], symbol_data_state.STATUS_FAILED)
        # The provider name and raw detail must not reach the state table.
        self.assertEqual(params[7], 'auth_unavailable')

    def test_failure_does_not_overwrite_the_last_real_snapshot(self):
        conn = _FakeConn()
        symbol_data_state.record_failure(
            conn, 'AAPL', symbol_data_state.PRODUCT_GEX, 'boom', job_id=1
        )

        sql, params = conn.executed[0]
        # A failed refresh passes NULL snapshot fields; COALESCE in the upsert
        # keeps previously persisted data displayable as stale.
        self.assertIsNone(params[2])
        self.assertIsNone(params[3])
        self.assertIn('COALESCE(EXCLUDED.latest_snapshot_ts', sql)
        self.assertIn('COALESCE(EXCLUDED.latest_market_date', sql)

    def test_error_classification_covers_known_provider_failures(self):
        cases = {
            'option quote unavailable: no usable bid/ask quotes': 'no_quotes',
            'unsupported option provider for worker: nope': 'unsupported_provider',
            'polygon not configured': 'provider_unavailable',
            'HTTP 429 too many requests': 'rate_limited',
            'something else entirely': 'error',
            # Observed in production on 2026-07-17 (GDXJ job 1122): the chain
            # landed but GEX could not be computed from it. Retrying the same
            # provider does not fix a quality gate, so it is not a provider fault.
            'underlying_price missing; cannot compute GEX': 'insufficient_data',
            'no contracts with gamma and open_interest; cannot compute GEX': 'insufficient_data',
            'chain completeness below GEX threshold: missing_greeks_ratio=0.44': 'insufficient_data',
        }
        for message, expected in cases.items():
            with self.subTest(message=message):
                self.assertEqual(symbol_data_state._classify_error(message), expected)

    def test_record_products_writes_each_product_in_one_transaction(self):
        conn = _FakeConn()
        symbol_data_state.record_products(
            conn,
            'AAPL',
            {
                symbol_data_state.PRODUCT_PRICE_DAILY: {
                    'market_date': date(2026, 7, 17),
                    'source': 'polygon_licensed',
                },
                symbol_data_state.PRODUCT_PRICE_30M: {
                    'market_date': date(2026, 7, 16),
                    'source': 'polygon_licensed',
                },
            },
            job_id=4,
        )

        self.assertEqual(len(conn.executed), 2)
        self.assertEqual(conn.commits, 1)
        # Each product keeps its own market date; the lagging intraday feed is
        # not relabeled with the daily date.
        dates = {params[1]: params[3] for _sql, params in conn.executed}
        self.assertEqual(dates['price_daily'], date(2026, 7, 17))
        self.assertEqual(dates['price_30m'], date(2026, 7, 16))


class WorkerStateMappingTest(unittest.TestCase):
    def test_option_chain_success_records_chain_and_gex(self):
        import run_refresh_worker

        facts = run_refresh_worker.job_product_facts(
            {'job_type': 'option_chain_snapshot', 'symbol': 'AAPL'},
            {'snapshot_ts': '2026-07-17T12:00:00+00:00', 'source': 'polygon_licensed', 'gex_id': 5},
        )

        self.assertEqual(facts['option_chain']['source'], 'polygon_licensed')
        self.assertEqual(facts['gex']['snapshot_ts'], '2026-07-17T12:00:00+00:00')

    def test_skipped_gex_is_recorded_as_a_failure_not_inherited_from_the_chain(self):
        import run_refresh_worker

        facts = run_refresh_worker.job_product_facts(
            {'job_type': 'option_chain_snapshot', 'symbol': 'AAPL'},
            {
                'snapshot_ts': '2026-07-17T12:00:00+00:00',
                'source': 'polygon_licensed',
                'gex_status': 'skipped',
                'gex_error': 'missing greeks ratio above threshold',
            },
        )

        # The chain landed, so it is fresh; GEX did not and must not claim to be.
        self.assertNotIn('error', facts['option_chain'])
        self.assertIn('error', facts['gex'])
        self.assertNotIn('snapshot_ts', facts['gex'])

    def test_price_job_records_daily_and_intraday_dates_independently(self):
        import run_refresh_worker

        facts = run_refresh_worker.job_product_facts(
            {'job_type': 'price_history_snapshot', 'symbol': 'AAPL'},
            {
                'source': 'polygon_licensed',
                'daily_market_date': date(2026, 7, 17),
                'intraday_market_date': date(2026, 7, 16),
                'intraday_snapshot_ts': datetime(2026, 7, 16, 20, 0, tzinfo=timezone.utc),
            },
        )

        self.assertEqual(facts['price_daily']['market_date'], date(2026, 7, 17))
        self.assertEqual(facts['price_30m']['market_date'], date(2026, 7, 16))

    def test_failed_job_marks_every_product_it_owed(self):
        import run_refresh_worker

        conn = _FakeConn()
        with patch.object(run_refresh_worker.symbol_data_state, 'record_products') as record:
            run_refresh_worker.record_job_state(
                conn,
                {'id': 1, 'symbol': 'AAPL', 'job_type': 'price_history_snapshot'},
                error='polygon not configured',
            )

        facts = record.call_args[0][2]
        self.assertEqual(set(facts), {'price_daily', 'price_30m'})
        self.assertEqual(facts['price_daily']['error'], 'polygon not configured')

    def test_scanner_materialize_job_records_no_symbol_state(self):
        import run_refresh_worker

        conn = _FakeConn()
        with patch.object(run_refresh_worker.symbol_data_state, 'record_products') as record:
            run_refresh_worker.record_job_state(
                conn,
                {'id': 1, 'symbol': '__SCAN__', 'job_type': 'scanner_materialize'},
                summary={'materialized': True},
            )

        # __SCAN__ is an internal job target, not a symbol with data products.
        self.assertEqual(record.call_count, 0)

    def test_state_write_failure_never_fails_the_job(self):
        import run_refresh_worker

        conn = _FakeConn()
        with patch.object(
            run_refresh_worker.symbol_data_state,
            'record_products',
            side_effect=RuntimeError('table missing'),
        ):
            # Must not raise: the snapshot tables are the source of truth and a
            # successful refresh cannot be undone by a summary-table failure.
            run_refresh_worker.record_job_state(
                conn,
                {'id': 1, 'symbol': 'AAPL', 'job_type': 'gex_recompute'},
                summary={'gex_id': 1},
            )

        self.assertEqual(conn.rollbacks, 1)


class _FakeCursor:
    def __init__(self, owner):
        self._owner = owner

    def execute(self, sql, params=None):
        self._owner.executed.append((sql, params))

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class _FakeConn:
    def __init__(self):
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return _FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


if __name__ == '__main__':
    unittest.main()
