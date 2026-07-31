import unittest
from pathlib import Path
from unittest.mock import patch

from collector_runtime import LOG_DATE_FORMAT, LOG_FORMAT, configure_collector, load_collector_env, parse_symbols


class ParseSymbolsTests(unittest.TestCase):
    def test_normalizes_deduplicates_and_preserves_order(self):
        self.assertEqual(
            parse_symbols(' spy,QQQ, spy ,,brk.b '),
            ['SPY', 'QQQ', 'BRK.B'],
        )

    def test_accepts_an_empty_override(self):
        self.assertEqual(parse_symbols(None), [])
        self.assertEqual(parse_symbols(''), [])


class RuntimeSetupTests(unittest.TestCase):
    @patch('collector_runtime.load_dotenv')
    def test_loads_env_beside_the_entrypoint(self, load_dotenv):
        load_collector_env('/srv/collector/run_job.py')
        load_dotenv.assert_called_once_with(Path('/srv/collector/.env'))

    @patch('collector_runtime.logging.basicConfig')
    @patch('collector_runtime.load_dotenv')
    def test_configures_the_shared_log_contract(self, load_dotenv, basic_config):
        configure_collector('/srv/collector/run_job.py')
        load_dotenv.assert_called_once_with(Path('/srv/collector/.env'))
        basic_config.assert_called_once_with(
            level=20,
            format=LOG_FORMAT,
            datefmt=LOG_DATE_FORMAT,
        )


if __name__ == '__main__':
    unittest.main()
