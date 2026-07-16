from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class PriceBar:
    symbol: str
    date: date
    open: float | None
    high: float | None
    low: float | None
    close: float
    volume: int | None
    source: str


@dataclass(frozen=True)
class IntradayPriceBar:
    symbol: str
    bar_ts: datetime
    open: float | None
    high: float | None
    low: float | None
    close: float
    volume: int | None
    vwap: float | None
    trade_count: int | None
    source: str


class PriceProvider(Protocol):
    source: str

    def fetch_daily_bars(self, symbol: str, limit: int = 60) -> list[PriceBar]:
        """Return daily OHLCV bars sorted ascending by date."""
        ...


class IntradayPriceProvider(Protocol):
    source: str

    def fetch_30m_bars(self, symbol: str, lookback_days: int = 35) -> list[IntradayPriceBar]:
        """Return 30-minute OHLCV bars sorted ascending by UTC bar timestamp."""
        ...


OptionRight = Literal['C', 'P']


@dataclass(frozen=True)
class UnderlyingSnapshot:
    symbol: str
    price: float | None
    bid: float | None
    ask: float | None
    timestamp: datetime
    source: str
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class OptionContractSnapshot:
    symbol: str
    expiry: date
    strike: float
    right: OptionRight
    bid: float | None
    ask: float | None
    last: float | None
    mark: float | None
    volume: int | None
    open_interest: int | None
    iv: float | None
    delta: float | None
    gamma: float | None
    theta: float | None
    vega: float | None
    rho: float | None
    bid_size: int | None = None
    ask_size: int | None = None
    contract_symbol: str | None = None
    local_symbol: str | None = None
    con_id: int | None = None
    provider_contract_id: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class OptionChainSnapshot:
    symbol: str
    underlying: UnderlyingSnapshot
    contracts: list[OptionContractSnapshot]
    snapshot_ts: datetime
    source: str
    provider_status: str = 'ok'
    provider_snapshot_id: str | None = None
    raw_metadata: dict[str, Any] | None = None


class OptionChainProvider(Protocol):
    source: str

    def fetch_underlying(self, symbol: str) -> UnderlyingSnapshot:
        """Return the latest underlying quote/price snapshot for one symbol."""
        ...

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
    ) -> OptionChainSnapshot:
        """Return a bounded option-chain snapshot suitable for persistence."""
        ...
