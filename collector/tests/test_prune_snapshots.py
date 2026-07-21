import unittest

import prune_snapshots


class FakeCursor:
    def __init__(self, owner):
        self._owner = owner

    def execute(self, sql, params=None):
        self._owner.calls.append((sql, params))
        # Simulate a finite backlog: return the queued rowcounts in order.
        self.rowcount = self._owner.rowcounts.pop(0) if self._owner.rowcounts else 0

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeConn:
    def __init__(self, rowcounts):
        self.rowcounts = list(rowcounts)
        self.calls = []
        self.commits = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


class PruneSnapshotsTests(unittest.TestCase):
    def test_batches_until_no_more_old_rows(self):
        conn = FakeConn([5000, 5000, 1200, 0])
        deleted = prune_snapshots.prune_table(conn, 't', 'created_at', 3, batch_size=5000, max_rows=1_000_000)
        self.assertEqual(deleted, 11200)
        self.assertGreaterEqual(conn.commits, 3)

    def test_stops_at_max_rows_per_call(self):
        # A huge backlog must not be deleted in one call; it drains over cycles.
        conn = FakeConn([5000] * 100)
        deleted = prune_snapshots.prune_table(conn, 't', 'created_at', 3, batch_size=5000, max_rows=20000)
        self.assertEqual(deleted, 20000)

    def test_zero_retention_deletes_nothing(self):
        conn = FakeConn([5000])
        self.assertEqual(prune_snapshots.prune_table(conn, 't', 'created_at', 0), 0)
        self.assertEqual(conn.calls, [])

    def test_delete_filters_by_age_and_table(self):
        conn = FakeConn([0])
        prune_snapshots.prune_table(conn, 'scanner_results_snapshots', 'created_at', 3)
        sql = conn.calls[0][0]
        self.assertIn('DELETE FROM scanner_results_snapshots', sql)
        self.assertIn("INTERVAL '1 day'", sql)
        self.assertIn('ctid IN', sql)
