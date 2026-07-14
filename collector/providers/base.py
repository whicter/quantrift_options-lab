from dataclasses import dataclass
from datetime import date
from typing import Protocol


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


class PriceProvider(Protocol):
    source: str

    def fetch_daily_bars(self, symbol: str, limit: int = 60) -> list[PriceBar]:
        """Return daily OHLCV bars sorted ascending by date."""
        ...
