"""
Print a bounded tastytrade option-chain metadata snapshot.

This is a diagnostic probe for the transitional tt_internal provider. It does
not write to PostgreSQL and does not require DXLink streaming yet.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider

load_dotenv(Path(__file__).with_name('.env'))


def main() -> None:
    symbol = os.getenv('OPTION_DEBUG_SYMBOL', os.getenv('OPTION_SYMBOLS', 'PLTR').split(',')[0]).strip().upper()
    os.environ.setdefault('OPTION_MAX_CONTRACTS', '10')
    os.environ.setdefault('OPTION_MAX_STRIKES_PER_SIDE', '2')

    provider = TastytradeOptionChainProvider()
    snapshot = provider.fetch_option_chain(symbol)

    print(json.dumps({
        'symbol': snapshot.symbol,
        'source': snapshot.source,
        'provider_status': snapshot.provider_status,
        'snapshot_ts': snapshot.snapshot_ts.isoformat(),
        'underlying': {
            'price': snapshot.underlying.price,
            'raw': snapshot.underlying.raw,
        },
        'metadata': snapshot.raw_metadata,
        'contracts': [
            {
                'expiry': contract.expiry.isoformat(),
                'strike': contract.strike,
                'right': contract.right,
                'contract_symbol': contract.contract_symbol,
                'provider_contract_id': contract.provider_contract_id,
                'raw': contract.raw,
            }
            for contract in snapshot.contracts
        ],
    }, indent=2, sort_keys=True, default=str))


if __name__ == '__main__':
    main()
