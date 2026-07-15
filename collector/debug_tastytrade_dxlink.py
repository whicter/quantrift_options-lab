"""
Probe tastytrade DXLink events for a small option-chain slice.

This prints raw event shapes so we can map every field tastytrade actually
provides for quotes, trades, Greeks, OI, and related option data.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from providers.tastytrade_dxlink import collect_dxlink_events
from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider

load_dotenv(Path(__file__).with_name('.env'))


def main() -> None:
    symbol = os.getenv('OPTION_DEBUG_SYMBOL', os.getenv('OPTION_SYMBOLS', 'PLTR').split(',')[0]).strip().upper()
    os.environ.setdefault('OPTION_MAX_CONTRACTS', '6')
    os.environ.setdefault('OPTION_MAX_STRIKES_PER_SIDE', '1')
    timeout = float(os.getenv('TT_DXLINK_TIMEOUT', '8'))

    provider = TastytradeOptionChainProvider()
    snapshot = provider.fetch_option_chain(symbol)
    token = provider.fetch_quote_token()

    streamer_symbols = []
    for contract in snapshot.contracts:
        streamer_symbol = (contract.raw or {}).get('streamer_symbol') or contract.provider_contract_id
        if streamer_symbol:
            streamer_symbols.append(streamer_symbol)

    raw = collect_dxlink_events(token, streamer_symbols, timeout_seconds=timeout)
    output = {
        'symbol': symbol,
        'source': provider.source,
        'dxlink': {
            'url': token.dxlink_url,
            'level': token.level,
            'expires_at': token.expires_at,
            'requested_symbols': raw['requested_symbols'],
            'requested_event_types': raw['requested_event_types'],
            'errors': raw['errors'],
        },
        'event_count': len(raw['events']),
        'events_by_symbol': raw['events_by_symbol'],
        'message_types': [message.get('type') for message in raw['messages']],
        'raw_messages_sample': raw['messages'][:8],
    }
    print(json.dumps(output, indent=2, sort_keys=True, default=str))


if __name__ == '__main__':
    main()
