import unittest
from datetime import date, datetime, timezone

from materialize_oi_delta import build_delta_rows, contract_key


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

    def test_daily_comparison_uses_previous_session_oi(self):
        latest = {
            'id': 2,
            'symbol': 'AMZN',
            'source': 'polygon_licensed',
            'snapshot_ts': datetime(2026, 7, 16, 19, tzinfo=timezone.utc),
        }
        previous = {
            'id': 1,
            'symbol': 'AMZN',
            'source': 'polygon_licensed',
            'snapshot_ts': datetime(2026, 7, 15, 19, tzinfo=timezone.utc),
        }
        contract = {
            'contract_symbol': 'AMZN-20260722-C-255',
            'expiry': date(2026, 7, 22),
            'strike': 255,
            'option_right': 'C',
            'open_interest': 820,
            'volume': 400,
        }
        previous_contract = {**contract, 'open_interest': 700}

        row = build_delta_rows(latest, previous, [contract], [previous_contract])[0]

        self.assertEqual(row['status'], 'confirmed')
        self.assertEqual(row['previous_open_interest'], 700)
        self.assertEqual(row['oi_delta'], 120)

    def test_first_session_is_baseline_not_zero_delta(self):
        latest = {
            'id': 2,
            'symbol': 'AMZN',
            'source': 'polygon_licensed',
            'snapshot_ts': datetime(2026, 7, 16, 19, tzinfo=timezone.utc),
        }
        contract = {
            'contract_symbol': 'AMZN-20260722-C-255',
            'expiry': date(2026, 7, 22),
            'strike': 255,
            'option_right': 'C',
            'open_interest': 820,
            'volume': 400,
        }

        row = build_delta_rows(latest, None, [contract], [])[0]

        self.assertEqual(row['status'], 'baseline')
        self.assertIsNone(row['oi_delta'])


if __name__ == '__main__':
    unittest.main()
