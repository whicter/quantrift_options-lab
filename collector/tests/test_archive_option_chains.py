import gzip
import json
import os
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import archive_option_chains as arch


class SessionDiscoveryTests(unittest.TestCase):
    """What counts as already captured, and what counts as lost."""

    def test_a_run_without_a_manifest_is_not_treated_as_archived(self):
        # The manifest is written last, so its absence means the run died
        # partway. Trusting the directory would freeze a truncated capture.
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / '2026' / '2026-09-29').mkdir(parents=True)
            (root / '2026' / '2026-09-29' / 'chains.csv.gz').write_bytes(b'')
            complete = root / '2026' / '2026-09-30'
            complete.mkdir(parents=True)
            (complete / 'manifest.json').write_text('{}')

            self.assertEqual(arch.archived_sessions(root), {date(2026, 9, 30)})

    def test_an_absent_root_is_simply_empty(self):
        with TemporaryDirectory() as tmp:
            self.assertEqual(arch.archived_sessions(Path(tmp) / 'nope'), set())

    def test_a_non_date_directory_is_ignored(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            junk = root / '2026' / 'notadate'
            junk.mkdir(parents=True)
            (junk / 'manifest.json').write_text('{}')
            self.assertEqual(arch.archived_sessions(root), set())


class MountGuardTests(unittest.TestCase):
    """The boot-disk shadowing hazard is a hard failure, not a warning."""

    def test_an_unmounted_volume_path_refuses_to_be_created(self):
        with patch.object(Path, 'is_mount', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'not mounted'):
                arch.ensure_writable_root(Path('/Volumes/Nope_XYZ/chain-archive'))
        self.assertFalse(Path('/Volumes/Nope_XYZ').exists())

    def test_a_mounted_volume_path_is_created(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / 'chain-archive'
            # Not under /Volumes, so the guard does not apply at all.
            self.assertEqual(arch.ensure_writable_root(target), target)
            self.assertTrue(target.is_dir())


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.conn.queries.append((sql, params))

    def fetchall(self):
        return self.conn.rows

    def copy_expert(self, sql, buffer):
        self.conn.copies.append(sql)
        buffer.write(self.conn.payload)


class FakeConn:
    def __init__(self, rows=(), payload='a,b\n1,2\n'):
        self.rows = list(rows)
        self.payload = payload
        self.queries = []
        self.copies = []

    def cursor(self):
        return FakeCursor(self)

    def rollback(self):
        pass


class WriteAndVerifyTests(unittest.TestCase):
    def test_the_file_is_read_back_before_it_counts_as_written(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / 'chains.csv.gz'
            result = arch.write_table(FakeConn(payload='id,sym\n1,AAPL\n2,SPY\n'),
                                      'COPY x TO STDOUT', target)

            self.assertEqual(result['rows'], 2)          # header excluded
            self.assertGreater(result['bytes'], 0)
            self.assertEqual(len(result['sha256']), 64)
            with gzip.open(target, 'rt') as handle:
                self.assertEqual(handle.readline().strip(), 'id,sym')

    def test_an_empty_slice_writes_a_header_and_zero_rows(self):
        with TemporaryDirectory() as tmp:
            result = arch.write_table(FakeConn(payload='id,sym\n'),
                                      'COPY x TO STDOUT', Path(tmp) / 'c.csv.gz')
            self.assertEqual(result['rows'], 0)


class ManifestTests(unittest.TestCase):
    def _meta(self, chains):
        return {
            'chains': chains,
            'first': datetime(2026, 9, 29, 13, 30, tzinfo=timezone.utc),
            'last': datetime(2026, 9, 29, 20, 0, tzinfo=timezone.utc),
        }

    def test_a_clipped_weekday_is_flagged_but_a_quiet_weekend_is_not(self):
        # Row count alone cannot tell them apart: a weekend legitimately holds a
        # handful of on-demand snapshots, while a weekday holding a handful was
        # eaten by the prune.
        with TemporaryDirectory() as tmp, \
             patch.dict(os.environ, {'CHAIN_ARCHIVE_FULL_SESSION_MIN': '400'}, clear=False):
            root = Path(tmp)
            weekday = arch.archive_session(FakeConn(), root, date(2026, 9, 28),
                                           self._meta(75), dry_run=False)
            weekend = arch.archive_session(FakeConn(), root, date(2026, 10, 3),
                                           self._meta(17), dry_run=False)

            self.assertTrue(weekday['is_trading_weekday'])
            self.assertTrue(weekday['possibly_truncated'])
            self.assertFalse(weekend['is_trading_weekday'])
            self.assertFalse(weekend['possibly_truncated'])

    def test_a_full_session_is_not_flagged(self):
        with TemporaryDirectory() as tmp:
            manifest = arch.archive_session(FakeConn(), Path(tmp), date(2026, 9, 29),
                                            self._meta(1578), dry_run=False)
            self.assertFalse(manifest['possibly_truncated'])

    def test_the_manifest_lands_on_disk_and_marks_the_session_done(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            arch.archive_session(FakeConn(), root, date(2026, 9, 29),
                                 self._meta(1578), dry_run=False)

            written = json.loads((root / '2026' / '2026-09-29' / 'manifest.json').read_text())
            self.assertEqual(written['market_date'], '2026-09-29')
            self.assertEqual(set(written['files']), {'chains', 'contracts'})
            self.assertEqual(arch.archived_sessions(root), {date(2026, 9, 29)})

    def test_dry_run_writes_nothing(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            arch.archive_session(FakeConn(), root, date(2026, 9, 29),
                                 self._meta(1578), dry_run=True)
            self.assertFalse((root / '2026').exists())


if __name__ == '__main__':
    unittest.main()
