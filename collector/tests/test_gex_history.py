"""Durable GEX history: the write that has to survive the 7-day CASCADE prune.

gex_snapshots / gex_by_strike_snapshots hang off option_chain_snapshots with
ON DELETE CASCADE, so prune_snapshots destroys them within 7 days. Dealer
positioning at a past moment cannot be recomputed afterwards, which makes a
missed write here permanent data loss rather than a delay.
"""
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

import backup_facts
import compute_gex


class FakeCursor:
    def __init__(self, sink):
        self.sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.sink.append(('execute', sql, params))

    def fetchone(self):
        return (1,)


class FakeConn:
    """Records statements so the test can assert on ordering vs commit."""

    def __init__(self):
        self.statements = []
        self.commits = 0

    def cursor(self):
        return FakeCursor(self.statements)

    def commit(self):
        self.commits += 1
        self.statements.append(('commit', None, None))


def fake_execute_values(cur, sql, rows):
    cur.sink.append(('execute_values', sql, rows))


def metrics_fixture(snapshot_ts, symbol='TEST'):
    return {
        'snapshot_id': 7,
        'symbol': symbol,
        'snapshot_ts': snapshot_ts,
        'source': 'polygon_licensed',
        'global_gex': 1234.5,
        'local_gamma': 12.0,
        'gamma_flip': 99.0,
        'gamma_regime': 'positive',
        'spot_vs_flip_distance_pct': 1.5,
        'call_wall': 105.0,
        'put_wall': 95.0,
        'wall_method': 'gex',
        'max_pain': 100.0,
        'pcr_oi': 0.8,
        'pcr_volume': 0.9,
        'confidence': 'high',
        'gamma_curve': [],
        'by_strike': {
            100: {'call_gex': 10, 'put_gex': -5, 'net_gex': 5,
                  'call_oi': 3, 'put_oi': 2, 'call_volume': 1, 'put_volume': 1},
        },
        'raw_metrics': {'spot': 100.5, 'model_version': 'gex-v2-1pct-positioning-proxy'},
    }


class GexHistoryWriteTest(unittest.TestCase):
    def setUp(self):
        self._real_execute_values = compute_gex.execute_values
        compute_gex.execute_values = fake_execute_values

    def tearDown(self):
        compute_gex.execute_values = self._real_execute_values

    def test_history_is_written_before_the_commit(self):
        """It must share persist_gex's transaction.

        If it committed separately, a crash between the two would leave a
        snapshot whose history row never existed -- and the snapshot is gone
        7 days later, so the gap would be permanent and silent.
        """
        conn = FakeConn()
        compute_gex.persist_gex(conn, metrics_fixture(datetime.now(timezone.utc)))

        kinds = [s[0] for s in conn.statements]
        sql_blob = ' '.join(s[1] for s in conn.statements if s[1])
        self.assertIn('gex_history', sql_blob)
        self.assertIn('gex_strike_history', sql_blob)
        self.assertEqual(conn.commits, 1)
        # the durable writes precede the single commit
        commit_at = kinds.index('commit')
        history_at = min(i for i, s in enumerate(conn.statements)
                         if s[1] and 'gex_history' in s[1])
        self.assertLess(history_at, commit_at)

    def test_market_date_uses_new_york_not_utc(self):
        """A UTC date rolls over mid-session and splits one session in two.

        20:30 UTC is 16:30 on the same New York day; 01:30 UTC is still the
        PREVIOUS New York trading day, which is where a naive .date() breaks.
        """
        conn = FakeConn()
        # 01:30 UTC on the 8th == 21:30 ET on the 7th
        ts = datetime(2026, 8, 8, 1, 30, tzinfo=timezone.utc)
        compute_gex.persist_gex_history(conn, metrics_fixture(ts))

        params = next(s[2] for s in conn.statements
                      if s[1] and 'INSERT INTO gex_history' in s[1])
        self.assertIn(date(2026, 8, 7), params)
        self.assertNotIn(date(2026, 8, 8), params)

    def test_strike_history_keeps_the_later_snapshot_only(self):
        """One row per (symbol, market_date, strike), later snapshot winning.

        Intraday copies carry no extra information: open interest is a daily
        quantity, so repeated intraday rows are the same OI map recomputed at a
        moving spot.
        """
        conn = FakeConn()
        compute_gex.persist_gex_history(conn, metrics_fixture(datetime.now(timezone.utc)))

        sql = next(s[1] for s in conn.statements
                   if s[1] and 'gex_strike_history' in s[1])
        self.assertIn('ON CONFLICT (symbol, market_date, strike)', sql)
        self.assertIn('WHERE EXCLUDED.snapshot_ts >= gex_strike_history.snapshot_ts', sql)

    def test_model_version_is_recorded(self):
        """Without it a model change silently mixes two regimes in one series.

        Same lesson as iv_source on the spliced IV history.
        """
        conn = FakeConn()
        compute_gex.persist_gex_history(conn, metrics_fixture(datetime.now(timezone.utc)))

        params = next(s[2] for s in conn.statements
                      if s[1] and 'INSERT INTO gex_history' in s[1])
        self.assertIn('gex-v2-1pct-positioning-proxy', params)

    def test_missing_by_strike_still_writes_the_scalar_row(self):
        conn = FakeConn()
        metrics = metrics_fixture(datetime.now(timezone.utc))
        metrics['by_strike'] = {}
        compute_gex.persist_gex_history(conn, metrics)

        sql_blob = ' '.join(s[1] for s in conn.statements if s[1])
        self.assertIn('INSERT INTO gex_history', sql_blob)
        self.assertNotIn('gex_strike_history', sql_blob)


class BackupTargetTest(unittest.TestCase):
    def test_gex_history_tables_are_backed_up(self):
        self.assertIn('gex_history', backup_facts.TABLES)
        self.assertIn('gex_strike_history', backup_facts.TABLES)

    def test_unmounted_volume_is_refused(self):
        """An unmounted target must fail, never write a phantom tree.

        macOS lets a process create /Volumes/<name>/... as an ordinary boot-disk
        directory when the drive is absent; remounting shadows it, so the backup
        reports success and the files are unreachable.
        """
        with self.assertRaises(RuntimeError):
            backup_facts.assert_backup_root_usable(
                Path('/Volumes/DefinitelyNotMounted_9c1f/fact-backups'))

    def test_existing_non_mount_directory_is_refused(self):
        # /Volumes/.timemachine is a real directory that is NOT a mount point --
        # exactly the shape a leftover stub takes.
        with self.assertRaises(RuntimeError):
            backup_facts.assert_backup_root_usable(
                Path('/Volumes/.timemachine/fact-backups'))

    def test_non_volume_paths_are_left_alone(self):
        backup_facts.assert_backup_root_usable(Path.home() / 'quantrift-backups')

    def test_prune_survives_sidecars_that_vanish_mid_loop(self):
        """Retention must not abort when a listed file is already gone.

        On the exFAT external volume macOS keeps an AppleDouble `._name` beside
        every file; deleting `name` also removes `._name`, so the entry
        iterdir() already yielded no longer exists. That raised
        FileNotFoundError mid-loop and silently disabled retention entirely --
        17 runs were present under a KEEP of 14, going back to 2026-07-30.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('20260101T000000Z', '20260102T000000Z', '20260103T000000Z'):
                run = root / name
                run.mkdir()
                (run / 'table.csv.gz').write_text('x')

            real_unlink = Path.unlink

            def unlink_removing_sidecar(self, missing_ok=False):
                # deleting the payload also takes its sidecar, as exFAT does
                sidecar = self.parent / f'._{self.name}'
                real_unlink(self, missing_ok=missing_ok)
                if sidecar.exists():
                    real_unlink(sidecar, missing_ok=True)

            for name in ('20260101T000000Z', '20260102T000000Z', '20260103T000000Z'):
                (root / name / '._table.csv.gz').write_text('x')

            with mock.patch.object(Path, 'unlink', unlink_removing_sidecar):
                removed = backup_facts.prune_old_runs(root, keep=1)

            self.assertEqual(sorted(removed),
                             ['20260101T000000Z', '20260102T000000Z'])
            surviving = sorted(p.name for p in root.iterdir() if p.is_dir())
            self.assertEqual(surviving, ['20260103T000000Z'])


if __name__ == '__main__':
    unittest.main()
