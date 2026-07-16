import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from providers.polygon_rate_limit import PolygonStockRequestPacer


class PolygonStockRequestPacerTests(unittest.TestCase):
    def test_first_request_writes_shared_timestamp_without_sleeping(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch('providers.polygon_rate_limit.time.time', side_effect=[100.0, 100.0]), \
             patch('providers.polygon_rate_limit.time.sleep') as sleep:
            path = Path(directory) / 'rate-limit'
            PolygonStockRequestPacer(delay=16, state_path=str(path)).wait()

            self.assertEqual(path.read_text(encoding='ascii'), '100.0')
            sleep.assert_not_called()

    def test_second_process_waits_for_remaining_shared_interval(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch('providers.polygon_rate_limit.time.time', side_effect=[105.0, 116.0]), \
             patch('providers.polygon_rate_limit.time.sleep') as sleep:
            path = Path(directory) / 'rate-limit'
            path.write_text('100.0', encoding='ascii')
            PolygonStockRequestPacer(delay=16, state_path=str(path)).wait()

            sleep.assert_called_once_with(11.0)
            self.assertEqual(path.read_text(encoding='ascii'), '116.0')


if __name__ == '__main__':
    unittest.main()
