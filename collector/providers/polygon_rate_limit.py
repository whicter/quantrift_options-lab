from __future__ import annotations

import fcntl
import logging
import os
import time
from pathlib import Path

from .provider_rate_limit import RateLimitDeferred

log = logging.getLogger(__name__)


class PolygonStockRequestPacer:
    """Serialize Polygon Stocks REST request starts across collector processes.

    Backed by PostgreSQL when DATABASE_URL is configured, so pacing holds across
    machines and Railway replicas. Falls back to a local file lock only when
    there is no database, which is correct for a single host but cannot
    coordinate more than one.
    """

    def __init__(
        self,
        delay: float | None = None,
        state_path: str | None = None,
        scope: str = 'stocks',
        connect=None,
    ) -> None:
        # Per-scope delay, falling back to the stock value. Scopes were split so
        # option pagination would stop queueing behind the price sweep, but only
        # the counters were separated -- the interval still came from
        # POLYGON_STOCK_REQUEST_DELAY, so options inherited 16s that originated
        # as a price-collection default and was never measured against the
        # options endpoints.
        #
        # The cost was the dominant term in chain freshness: a chain fetch issues
        # ~35 requests (DTE-bucket pages, term structure, OI-by-strike), so 16s
        # each is ~9 minutes of deliberate sleeping inside a measured 601s median
        # job. That is why most symbols were refreshed once per session and a
        # quarter of the universe carried overnight data at the close -- the
        # 15-minute provider delay was never the binding constraint, we were.
        #
        # Probed 2026-08-15 against /v3/snapshot/options: 8 consecutive requests
        # at 1.0s, 0.5s and 0.25s intervals all returned 200. Safe to lower well
        # below 16s, and `penalize()` backs every worker off globally on a 429,
        # so there is a real brake if the ceiling is ever reached.
        scope_env = f'POLYGON_{scope.upper()}_REQUEST_DELAY'
        legacy_delay = os.getenv('POLYGON_PRICE_REQUEST_DELAY', '16')
        stock_delay = os.getenv('POLYGON_STOCK_REQUEST_DELAY', legacy_delay)
        self.delay = float(
            delay if delay is not None
            else os.getenv(scope_env, stock_delay)
        )
        self.state_path = Path(
            state_path or os.getenv('POLYGON_STOCK_RATE_LIMIT_FILE', '/tmp/quantrift_polygon_stock_rate_limit')
        )
        self.scope = scope
        self._db_pacer = self._make_db_pacer(connect)

    def _make_db_pacer(self, connect):
        if os.getenv('PROVIDER_RATE_LIMIT_BACKEND', 'database').strip().lower() == 'file':
            return None
        if connect is None:
            db_url = os.getenv('DATABASE_URL')
            if not db_url:
                log.warning(
                    'DATABASE_URL unset; Polygon pacing falls back to a local file lock '
                    'and cannot coordinate other hosts'
                )
                return None

            def connect():  # noqa: E306
                import psycopg2
                return psycopg2.connect(db_url)

        from .provider_rate_limit import DatabaseRequestPacer
        return DatabaseRequestPacer(
            connect=connect, provider='polygon', scope=self.scope, delay=self.delay,
        )

    def wait(self) -> None:
        if self._db_pacer is not None:
            try:
                self._db_pacer.wait()
                return
            except RateLimitDeferred:
                # NOT a pacer failure -- it is the pacer working. The slot is
                # beyond the inline wait budget (almost always an active 429
                # penalty), so the caller must back off rather than fire. Falling
                # through to the local lock here would reintroduce the exact
                # deadlock the conditional claim exists to prevent: bypass the
                # backoff, earn another 429, push the slot further out.
                raise
            except Exception as exc:
                # Pacing must never take the collector down. Degrade to the local
                # lock, which still bounds this host, and say so rather than
                # silently issuing unpaced requests.
                log.error('shared provider pacing unavailable, using local lock: %s', exc)
        self._wait_file_lock()

    def penalize(self, retry_after_seconds: float, status: str = '429') -> None:
        """Back every worker off this provider, not just this process.

        A local sleep after a 429 pauses one worker while the others keep
        hammering, which is what turns a single rejection into a storm.
        """
        if self._db_pacer is not None:
            try:
                self._db_pacer.penalize(retry_after_seconds, status)
                return
            except Exception as exc:
                log.error('shared provider penalty unavailable, sleeping locally: %s', exc)
        time.sleep(max(float(retry_after_seconds), 0.0))

    def _wait_file_lock(self) -> None:
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
