"""
Cross-process provider pacing backed by PostgreSQL.

The file-lock pacer this replaces only constrains processes sharing a
filesystem. Once workers run on more than one machine -- Mac Studio plus a
Railway collector, or several Railway replicas -- each host keeps its own lock
file and paces independently, so N hosts issue N times the intended rate.

Two properties make this safe across hosts:

  * Slots are claimed atomically. A caller reserves the next free slot in one
    statement and is told how long to wait for it. Two workers racing get two
    distinct slots, never the same one.
  * The database clock is the only authority. Wait durations are computed in
    SQL, so workers whose system clocks disagree cannot both decide it is their
    turn.

The lock is never held while sleeping: the claim commits immediately and the
caller waits outside the transaction, so a paced request does not pin a
connection for the length of its delay.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable

log = logging.getLogger(__name__)

DEFAULT_SCOPE = 'default'
# How far out a slot may be and still be worth waiting for inline. Beyond this
# the caller is told to come back later instead of blocking.
MAX_WAIT_SECONDS = float(os.getenv('PROVIDER_RATE_LIMIT_MAX_WAIT', '300'))


class RateLimitDeferred(Exception):
    """The next slot is further out than the caller is willing to wait inline.

    Raised INSTEAD of claiming a slot, which is the whole point: the caller must
    not fire, and `next_allowed_at` must not advance. See the deadlock note on
    `_claim_slot`.
    """

    def __init__(self, provider: str, scope: str, wait_seconds: float) -> None:
        self.provider = provider
        self.scope = scope
        self.wait_seconds = wait_seconds
        super().__init__(
            f'{provider}/{scope} rate limit slot is {wait_seconds:.0f}s out; deferring'
        )


class DatabaseRequestPacer:
    """Paces requests to one (provider, scope) across every worker process."""

    def __init__(
        self,
        connect: Callable[[], Any],
        provider: str,
        scope: str = DEFAULT_SCOPE,
        delay: float = 0.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.connect = connect
        self.provider = provider
        self.scope = scope
        self.delay = max(float(delay), 0.0)
        self._sleep = sleep

    def wait(self, max_wait_seconds: float | None = None) -> float:
        """Claim the next request slot and block until it is due.

        Raises RateLimitDeferred when the slot is further out than
        `max_wait_seconds` (default MAX_WAIT_SECONDS); in that case no slot is
        claimed and the caller must not issue the request.

        Returns the seconds actually waited.
        """
        if self.delay <= 0:
            return 0.0

        limit = MAX_WAIT_SECONDS if max_wait_seconds is None else float(max_wait_seconds)
        wait_seconds = self._claim_slot(limit)
        if wait_seconds > 0:
            self._sleep(wait_seconds)
        return max(wait_seconds, 0.0)

    def _claim_slot(self, max_wait_seconds: float) -> float:
        """Reserve the next slot and return seconds until it is due.

        The claim is CONDITIONAL: the row advances only when the slot is already
        within `max_wait_seconds`. Otherwise nothing is written and
        RateLimitDeferred is raised.

        That condition is what breaks a deadlock this pacer used to create. The
        cap used to be applied by the caller AFTER an unconditional claim: the
        slot advanced by one delay, the caller slept the capped 300s instead of
        the real wait, then fired anyway. Against a provider that had just
        returned 429 -- which is exactly when `penalize` pushes the slot far out
        -- every worker therefore skipped the backoff it had just been given,
        earned a fresh 429, and pushed the slot further still, while each claim
        added another delay on top. Measured 2026-08-03: polygon/stocks sat
        1076s out with last_status=429 and climbing, the price collector was
        taking ~10 minutes per symbol, and daily prices had not advanced since
        the previous Friday.

        Declining to claim is what makes the backoff self-clearing: during a
        penalty nobody fires and nobody advances the row, so it simply drains
        with wall-clock time.
        """
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO provider_rate_limits (provider, scope, next_allowed_at, updated_at)
                    VALUES (%(provider)s, %(scope)s, NOW() + %(delay)s * INTERVAL '1 second', NOW())
                    ON CONFLICT (provider, scope) DO UPDATE
                    SET next_allowed_at =
                          GREATEST(provider_rate_limits.next_allowed_at, NOW())
                          + %(delay)s * INTERVAL '1 second',
                        updated_at = NOW()
                    WHERE provider_rate_limits.next_allowed_at
                          <= NOW() + %(max_wait)s * INTERVAL '1 second'
                    RETURNING EXTRACT(EPOCH FROM (
                      next_allowed_at - %(delay)s * INTERVAL '1 second' - NOW()
                    ))
                    """,
                    {
                        'provider': self.provider, 'scope': self.scope,
                        'delay': self.delay, 'max_wait': max_wait_seconds,
                    },
                )
                claimed = cur.fetchone()
                if claimed is None:
                    # The WHERE excluded the update, so read how far out it is
                    # purely to report it. No write, no advance.
                    cur.execute(
                        """
                        SELECT EXTRACT(EPOCH FROM (next_allowed_at - NOW()))
                        FROM provider_rate_limits
                        WHERE provider = %s AND scope = %s
                        """,
                        (self.provider, self.scope),
                    )
                    row = cur.fetchone()
                    conn.commit()
                    pending = float(row[0]) if row and row[0] is not None else max_wait_seconds
                    log.warning(
                        'provider %s/%s slot is %.0fs out (> %.0fs); deferring without claiming',
                        self.provider, self.scope, pending, max_wait_seconds,
                    )
                    raise RateLimitDeferred(self.provider, self.scope, pending)
                wait_seconds = float(claimed[0])
            conn.commit()
            return max(wait_seconds, 0.0)
        except RateLimitDeferred:
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def penalize(self, retry_after_seconds: float, status: str = '429') -> None:
        """Push the next slot out after a provider rejection.

        GREATEST keeps a longer existing penalty: concurrent 429s must not let a
        short Retry-After shorten a longer backoff already in force.
        """
        seconds = max(float(retry_after_seconds), 0.0)
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO provider_rate_limits (provider, scope, next_allowed_at, last_status, updated_at)
                    VALUES (%(provider)s, %(scope)s, NOW() + %(seconds)s * INTERVAL '1 second', %(status)s, NOW())
                    ON CONFLICT (provider, scope) DO UPDATE
                    SET next_allowed_at = GREATEST(
                          provider_rate_limits.next_allowed_at,
                          NOW() + %(seconds)s * INTERVAL '1 second'
                        ),
                        last_status = %(status)s,
                        updated_at = NOW()
                    """,
                    {'provider': self.provider, 'scope': self.scope, 'seconds': seconds, 'status': status},
                )
            conn.commit()
            log.warning(
                'provider %s/%s penalized for %.1fs after %s',
                self.provider, self.scope, seconds, status,
            )
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
