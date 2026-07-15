import unittest
from datetime import date

from materialize_oi_delta import contract_key


class MaterializeOiDeltaTest(unittest.TestCase):
    def test_underlying_symbol_is_not_used_as_contract_key(self):
        row = {
            'symbol': 'STX',
            'contract_symbol': 'STX',
            'provider_contract_id': None,
            'expiry': date(2026, 7, 17),
            'strike': 875,
            'option_right': 'C',
        }
        self.assertEqual(contract_key(row), '2026-07-17|875|C')

    def test_real_contract_symbol_is_used_when_available(self):
        row = {
            'symbol': 'STX',
            'contract_symbol': 'STX-20260717-C-875',
            'provider_contract_id': None,
            'expiry': date(2026, 7, 17),
            'strike': 875,
            'option_right': 'C',
        }
        self.assertEqual(contract_key(row), 'STX-20260717-C-875')


if __name__ == '__main__':
    unittest.main()
