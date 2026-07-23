"""
Print raw IB option ticks for a bounded chain request.

Use this when option quotes, Greeks, or OI look empty. The output shows exactly
which tick IDs IB returned for each selected contract, plus per-request errors.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from providers.ib_option_chain_provider import IbOptionChainProvider

load_dotenv(Path(__file__).with_name('.env'))


def main() -> None:
    symbol = os.getenv('OPTION_DEBUG_SYMBOL', os.getenv('OPTION_SYMBOLS', 'PLTR').split(',')[0]).strip().upper()
    os.environ.setdefault('OPTION_MAX_CONTRACTS', '6')
    os.environ.setdefault('OPTION_MAX_STRIKES_PER_SIDE', '1')
    os.environ.setdefault('IB_OPTION_SNAPSHOT_GRACE_SECONDS', '3')

    provider = IbOptionChainProvider()
    snapshot = provider.fetch_option_chain(symbol)

    print(json.dumps({
        'symbol': snapshot.symbol,
        'source': snapshot.source,
        'provider_status': snapshot.provider_status,
        'snapshot_ts': snapshot.snapshot_ts.isoformat(),
        'underlying': {
            'price': snapshot.underlying.price,
            'bid': snapshot.underlying.bid,
            'ask': snapshot.underlying.ask,
            'raw': snapshot.underlying.raw,
        },
        'metadata': snapshot.raw_metadata,
        'contracts': [
            {
                'expiry': contract.expiry.isoformat(),
                'strike': contract.strike,
                'right': contract.right,
                'bid': contract.bid,
                'ask': contract.ask,
                'last': contract.last,
                'mark': contract.mark,
                'volume': contract.volume,
                'open_interest': contract.open_interest,
                'iv': contract.iv,
                'delta': contract.delta,
                'gamma': contract.gamma,
                'theta': contract.theta,
                'vega': contract.vega,
                'raw': contract.raw,
            }
            for contract in snapshot.contracts
        ],
    }, indent=2, sort_keys=True, default=str))


if __name__ == '__main__':
    main()
