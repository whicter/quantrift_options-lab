import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from providers.option_contract_registry import OptionContractRegistry


class FakeCursor:
    def __init__(self, rows, log):
        self._rows = rows
        self._log = log

    def execute(self, sql, params=None):
        self._log.append((' '.join(sql.split()), params))

    def fetchall(self):
        return self._rows

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConn:
    def __init__(self, rows=(), log=None, raise_on=None):
        self.rows = list(rows)
        self.log = log if log is not None else []
        self.closed = False
        self._raise_on = raise_on

    def cursor(self):
        if self._raise_on == 'cursor':
            raise RuntimeError('database is down')
        return FakeCursor(self.rows, self.log)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def close(self):
        self.closed = True


def ladder_rows(strikes, right='C', expiry=date(2026, 9, 18)):
    """(con_id, strike, trading_class, exchange, multiplier, currency)."""
    return [(9000 + i, float(s), 'AAPL', 'SMART', '100', 'USD') for i, s in enumerate(strikes)]


def registry(rows=(), **kwargs):
    conn = FakeConn(rows)
    reg = OptionContractRegistry(connect=lambda: conn, **kwargs)
    return reg, conn


class LadderSufficiencyTests(unittest.TestCase):
    """When the cache may stand in for a round trip, and when it may not."""

    def test_a_ladder_spanning_the_whole_window_is_a_hit(self):
        # Window is 100 +- 15%; the ladder runs past both edges, so no strike we
        # would ever consider is missing from it.
        strikes = [float(s) for s in range(80, 121, 5)]
        reg, _ = registry(ladder_rows(strikes))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', spot=100.0, window_pct=15, max_per_side=20)
        self.assertIsNotNone(rows)
        self.assertEqual(len(rows), len(strikes))
        self.assertEqual(reg.hits, 1)

    def test_a_short_ladder_that_still_fills_both_sides_is_a_hit(self):
        """Covering the window is sufficient, not necessary.

        A dense ladder can stop well inside +-15% and still supply the full
        max_per_side complement. A strike listed beyond its edge since the fetch
        would have been ranked out by _select_strikes anyway, so going back to IB
        could not change the selection.
        """
        strikes = [100.0 + 0.5 * i for i in range(-6, 7)]  # 97..103, inside +-15%
        reg, _ = registry(ladder_rows(strikes))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', spot=100.0, window_pct=15, max_per_side=5)
        self.assertIsNotNone(rows)
        self.assertEqual(reg.hits, 1)

    def test_a_ladder_that_runs_out_on_one_side_is_a_miss(self):
        """The failure this guard exists for.

        Spot has moved up to the top of what IB had listed when we cached. New
        strikes above it are exactly what would be listed next, and quoting the
        stale ladder would silently narrow the chain on the side that moved.
        """
        strikes = [float(s) for s in range(90, 102, 1)]  # tops out at 101
        reg, _ = registry(ladder_rows(strikes))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', spot=100.0, window_pct=15, max_per_side=20)
        self.assertIsNone(rows)
        self.assertEqual(reg.misses, 1)
        self.assertEqual(reg.stale_reasons, ['ladder_short_of_window'])

    def test_no_rows_for_today_is_a_miss(self):
        reg, _ = registry([])
        self.assertIsNone(
            reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 20)
        )
        self.assertEqual(reg.stale_reasons, ['no_rows'])

    def test_the_read_takes_the_newest_ladder_inside_the_age_backstop(self):
        """Not "today", which made the cache structurally unable to hit.

        Measured 2026-08-31: all 141 quoted symbols were visited exactly once
        each, so a read scoped to today always preceded that symbol's only write
        of the day -- 724 lookups, 1 hit, every miss `no_rows`, while the table
        filled correctly with 45,721 rows.
        """
        reg, conn = registry(ladder_rows([90.0, 100.0, 110.0]))
        reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 1, as_of=date(2026, 8, 31))
        sql, params = conn.log[0]
        self.assertIn('refreshed_on >= %s', sql)
        self.assertIn('MAX(refreshed_on)', sql)
        self.assertEqual(params[3], date(2026, 8, 31) - timedelta(days=reg.max_age_days))


class StrikeSetTests(unittest.TestCase):
    """The check that lets a ladder outlive the day it was fetched."""

    def test_a_ladder_ib_no_longer_lists_is_rejected(self):
        """The drift the geometry rule cannot see.

        A split does not add strikes at the edge -- it replaces the ladder, and
        the old conIds stay resolvable as adjusted contracts with a non-standard
        deliverable. Quoting those returns plausible numbers for the wrong
        instrument, which is worse than returning nothing.
        """
        reg, _ = registry(ladder_rows([90.0, 100.0, 110.0]))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 1,
                          valid_strikes={30.0, 33.33, 36.67})
        self.assertIsNone(rows)
        self.assertEqual(reg.stale_reasons, ['strike_set_changed'])

    def test_a_ladder_ib_still_lists_survives(self):
        reg, _ = registry(ladder_rows([90.0, 100.0, 110.0]))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 1,
                          valid_strikes={90.0, 100.0, 110.0, 120.0})
        self.assertIsNotNone(rows)
        self.assertEqual(reg.hits, 1)

    def test_float_rounding_through_numeric_does_not_read_as_a_changed_set(self):
        """NUMERIC(18,4) and IB's wire float do not round-trip exactly.

        An exact set-membership test would call every ladder stale and turn the
        cache off without saying so.
        """
        strikes = [float(s) for s in range(160, 221, 5)]   # spans 188 +- 15%
        reg, _ = registry(ladder_rows(strikes))
        rows = reg.lookup('AAPL', date(2026, 9, 18), 'C', 188.0, 15, 1,
                          valid_strikes={s + 1e-8 for s in strikes})
        self.assertIsNotNone(rows)
        self.assertEqual(reg.hits, 1)

    def test_no_live_strike_set_skips_the_check_rather_than_failing_closed(self):
        """A caller that cannot supply one must not silently get a stricter cache."""
        reg, _ = registry(ladder_rows([90.0, 100.0, 110.0]))
        self.assertIsNotNone(
            reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 1, valid_strikes=None)
        )


class DegradationTests(unittest.TestCase):
    """A latency cache must never become an outage."""

    def test_a_database_failure_reads_as_a_miss_rather_than_raising(self):
        conn = FakeConn(raise_on='cursor')
        reg = OptionContractRegistry(connect=lambda: conn)
        self.assertIsNone(reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 20))
        self.assertEqual(reg.misses, 1)

    def test_no_database_url_reads_as_a_miss(self):
        reg = OptionContractRegistry(connect=lambda: None)
        self.assertIsNone(reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 20))

    def test_the_connection_is_closed_even_when_the_query_fails(self):
        conn = FakeConn(raise_on='cursor')
        OptionContractRegistry(connect=lambda: conn).lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 20)
        self.assertTrue(conn.closed)

    def test_disabled_never_touches_the_database(self):
        calls = []

        def connect():
            calls.append(1)
            return FakeConn()

        reg = OptionContractRegistry(connect=connect, enabled=False)
        self.assertIsNone(reg.lookup('AAPL', date(2026, 9, 18), 'C', 100.0, 15, 20))
        reg.store('AAPL', date(2026, 9, 18), 'C', [object()])
        self.assertEqual(calls, [])

    def test_the_env_kill_switch_is_honoured(self):
        with patch.dict(os.environ, {'IB_OPTION_CONTRACT_CACHE_ENABLED': 'false'}, clear=False):
            self.assertFalse(OptionContractRegistry(connect=lambda: None).enabled)
        with patch.dict(os.environ, {'IB_OPTION_CONTRACT_CACHE_ENABLED': 'true'}, clear=False):
            self.assertTrue(OptionContractRegistry(connect=lambda: None).enabled)


class FakeIbContract:
    def __init__(self, con_id, strike, right='C'):
        self.conId = con_id
        self.strike = strike
        self.right = right
        self.tradingClass = 'AAPL'
        self.exchange = 'SMART'
        self.multiplier = '100'
        self.currency = 'USD'


class StoreTests(unittest.TestCase):
    def test_the_whole_ladder_is_stored_including_strikes_that_were_not_quoted(self):
        """Storing only the quoted window would defeat the cache.

        The next read would see a ladder that stops at the window edge, decide it
        is short, and go back to IB -- paying the round trip this exists to
        remove, every time, forever.
        """
        captured = {}

        def fake_execute_values(cur, sql, payload, page_size=None):
            captured['payload'] = payload
            captured['sql'] = ' '.join(sql.split())

        conn = FakeConn()
        reg = OptionContractRegistry(connect=lambda: conn)
        contracts = [FakeIbContract(100 + i, 80.0 + i) for i in range(40)]
        with patch('psycopg2.extras.execute_values', fake_execute_values):
            reg.store('AAPL', date(2026, 9, 18), 'C', contracts, as_of=date(2026, 8, 28))

        self.assertEqual(len(captured['payload']), 40)
        self.assertIn('ON CONFLICT', captured['sql'])
        first = captured['payload'][0]
        self.assertEqual(first[0], 'AAPL')
        self.assertEqual(first[2], 'C')
        self.assertEqual(first[4], 100)
        self.assertEqual(first[-1], date(2026, 8, 28))

    def test_contracts_without_a_con_id_are_dropped_not_stored_as_zero(self):
        """A conId of 0 is IB saying it does not know the contract.

        Storing it would put a row in the cache that quotes nothing and, worse,
        would count toward the ladder that decides a hit.
        """
        captured = {}

        def fake_execute_values(cur, sql, payload, page_size=None):
            captured['payload'] = payload

        good = FakeIbContract(101, 100.0)
        bad = FakeIbContract(0, 105.0)
        conn = FakeConn()
        with patch('psycopg2.extras.execute_values', fake_execute_values):
            OptionContractRegistry(connect=lambda: conn).store(
                'AAPL', date(2026, 9, 18), 'C', [good, bad],
            )
        self.assertEqual(len(captured['payload']), 1)
        self.assertEqual(captured['payload'][0][4], 101)

    def test_an_empty_ladder_writes_nothing(self):
        calls = []
        OptionContractRegistry(connect=lambda: calls.append(1)).store(
            'AAPL', date(2026, 9, 18), 'C', [],
        )
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
