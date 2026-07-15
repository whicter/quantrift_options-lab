import unittest
from pathlib import Path


WORKER_SOURCE = Path(__file__).resolve().parents[1] / 'run_refresh_worker.py'
SERVER_REFRESH_SOURCE = Path(__file__).resolve().parents[2] / 'server' / 'src' / 'lib' / 'refreshJobs.js'


class RefreshProviderContractTest(unittest.TestCase):
    def test_api_default_provider_is_supported_by_worker(self):
        worker_source = WORKER_SOURCE.read_text()
        server_source = SERVER_REFRESH_SOURCE.read_text()
        self.assertIn("process.env.OPTIONS_REFRESH_PROVIDER || 'tt_internal'", server_source)
        self.assertIn("SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal'}", worker_source)

    def test_placeholder_provider_is_not_supported_by_worker(self):
        source = WORKER_SOURCE.read_text()
        supported_line = next(
            line for line in source.splitlines()
            if line.startswith('SUPPORTED_OPTION_PROVIDERS')
        )
        self.assertNotIn('licensed_options_provider', supported_line)


if __name__ == '__main__':
    unittest.main()
