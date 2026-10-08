import unittest
from unittest.mock import MagicMock, patch

import collector_runtime


class SingleInstanceLockTests(unittest.TestCase):
    """PM2 fires a cron app twice in the same second a few percent of the time.

    The two copies are separate processes, so every in-process guard misses
    them and every check-then-act in SQL races. Three symptoms reached
    production before the cause was addressed: duplicate quote jobs on a
    concurrency-1 worker, a 170.8MB/h growth alert computed over a ~0s
    interval, and a redundant full-universe news fetch.
    """

    def _conn(self, acquired):
        cur = MagicMock()
        cur.fetchone.return_value = (acquired,)
        cur.__enter__ = lambda s: cur
        cur.__exit__ = lambda s, *a: False
        conn = MagicMock()
        conn.cursor.return_value = cur
        return conn, cur

    def test_the_winner_gets_the_connection_back(self):
        conn, cur = self._conn(True)
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}), \
             patch('psycopg2.connect', return_value=conn):
            self.assertIs(collector_runtime.acquire_single_instance_lock('news'), conn)
        # Non-blocking: the loser must not queue behind a run already working.
        self.assertIn('pg_try_advisory_lock', cur.execute.call_args[0][0])
        conn.close.assert_not_called()

    def test_the_loser_gets_none_and_its_connection_is_closed(self):
        conn, _ = self._conn(False)
        with patch.dict('os.environ', {'DATABASE_URL': 'postgres://x'}), \
             patch('psycopg2.connect', return_value=conn):
            self.assertIsNone(collector_runtime.acquire_single_instance_lock('news'))
        conn.close.assert_called_once()

    def test_without_a_database_the_script_still_runs(self):
        # Refusing to work is worse than occasionally doing it twice, so this
        # returns False -- "not locked" -- rather than None, which means "lost".
        with patch.dict('os.environ', {'DATABASE_URL': ''}, clear=False):
            self.assertIs(collector_runtime.acquire_single_instance_lock('news'), False)

    def test_exit_if_already_running_exits_zero_for_a_duplicate(self):
        # Zero, not non-zero: a duplicate declining to run is the correct
        # outcome, and failing here would train the operator to ignore exits.
        with patch.object(collector_runtime, 'acquire_single_instance_lock', return_value=None):
            with self.assertRaises(SystemExit) as caught:
                collector_runtime.exit_if_already_running('news')
        self.assertEqual(caught.exception.code, 0)

    def test_exit_if_already_running_returns_the_lock_for_the_winner(self):
        sentinel = object()
        with patch.object(collector_runtime, 'acquire_single_instance_lock', return_value=sentinel):
            self.assertIs(collector_runtime.exit_if_already_running('news'), sentinel)


if __name__ == '__main__':
    unittest.main()
