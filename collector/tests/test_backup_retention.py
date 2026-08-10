import tempfile
import unittest
from pathlib import Path

import backup_facts


def make_run(root: Path, name: str, *, files=('price_history.csv.gz',), sidecars=True) -> Path:
    """Build a run directory, optionally with the AppleDouble sidecars exFAT adds."""
    run = root / name
    run.mkdir(parents=True)
    for f in files:
        (run / f).write_bytes(b'data')
        if sidecars:
            (run / f'._{f}').write_bytes(b'')
    return run


class ContentDetectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_run_holding_only_applecdouble_sidecars_is_not_content(self):
        # A sidecar is metadata for a file that is gone. A directory full of them
        # looks populated to anything that counts entries.
        run = self.root / '20260101T000000Z'
        run.mkdir()
        (run / '._price_history.csv.gz').write_bytes(b'')
        self.assertFalse(backup_facts.has_backup_content(run))

    def test_a_run_with_real_files_is_content(self):
        run = make_run(self.root, '20260101T000000Z')
        self.assertTrue(backup_facts.has_backup_content(run))


class PruneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_shells_do_not_consume_a_retention_slot(self):
        """The defect this fixes: KEEP=14 was holding 13 backups and one shell.

        prune counted directories, not contents, so a run interrupted before it
        wrote anything still occupied a slot and pushed a real backup out.
        """
        for day in range(1, 4):
            make_run(self.root, f'2026010{day}T000000Z')
        (self.root / '20260104T000000Z').mkdir()  # interrupted run, no files

        removed = backup_facts.prune_old_runs(self.root, keep=3)

        self.assertIn('20260104T000000Z', removed)
        survivors = sorted(p.name for p in self.root.iterdir() if p.is_dir())
        self.assertEqual(len(survivors), 3)
        for name in survivors:
            self.assertTrue(backup_facts.has_backup_content(self.root / name))

    def test_shells_are_removed_even_when_under_the_keep_count(self):
        make_run(self.root, '20260101T000000Z')
        (self.root / '20260102T000000Z').mkdir()
        removed = backup_facts.prune_old_runs(self.root, keep=14)
        self.assertEqual(removed, ['20260102T000000Z'])

    def test_oldest_real_runs_are_dropped_first(self):
        for day in (1, 2, 3):
            make_run(self.root, f'2026010{day}T000000Z')
        removed = backup_facts.prune_old_runs(self.root, keep=2)
        self.assertEqual(removed, ['20260101T000000Z'])

    def test_removal_survives_a_directory_whose_sidecars_vanish_mid_walk(self):
        """Why shutil.rmtree replaced the manual iterdir loop.

        iterdir() is a lazy generator over the live directory. Deleting `name`
        on exFAT also removes `._name`, so the generator could advance onto an
        entry that had just disappeared and raise mid-loop, aborting the rmdir
        and leaving a partly-stripped run. unlink(missing_ok=True) covered
        deleting an absent file, not iterating a mutating directory.
        """
        make_run(self.root, '20260101T000000Z',
                 files=('a.csv.gz', 'b.csv.gz', 'c.csv.gz'))
        make_run(self.root, '20260102T000000Z')
        removed = backup_facts.prune_old_runs(self.root, keep=1)
        self.assertEqual(removed, ['20260101T000000Z'])
        self.assertFalse((self.root / '20260101T000000Z').exists())

    def test_nothing_is_removed_when_everything_fits(self):
        make_run(self.root, '20260101T000000Z')
        self.assertEqual(backup_facts.prune_old_runs(self.root, keep=14), [])


if __name__ == '__main__':
    unittest.main()
