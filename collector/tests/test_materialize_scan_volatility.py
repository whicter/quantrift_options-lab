import json
import unittest
from decimal import Decimal

import materialize_scan


class FakeCursor:
    description = []

    def __init__(self):
        self.sql = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, sql, params=None):
        self.sql = sql
        self.params = params

    def fetchall(self):
        return []


class FakeConnection:
    def __init__(self):
        self.last_cursor = None

    def cursor(self):
        self.last_cursor = FakeCursor()
        return self.last_cursor


class MaterializeScanVolatilityTests(unittest.TestCase):
    def test_feature_flag_is_single_settings_parameter_and_stale_threshold_is_last(self):
        conn = FakeConnection()

        self.assertEqual(materialize_scan.fetch_rows(conn, ['AAPL']), [])

        cursor = conn.last_cursor
        self.assertEqual(cursor.sql.count('%s'), len(cursor.params))
        self.assertIn('SELECT %s::boolean AS use_derived', cursor.sql)
        self.assertEqual(cursor.params[1], materialize_scan.USE_DERIVED_VOLATILITY)
        self.assertEqual(cursor.params[-1], materialize_scan.OPTIONS_STALE_MINUTES)
        self.assertEqual(sum(isinstance(value, bool) for value in cursor.params), 1)

    def test_materialized_rows_include_universe_and_underlying_liquidity_fields(self):
        conn = FakeConnection()
        materialize_scan.fetch_rows(conn, ['AAPL'])
        sql = conn.last_cursor.sql
        self.assertIn('underlying_volume', sql)
        self.assertIn('underlying_dollar_volume', sql)

    def test_load_symbols_prefers_persisted_active_scan_universe(self):
        class UniverseCursor(FakeCursor):
            def fetchall(self):
                return [('AAPL',), ('PLTR',)]

        class UniverseConnection(FakeConnection):
            def cursor(self):
                self.last_cursor = UniverseCursor()
                return self.last_cursor

        self.assertEqual(materialize_scan.load_symbols(UniverseConnection()), ['AAPL', 'PLTR'])

    def test_scan_payload_serializes_decimal_gex_metadata(self):
        payload = materialize_scan.json_payload({'global_gex': Decimal('217181490258.5')})

        self.assertEqual(
            json.loads(payload.dumps(payload.adapted)),
            {'global_gex': 217181490258.5},
        )


if __name__ == '__main__':
    unittest.main()
