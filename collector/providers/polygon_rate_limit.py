from __future__ import annotations

import fcntl
import os
import time
from pathlib import Path


class PolygonStockRequestPacer:
    """Serialize Stocks REST request starts across local collector processes."""

    def __init__(self, delay: float | None = None, state_path: str | None = None) -> None:
        legacy_delay = os.getenv('POLYGON_PRICE_REQUEST_DELAY', '16')
        self.delay = float(delay if delay is not None else os.getenv('POLYGON_STOCK_REQUEST_DELAY', legacy_delay))
        self.state_path = Path(
            state_path or os.getenv('POLYGON_STOCK_RATE_LIMIT_FILE', '/tmp/quantrift_polygon_stock_rate_limit')
        )

    def wait(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.state_path.open('a+', encoding='ascii') as state_file:
            fcntl.flock(state_file.fileno(), fcntl.LOCK_EX)
            try:
                state_file.seek(0)
                last_request_at = _parse_timestamp(state_file.read())
                now = time.time()
                remaining = self.delay - (now - last_request_at)
                if remaining > 0:
                    time.sleep(remaining)
                state_file.seek(0)
                state_file.truncate()
                state_file.write(str(time.time()))
                state_file.flush()
            finally:
                fcntl.flock(state_file.fileno(), fcntl.LOCK_UN)


def _parse_timestamp(value: str) -> float:
    try:
        return float(value.strip())
    except (TypeError, ValueError):
        return 0.0
