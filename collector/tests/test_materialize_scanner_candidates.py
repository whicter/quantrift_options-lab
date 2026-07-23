import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import materialize_scanner_candidates as msc

COLLECTOR_DIR = Path(__file__).resolve().parents[1]


class MaterializeScannerCandidatesTest(unittest.TestCase):
    def test_disabled_flag_skips_without_invoking_node(self):
        with patch.dict('os.environ', {'SCANNER_CANDIDATE_MATERIALIZE_ENABLED': 'false'}, clear=False), \
             patch.object(msc.subprocess, 'run') as run_mock, \
             patch.object(msc.shutil, 'which') as which_mock:
            msc.run()
        run_mock.assert_not_called()
        which_mock.assert_not_called()

    def test_missing_node_degrades_without_running(self):
        with patch.dict('os.environ', {'SCANNER_CANDIDATE_MATERIALIZE_ENABLED': 'true', 'DATABASE_URL': 'x'}, clear=False), \
             patch.object(msc.shutil, 'which', return_value=None), \
             patch.object(msc.subprocess, 'run') as run_mock:
            msc.run()
        run_mock.assert_not_called()

    def test_missing_database_url_skips(self):
        env = {'SCANNER_CANDIDATE_MATERIALIZE_ENABLED': 'true'}
        with patch.dict('os.environ', env, clear=True), \
             patch.object(msc.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(msc.subprocess, 'run') as run_mock:
            msc.run()
        run_mock.assert_not_called()

    def test_invokes_node_with_script_and_scan_key(self):
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout='Materialized scanner candidates: {"batchId":"7"}', stderr='')
        with patch.dict('os.environ', {'SCANNER_CANDIDATE_MATERIALIZE_ENABLED': 'true', 'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch.object(msc.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(msc.subprocess, 'run', return_value=completed) as run_mock:
            msc.run('watchlist_v1')
        run_mock.assert_called_once()
        argv = run_mock.call_args.args[0]
        self.assertEqual(argv[0], '/usr/bin/node')
        self.assertEqual(argv[1], str(msc.NODE_SCRIPT))
        self.assertEqual(argv[2], 'watchlist_v1')

    def test_nonzero_exit_is_swallowed(self):
        failed = subprocess.CompletedProcess(args=[], returncode=1, stdout='', stderr='boom')
        with patch.dict('os.environ', {'SCANNER_CANDIDATE_MATERIALIZE_ENABLED': 'true', 'DATABASE_URL': 'postgres://x'}, clear=False), \
             patch.object(msc.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(msc.subprocess, 'run', return_value=failed):
            msc.run()  # must not raise

    def test_node_script_path_points_at_the_js_materializer(self):
        self.assertEqual(msc.NODE_SCRIPT, COLLECTOR_DIR.parent / 'server' / 'src' / 'jobs' / 'materializeScannerCandidates.js')

    def test_cycles_run_candidates_after_scanner_materialize(self):
        daemon = (COLLECTOR_DIR / 'run_collector_daemon.py').read_text()
        self.assertLess(daemon.index('materialize_scan.run()'), daemon.index('materialize_scanner_candidates.run()'))
        cron = (COLLECTOR_DIR / 'run_railway_refresh_cycle.py').read_text()
        self.assertLess(cron.index('materialize_scan.run()'), cron.index('materialize_scanner_candidates.run()'))


if __name__ == '__main__':
    unittest.main()
