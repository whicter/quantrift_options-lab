import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from providers.polygon_rate_limit import PolygonStockRequestPacer


# These cover the local file-lock fallback, which is only correct for a single
# host. The backend is pinned explicitly so the test cannot open a real database
# connection just because DATABASE_URL happens to be present in the environment.
FILE_BACKEND = {'PROVIDER_RATE_LIMIT_BACKEND': 'file'}


class PolygonStockRequestPacerTests(unittest.TestCase):
    def test_first_request_writes_shared_timestamp_without_sleeping(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, FILE_BACKEND), \
             patch('providers.polygon_rate_limit.time.time', side_effect=[100.0, 100.0]), \
             patch('providers.polygon_rate_limit.time.sleep') as sleep:
            path = Path(directory) / 'rate-limit'
            PolygonStockRequestPacer(delay=16, state_path=str(path)).wait()

            self.assertEqual(path.read_text(encoding='ascii'), '100.0')
            sleep.assert_not_called()

    def test_second_process_waits_for_remaining_shared_interval(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, FILE_BACKEND), \
             patch('providers.polygon_rate_limit.time.time', side_effect=[105.0, 116.0]), \
             patch('providers.polygon_rate_limit.time.sleep') as sleep:
            path = Path(directory) / 'rate-limit'
            path.write_text('100.0', encoding='ascii')
            PolygonStockRequestPacer(delay=16, state_path=str(path)).wait()

            sleep.assert_called_once_with(11.0)
            self.assertEqual(path.read_text(encoding='ascii'), '116.0')

    def test_file_backend_is_not_selected_when_a_database_is_available(self):
        # The default must be the shared backend; silently pacing per-host once
        # more than one worker exists is the failure this replaces.
        with patch.dict(os.environ, {'DATABASE_URL': 'postgres://example/db'}, clear=False), \
             patch.dict(os.environ, {'PROVIDER_RATE_LIMIT_BACKEND': 'database'}):
            pacer = PolygonStockRequestPacer(delay=16)
            self.assertIsNotNone(pacer._db_pacer)

    def test_shared_pacing_failure_degrades_to_the_local_lock(self):
        # Pacing must never take the collector down.
        def explode():
            raise RuntimeError('database unavailable')

        # Fixed clock rather than a sequence: the fallback logs, and logging
        # itself calls time.time().
        with tempfile.TemporaryDirectory() as directory, \
             patch('providers.polygon_rate_limit.time.time', return_value=100.0), \
             patch('providers.polygon_rate_limit.time.sleep'):
            path = Path(directory) / 'rate-limit'
            pacer = PolygonStockRequestPacer(delay=16, state_path=str(path), connect=explode)
            pacer.wait()

            self.assertEqual(path.read_text(encoding='ascii'), '100.0')


if __name__ == '__main__':
    unittest.main()
