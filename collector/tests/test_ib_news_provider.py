import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from providers.ib_news_provider import _ib_contract_symbol


class IbContractSymbolTest(unittest.TestCase):
    def test_dotted_ticker_becomes_a_space_for_the_ib_contract(self):
        # IB's stock contract symbol uses a space where the display ticker has
        # a dot (BRK.B -> "BRK B"). Distinct from the OCC option-root fix
        # (occ_ticker strips punctuation entirely, no space) -- these are two
        # different IB/Polygon symbol conventions and must not be conflated.
        self.assertEqual(_ib_contract_symbol('BRK.B'), 'BRK B')
        self.assertEqual(_ib_contract_symbol('AAPL'), 'AAPL')

    def test_lowercase_is_upper_cased(self):
        self.assertEqual(_ib_contract_symbol('aapl'), 'AAPL')


if __name__ == '__main__':
    unittest.main()
