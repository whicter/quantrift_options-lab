"""Settlement-date marks for multi-expiry ledger rows.

These are one-shot observations. A far leg can only be priced on the day the
near leg expires -- the chain snapshot is pruned at 7 days and any later quote
is a different day's price, so a miss is permanent rather than deferred. The
assertions here pin the two rules that decide whether a captured mark is honest:
it must come from a two-sided market, and a leg we failed to price must stay
visibly unpriced rather than become a zero.
"""
import unittest
from datetime import date
from unittest import mock

import capture_ledger_far_leg_marks as capture


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.conn.executed.append((sql, params))
        self.conn.last_sql = sql

    def fetchall(self):
        return self.conn.far_legs

    def fetchone(self):
        return self.conn.quote_row

    @property
    def rowcount(self):
        return len(self.conn.written)


class FakeConn:
    def __init__(self, far_legs=(), quote_row=None):
        self.far_legs = list(far_legs)
        self.quote_row = quote_row
        self.executed = []
        self.written = []
        self.last_sql = ''

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def close(self):
        pass


class LoadFarLegsTest(unittest.TestCase):
    def test_only_legs_outliving_the_settlement_date_are_requested(self):
        conn = FakeConn(far_legs=[('XLE', date(2026, 10, 16), 58, 'C')])
        legs = capture.load_far_legs(conn, date(2026, 9, 11))
        self.assertEqual(legs, [{
            'symbol': 'XLE', 'expiry': date(2026, 10, 16), 'strike': 58, 'option_right': 'C',
        }])
        sql, params = conn.executed[0]
        self.assertEqual(params, (date(2026, 9, 11),))
        # Settlement is derived from legs_json, never read off candidate_ledger.expiry:
        # the two columns must not be able to disagree about which leg is near.
        self.assertIn("MIN((l->>'expiry')::date)", sql)
        self.assertIn("(l->>'expiry')::date > r.settle_on", sql)
        self.assertIn('single_expiry = FALSE', sql)
        self.assertIn('outcome IS NULL', sql)


class MarkSourceTest(unittest.TestCase):
    LEG = {'symbol': 'BAC', 'expiry': date(2026, 10, 16), 'strike': 62.5, 'option_right': 'C'}

    def test_mark_is_the_mid_of_a_two_sided_quote(self):
        conn = FakeConn(quote_row=(3.65, 3.85, 'ib_internal', None))
        quote = capture.fetch_mark_from_snapshots(conn, self.LEG, date(2026, 9, 18))
        self.assertAlmostEqual(quote['mark'], 3.75)
        self.assertEqual(quote['source'], 'ib_internal')

    def test_query_refuses_one_sided_crossed_and_off_day_quotes(self):
        conn = FakeConn(quote_row=None)
        self.assertIsNone(capture.fetch_mark_from_snapshots(conn, self.LEG, date(2026, 9, 18)))
        sql, params = conn.executed[0]
        # A transacted `last` and the snapshot's own model-derived `mark` are both
        # excluded on purpose: settling against a model price would make the
        # ledger score the model against itself.
        self.assertNotIn('c.last', sql)
        self.assertIn('c.bid IS NOT NULL AND c.ask IS NOT NULL', sql)
        self.assertIn('c.bid > 0 AND c.ask >= c.bid', sql)
        # A quote from another session is a different day's price.
        self.assertIn("(o.snapshot_ts AT TIME ZONE 'America/New_York')::date = %s", sql)
        self.assertIn('ORDER BY o.snapshot_ts DESC', sql)
        self.assertEqual(params[1], date(2026, 9, 18))


class RunTest(unittest.TestCase):
    LEGS = [
        {'symbol': 'BAC', 'expiry': date(2026, 10, 16), 'strike': 62.5, 'option_right': 'C'},
        {'symbol': 'GME', 'expiry': date(2026, 10, 16), 'strike': 19, 'option_right': 'C'},
    ]

    def _run(self, quotes, dry_run=False):
        written = []

        def fake_persist(conn, settlement_date, records):
            written.extend(records)
            return len(records)

        with mock.patch.object(capture, 'psycopg2') as pg, \
             mock.patch.object(capture, 'load_far_legs', return_value=self.LEGS), \
             mock.patch.object(capture, 'fetch_mark_from_snapshots', side_effect=quotes), \
             mock.patch.object(capture, 'persist', side_effect=fake_persist), \
             mock.patch.object(capture, 'DB_URL', 'postgres://fake'):
            pg.connect.return_value = FakeConn()
            result = capture.run(settlement_date=date(2026, 9, 18), dry_run=dry_run)
        return result, written

    def test_an_unpriced_leg_is_recorded_as_a_miss_not_dropped(self):
        # Dropping it makes a miss indistinguishable from a leg nobody tried to
        # price, and coverage becomes unmeasurable.
        result, written = self._run([{'bid': 3.65, 'ask': 3.85, 'mark': 3.75, 'source': 'ib_internal'}, None])
        self.assertEqual((result['legs'], result['priced'], result['missing']), (2, 1, 1))
        self.assertEqual(len(written), 2)
        miss = [r for r in written if r[1] == 'GME'][0]
        # bid, ask and mark are all NULL -- never 0, which would settle the leg
        # as worthless and report every unpriced diagonal as a loss.
        self.assertEqual(miss[5:8], (None, None, None))
        self.assertEqual(miss[8], 'missing')

    def test_dry_run_writes_nothing(self):
        result, _ = self._run([None, None], dry_run=True)
        self.assertEqual(result['written'], 0)

    def test_no_rows_settling_today_is_a_clean_empty_not_an_error(self):
        with mock.patch.object(capture, 'psycopg2') as pg, \
             mock.patch.object(capture, 'load_far_legs', return_value=[]), \
             mock.patch.object(capture, 'DB_URL', 'postgres://fake'):
            pg.connect.return_value = FakeConn()
            result = capture.run(settlement_date=date(2026, 9, 19))
        self.assertEqual(result['status'], 'empty')


class PersistTest(unittest.TestCase):
    def test_a_real_mark_is_never_overwritten_by_a_later_miss(self):
        conn = FakeConn()
        with mock.patch.object(capture, 'execute_values') as ev:
            capture.persist(conn, date(2026, 9, 18), [
                (date(2026, 9, 18), 'BAC', date(2026, 10, 16), 62.5, 'C', None, None, None, 'missing'),
            ])
        sql = ev.call_args[0][1]
        # Re-running the capture must be able to fill a gap, but must not undo a
        # good observation -- there is no second chance to re-take it.
        self.assertIn('WHERE ledger_far_leg_marks.mark IS NULL', sql)


if __name__ == '__main__':
    unittest.main()
