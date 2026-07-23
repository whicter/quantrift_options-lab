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
# A claimed slot should never park a worker indefinitely. Bounds a
# misconfigured delay or a provider penalty from stalling the queue silently.
MAX_WAIT_SECONDS = float(os.getenv('PROVIDER_RATE_LIMIT_MAX_WAIT', '300'))


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

    def wait(self) -> float:
        """Claim the next request slot and block until it is due.

        Returns the seconds actually waited.
        """
        if self.delay <= 0:
            return 0.0

        wait_seconds = self._claim_slot()
        if wait_seconds > MAX_WAIT_SECONDS:
            log.warning(
                'provider %s/%s slot is %.1fs out; capping wait at %.1fs',
                self.provider, self.scope, wait_seconds, MAX_WAIT_SECONDS,
            )
            wait_seconds = MAX_WAIT_SECONDS
        if wait_seconds > 0:
            self._sleep(wait_seconds)
        return max(wait_seconds, 0.0)

    def _claim_slot(self) -> float:
        """Reserve the next slot and return seconds until it is due.

        Both branches resolve to the same rule: this caller fires at
        max(next_allowed_at, now) and pushes the next slot one delay past that.
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
                    RETURNING EXTRACT(EPOCH FROM (
                      next_allowed_at - %(delay)s * INTERVAL '1 second' - NOW()
                    ))
                    """,
                    {'provider': self.provider, 'scope': self.scope, 'delay': self.delay},
                )
                wait_seconds = float(cur.fetchone()[0])
            conn.commit()
            return max(wait_seconds, 0.0)
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
