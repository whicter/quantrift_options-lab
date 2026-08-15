"""Every IB call carrying a ticker must translate it, not just the Contract.

_stock_contract has always converted through _ib_contract_symbol, so a dotted
class share resolved fine and produced a valid conId. reqSecDefOptParams takes
the underlying symbol as its OWN argument beside that conId, and it was passing
the raw ticker -- so IB got a correct conId next to a symbol it does not
recognise and answered with nothing.

Measured against conId 72063691: 'BRK B' returns 20 exchanges in 0.06s,
'BRK.B' returns none. In production that was a 30s timeout per attempt retried
every 20 minutes through a whole session; 11 of Friday 2026-08-14's 22 quote
failures were BRK.B itself and the other 11 were symbols starved behind it on
the serial lane.
"""
import threading
import unittest

from providers.ib_option_chain_provider import IbOptionChainProvider, _ib_contract_symbol


class SymbolTranslationTest(unittest.TestCase):
    def test_class_shares_use_a_space(self):
        # IB writes share classes with a space; Polygon and symbol_universe use
        # a dot. Neither form is "correct" everywhere, so the conversion has to
        # happen at the IB boundary rather than in the database.
        self.assertEqual(_ib_contract_symbol('BRK.B'), 'BRK B')
        self.assertEqual(_ib_contract_symbol('BF.B'), 'BF B')

    def test_ordinary_tickers_are_untouched(self):
        self.assertEqual(_ib_contract_symbol('AAPL'), 'AAPL')
        self.assertEqual(_ib_contract_symbol('aapl'), 'AAPL')


class _RecordingApp:
    """Captures the arguments reqSecDefOptParams is actually called with."""

    def __init__(self):
        self.calls = []
        self.option_params_done = {}
        self.option_params = {}
        self._next = 100

    def next_req_id(self):
        self._next += 1
        return self._next

    def reqSecDefOptParams(self, req_id, symbol, fut_exchange, sec_type, con_id):
        self.calls.append({'symbol': symbol, 'sec_type': sec_type, 'con_id': con_id})
        # Answer immediately so the provider proceeds to its parsing.
        self.option_params[req_id] = {
            'expirations': {'20260918'}, 'strikes': {500.0}, 'trading_classes': {'BRK'},
        }
        self.option_params_done[req_id].set()


class OptionParamsSymbolTest(unittest.TestCase):
    def setUp(self):
        self.provider = IbOptionChainProvider(client_id=998)
        self.app = _RecordingApp()

    def test_option_params_receives_the_translated_symbol(self):
        self.provider._fetch_option_params(self.app, 'BRK.B', 72063691)
        self.assertEqual(self.app.calls[0]['symbol'], 'BRK B',
                         'reqSecDefOptParams must not receive the dotted ticker')

    def test_conid_is_passed_through_unchanged(self):
        self.provider._fetch_option_params(self.app, 'BRK.B', 72063691)
        self.assertEqual(self.app.calls[0]['con_id'], 72063691)

    def test_ordinary_symbol_is_unaffected(self):
        self.provider._fetch_option_params(self.app, 'AAPL', 265598)
        self.assertEqual(self.app.calls[0]['symbol'], 'AAPL')

    def test_security_type_still_derives_from_the_original_symbol(self):
        # _is_index_symbol matches against our own ticker form, so translating
        # before that check would break index detection.
        self.provider._fetch_option_params(self.app, 'SPX', 416904)
        self.assertEqual(self.app.calls[0]['sec_type'], 'IND')


if __name__ == '__main__':
    unittest.main()
