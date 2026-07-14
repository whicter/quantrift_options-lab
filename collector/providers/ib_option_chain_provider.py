from __future__ import annotations

from datetime import date

from .base import OptionChainSnapshot, UnderlyingSnapshot


class IbOptionChainProvider:
    """Internal IB Gateway adapter skeleton for Phase 3D.

    This adapter is intentionally not wired to production APIs. It will be used
    to validate the provider contract and snapshot schema before a licensed
    options-data provider is integrated.
    """

    source = 'ib_internal'

    def __init__(
        self,
        host: str = '127.0.0.1',
        port: int = 7497,
        client_id: int = 42,
        timeout: float = 30.0,
    ) -> None:
        self.host = host
        self.port = port
        self.client_id = client_id
        self.timeout = timeout

    def fetch_underlying(self, symbol: str) -> UnderlyingSnapshot:
        raise NotImplementedError('IB option-chain underlying fetch is planned for Phase 3D-2')

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
    ) -> OptionChainSnapshot:
        raise NotImplementedError('IB option-chain snapshot fetch is planned for Phase 3D-2')
