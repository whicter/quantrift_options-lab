import gzip
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import rotate_logs


class RotateInPlaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_rotation_preserves_the_inode_pm2_has_open(self):
        """The whole reason for copy-then-truncate.

        PM2 holds an open descriptor on each log. If rotation renamed or replaced
        the file, PM2 would keep writing to an inode nothing reads and the log
        would appear to freeze -- the classic logrotate trap. Asserting the inode
        is unchanged is the only way to catch a refactor that reintroduces it.
        """
        path = self.dir / 'app-error.log'
        path.write_text('first\nsecond\n')
        before = path.stat().st_ino

        handle = open(path, 'a')  # stand in for PM2's descriptor
        try:
            result = rotate_logs.rotate_one(path, '20260810T000000Z')
            self.assertTrue(result['truncated'])
            self.assertEqual(path.stat().st_ino, before, 'inode changed; PM2 would write to a dead file')
            self.assertEqual(path.stat().st_size, 0)

            handle.write('after rotation\n')
            handle.flush()
        finally:
            handle.close()

        self.assertEqual(path.read_text(), 'after rotation\n')

    def test_archive_holds_the_pre_truncate_content(self):
        path = self.dir / 'app-error.log'
        path.write_text('keep me\n')
        result = rotate_logs.rotate_one(path, '20260810T000000Z')
        archive = self.dir / result['archived']
        self.assertTrue(archive.exists())
        with gzip.open(archive, 'rt') as fh:
            self.assertEqual(fh.read(), 'keep me\n')

    def test_prune_keeps_the_newest_archives_only(self):
        path = self.dir / 'app-error.log'
        path.write_text('x')
        for stamp in ('20260801T000000Z', '20260802T000000Z', '20260803T000000Z'):
            (self.dir / f'app-error-{stamp}.log.gz').write_bytes(b'')
        removed = rotate_logs.prune(path, keep=2)
        self.assertEqual(removed, 1)
        left = sorted(p.name for p in self.dir.glob('app-error-*.log.gz'))
        self.assertEqual(left, ['app-error-20260802T000000Z.log.gz', 'app-error-20260803T000000Z.log.gz'])

    def test_prune_does_not_touch_a_different_logs_archives(self):
        path = self.dir / 'app-error.log'
        path.write_text('x')
        (self.dir / 'app-error-20260801T000000Z.log.gz').write_bytes(b'')
        (self.dir / 'other-error-20260801T000000Z.log.gz').write_bytes(b'')
        rotate_logs.prune(path, keep=0)
        self.assertTrue((self.dir / 'other-error-20260801T000000Z.log.gz').exists())


class MissingVolumeTests(unittest.TestCase):
    def test_absent_log_dir_is_reported_and_never_created(self):
        """An unmounted X9_Pro must not become a directory on the boot disk.

        macOS creates /Volumes/<name> as an ordinary directory if something
        writes there while the volume is absent; when it remounts, that content
        is shadowed and looks lost. Rotation must decline rather than help.
        """
        with tempfile.TemporaryDirectory() as tmp:
            absent = Path(tmp) / 'not-mounted' / 'logs'
            with patch.object(rotate_logs, 'LOG_DIR', absent):
                result = rotate_logs.run()
            self.assertEqual(result['status'], 'log_dir_missing')
            self.assertFalse(absent.exists(), 'rotation created the missing path')


class GrowthAlertTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)
        self.prev = (self.now - timedelta(hours=2)).isoformat()

    def test_growth_beyond_threshold_is_reported(self):
        state = {'run_at': self.prev, 'sizes': {'noisy.log': 0}}
        sizes = {'noisy.log': rotate_logs.ALERT_BYTES_PER_HOUR * 4}
        alerts = rotate_logs.growth_alerts(state, self.now, sizes)
        self.assertEqual(len(alerts), 1)
        self.assertIn('noisy.log', alerts[0])

    def test_ordinary_growth_is_silent(self):
        state = {'run_at': self.prev, 'sizes': {'calm.log': 0}}
        sizes = {'calm.log': 1024}
        self.assertEqual(rotate_logs.growth_alerts(state, self.now, sizes), [])

    def test_a_file_rotated_since_the_last_run_is_not_reported_as_shrunk(self):
        # Post-rotation the file is smaller than its recorded size. That is the
        # rotation working, not a signal, and must not produce a spurious entry.
        state = {'run_at': self.prev, 'sizes': {'app.log': 10_000_000}}
        self.assertEqual(rotate_logs.growth_alerts(state, self.now, {'app.log': 0}), [])

    def test_first_ever_run_has_no_baseline_and_stays_silent(self):
        self.assertEqual(rotate_logs.growth_alerts({}, self.now, {'app.log': 10**9}), [])

    def test_corrupt_state_does_not_stop_rotation(self):
        # The size cap is the safety property; growth detection is the extra.
        state = {'run_at': 'not-a-timestamp', 'sizes': {'app.log': 0}}
        self.assertEqual(rotate_logs.growth_alerts(state, self.now, {'app.log': 10**9}), [])


if __name__ == '__main__':
    unittest.main()
