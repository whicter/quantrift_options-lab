import inspect
import os
import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider


class OptionProviderSelectionTest(unittest.TestCase):
    def make_provider(self):
        env = {
            'OPTION_DTE_BUCKETS': '0-14,30-60,60-90',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'OPTION_MAX_CONTRACTS': '6',
            'OPTION_MAX_CONTRACTS_PER_EXPIRATION': '2',
            'TT_COLLECT_DXLINK': 'false',
        }
        with patch.dict(os.environ, env, clear=False):
            return TastytradeOptionChainProvider()

    def test_select_expirations_uses_one_expiration_per_dte_bucket(self):
        provider = self.make_provider()
        today = date.today()
        available = [
            today + timedelta(days=2),
            today + timedelta(days=9),
            today + timedelta(days=35),
            today + timedelta(days=45),
            today + timedelta(days=70),
            today + timedelta(days=80),
        ]

        selected = provider._select_expirations(available, requested=None)

        self.assertEqual(selected, [
            today + timedelta(days=2),
            today + timedelta(days=35),
            today + timedelta(days=70),
        ])

    def test_contract_builder_does_not_exhaust_global_cap_on_first_expiration(self):
        provider = self.make_provider()
        today = date.today()
        rows = []
        for expiry in [today + timedelta(days=2), today + timedelta(days=35), today + timedelta(days=70)]:
            for strike in [100, 101, 102]:
                rows.append({
                    'expiry': expiry,
                    'strike': strike,
                    'call_symbol': f'C{expiry.isoformat()}{strike}',
                    'call_streamer_symbol': f'.C{expiry.isoformat()}{strike}',
                    'put_symbol': f'P{expiry.isoformat()}{strike}',
                    'put_streamer_symbol': f'.P{expiry.isoformat()}{strike}',
                })

        contracts = provider._build_metadata_contracts('PLTR', rows)
        counts_by_expiry = {}
        for contract in contracts:
            counts_by_expiry[contract.expiry] = counts_by_expiry.get(contract.expiry, 0) + 1

        self.assertEqual(len(contracts), 6)
        self.assertEqual(counts_by_expiry, {
            today + timedelta(days=2): 2,
            today + timedelta(days=35): 2,
            today + timedelta(days=70): 2,
        })

    def test_ib_market_data_defaults_to_delayed(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        with patch.dict(os.environ, {}, clear=False):
            previous = os.environ.pop('IB_MARKET_DATA_TYPE', None)
            try:
                provider = IbOptionChainProvider()
            finally:
                if previous is not None:
                    os.environ['IB_MARKET_DATA_TYPE'] = previous

        self.assertEqual(provider.market_data_type, 3)

    def test_ib_option_quotes_use_streaming_when_requesting_generic_ticks(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        class FakeApp:
            def __init__(self):
                self.market_data = {}
                self.cancelled = []

            def next_req_id(self):
                return 1001

            def reqMktData(self, req_id, contract, generic_ticks, snapshot, regulatory_snapshot, options):
                self.request = (generic_ticks, snapshot)
                data = self.market_data[req_id]
                data.bid = 1.0
                data.ask = 1.2
                data.delta = 0.25
                data.gamma = 0.03
                data.call_open_interest = 123

            def cancelMktData(self, req_id):
                self.cancelled.append(req_id)

        provider = IbOptionChainProvider()
        provider.snapshot_grace_seconds = 0
        provider.option_stream_timeout = 0.1
        app = FakeApp()
        result = provider._fetch_contract_snapshot(
            app,
            SimpleNamespace(
                localSymbol='NBIS TEST',
                conId=12345,
                lastTradeDateOrContractMonth='20260717',
                strike=195.0,
                right='C',
            ),
            'NBIS',
        )

        self.assertEqual(app.request, ('100,101,106', False))
        self.assertEqual(app.cancelled, [1001])
        self.assertEqual((result.bid, result.ask, result.delta, result.gamma, result.open_interest), (1.0, 1.2, 0.25, 0.03, 123))

    def test_ib_option_contract_query_uses_expiry_right_and_trading_class_without_strike(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        provider = IbOptionChainProvider()
        contract = provider._option_contract_query(
            'NBIS',
            date(2026, 7, 17),
            'C',
            'NBIS',
        )

        self.assertEqual(contract.symbol, 'NBIS')
        self.assertEqual(contract.tradingClass, 'NBIS')
        self.assertEqual(contract.lastTradeDateOrContractMonth, '20260717')
        self.assertEqual(contract.right, 'C')
        self.assertEqual(contract.strike, 0.0)
        self.assertNotEqual(contract.tradingClass, 'NMS')

    def test_ib_delayed_data_notice_is_not_terminal(self):
        from providers.ib_option_chain_provider import _MarketData

        data = _MarketData()
        data.apply_error(10167, 'Requested market data is not subscribed. Displaying delayed market data.')

        self.assertFalse(data.has_terminal_error())

    def test_ib_contract_lookup_error_releases_waiter(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        source = inspect.getsource(IbOptionChainProvider._connect)

        self.assertIn('if reqId in self.contract_details_done:', source)
        self.assertIn('self.contract_details_done[reqId].set()', source)

    def test_ib_analysis_payload_requires_quote_greeks_and_matching_oi(self):
        from providers.ib_option_chain_provider import _MarketData

        data = _MarketData()
        data.bid = 1.0
        data.delta = 0.25
        data.gamma = 0.03
        data.call_open_interest = 100

        self.assertTrue(data.has_analysis_payload('C'))
        self.assertFalse(data.has_analysis_payload('P'))

    def test_ib_fetches_only_actual_contracts_returned_by_contract_details(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        class FakeApp:
            def __init__(self):
                self.contract_details_done = {}
                self.contract_details = {}

            def next_req_id(self):
                return 1001

            def reqContractDetails(self, req_id, contract):
                self.query = contract
                self.contract_details[req_id] = [
                    SimpleNamespace(contract=SimpleNamespace(
                        conId=101,
                        lastTradeDateOrContractMonth='20260717',
                        strike=195.0,
                        right='C',
                    )),
                    SimpleNamespace(contract=SimpleNamespace(
                        conId=0,
                        lastTradeDateOrContractMonth='20260717',
                        strike=197.5,
                        right='C',
                    )),
                    SimpleNamespace(contract=SimpleNamespace(
                        conId=102,
                        lastTradeDateOrContractMonth='20260814',
                        strike=195.0,
                        right='C',
                    )),
                ]
                self.contract_details_done[req_id].set()

        provider = IbOptionChainProvider()
        provider.timeout = 0.1
        app = FakeApp()

        contracts = provider._fetch_actual_option_contracts(
            app,
            'NBIS',
            date(2026, 7, 17),
            'C',
            'NBIS',
        )

        self.assertEqual([contract.conId for contract in contracts], [101])
        self.assertEqual(app.query.strike, 0.0)
        self.assertEqual(app.query.lastTradeDateOrContractMonth, '20260717')

    def test_ib_selects_from_actual_contracts_without_creating_missing_pairs(self):
        from providers.ib_option_chain_provider import IbOptionChainProvider

        provider = IbOptionChainProvider()
        actual = [
            SimpleNamespace(conId=1, strike=95.0, right='C'),
            SimpleNamespace(conId=2, strike=100.0, right='C'),
            SimpleNamespace(conId=3, strike=100.0, right='P'),
            SimpleNamespace(conId=4, strike=105.0, right='P'),
        ]

        selected = provider._select_actual_contracts(actual, 100.0, 10.0, 2)

        self.assertEqual({contract.conId for contract in selected}, {1, 2, 3, 4})
        self.assertNotIn((95.0, 'P'), {(contract.strike, contract.right) for contract in selected})
        self.assertNotIn((105.0, 'C'), {(contract.strike, contract.right) for contract in selected})


if __name__ == '__main__':
    unittest.main()
