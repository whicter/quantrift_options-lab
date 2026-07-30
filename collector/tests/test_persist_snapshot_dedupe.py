import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import collect_options


def contract(expiry, strike, right, **overrides):
    base = dict(
        symbol='GME', expiry=expiry, strike=strike, right=right,
        bid=1.0, ask=1.2, last=1.1, mark=1.1, volume=10, open_interest=100,
        iv=0.5, delta=0.5, gamma=0.01, theta=-0.02, vega=0.1, rho=0.01,
        bid_size=5, ask_size=5, contract_symbol='X', local_symbol='X',
        con_id=1, provider_contract_id='X', raw={},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def snapshot(contracts):
    return SimpleNamespace(
        symbol='GME', contracts=contracts,
        underlying=SimpleNamespace(price=20.0, bid=19.9, ask=20.1),
        snapshot_ts=datetime.now(timezone.utc), source='polygon_licensed',
        provider_status='ok', provider_snapshot_id='s1', raw_metadata={},
        term_structure=None, oi_by_strike=None,
    )


class FakeCursor:
    def __init__(self, store):
        self.store = store

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, sql, params=None):
        self.store['chain_sql'] = sql

    def fetchone(self):
        return (19393,)


class FakeConnection:
    def __init__(self):
        self.store = {}
        self.committed = False

    def cursor(self):
        return FakeCursor(self.store)

    def commit(self):
        self.committed = True


class PersistSnapshotDedupeTest(unittest.TestCase):
    """A provider that repeats a contract inside one chain must not cost the
    whole symbol its snapshot. Before this, the single execute_values call hit
    option_contract_snapshots_snapshot_id_expiry_strike_option__key and aborted
    the entire write (observed live 2026-07-30 on GME)."""

    def _persist(self, contracts):
        captured = {}

        def fake_execute_values(cur, sql, values, **kwargs):
            captured['sql'] = sql
            captured['values'] = values

        conn = FakeConnection()
        original = collect_options.execute_values
        collect_options.execute_values = fake_execute_values
        try:
            collect_options.persist_snapshot(conn, snapshot(contracts))
        finally:
            collect_options.execute_values = original
        return captured

    def test_duplicate_contract_is_dropped_and_the_rest_still_persist(self):
        rows = [
            contract(date(2026, 10, 16), 20.0, 'C'),
            contract(date(2026, 10, 16), 20.0, 'C'),  # exact provider duplicate
            contract(date(2026, 10, 16), 21.0, 'C'),
            contract(date(2026, 10, 16), 20.0, 'P'),  # same strike, other right
        ]
        captured = self._persist(rows)
        # 4 in, 1 dropped -> the other three (including the same-strike put) survive.
        self.assertEqual(len(captured['values']), 3)
        keys = {(v[2], v[3], v[4]) for v in captured['values']}
        self.assertEqual(keys, {
            (date(2026, 10, 16), 20.0, 'C'),
            (date(2026, 10, 16), 21.0, 'C'),
            (date(2026, 10, 16), 20.0, 'P'),
        })

    def test_a_clean_chain_is_passed_through_untouched(self):
        rows = [
            contract(date(2026, 10, 16), 20.0, 'C'),
            contract(date(2026, 10, 16), 21.0, 'C'),
        ]
        captured = self._persist(rows)
        self.assertEqual(len(captured['values']), 2)

    def test_same_strike_across_different_expiries_is_not_a_duplicate(self):
        rows = [
            contract(date(2026, 10, 16), 20.0, 'C'),
            contract(date(2026, 11, 20), 20.0, 'C'),
        ]
        captured = self._persist(rows)
        self.assertEqual(len(captured['values']), 2)


if __name__ == '__main__':
    unittest.main()
