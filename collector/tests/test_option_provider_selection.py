import os
import unittest
from datetime import date, timedelta
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


if __name__ == '__main__':
    unittest.main()
