import importlib
import os
import unittest
from unittest.mock import patch


class CollectRuntimeGateTest(unittest.TestCase):
    def test_disabled_runtime_stops_before_loading_watchlist_or_authentication(self):
        with patch.dict(os.environ, {'TT_METRICS_ENABLED': 'false'}, clear=False):
            import collect
            importlib.reload(collect)
            with patch.object(collect, 'load_watchlist') as load_watchlist, \
                 patch.object(collect, 'get_session_token') as get_session_token:
                collect.run()

        load_watchlist.assert_not_called()
        get_session_token.assert_not_called()
        importlib.reload(collect)


if __name__ == '__main__':
    unittest.main()
