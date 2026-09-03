"""Day-scoped cache of the option contracts IB actually lists.

Discovery, not quoting, is the larger half of a quote job. Regressing job
duration on chain shape over the 439 `option_quote_snapshot` jobs of
2026-08-25..27 (R2 = 0.95 on the 206 whose chain came back with complete open
interest):

    seconds = -3.5 + 7.94 * expiries + 8.21 * batches

A typical symbol is 3 expiries and 3 batches of 40, so roughly 24s of a 46s job
is six `reqContractDetails` round trips -- call and put per expiry -- returning a
median 258 contracts of which 100 are kept. The listed strike ladder does not
move on a timescale that pays for asking again: IB adds strikes when spot travels
far enough to need them, not continuously.

So the ladder is fetched once per (symbol, expiry, right) per trading day and
read back from PostgreSQL after that. `conId` is what the quote path actually
needs, and a conId is permanent for the life of the contract.

The cache is used ONLY when it cannot change the answer. `lookup` returns a
ladder when that ladder either spans the whole requested strike window or already
supplies the full `max_per_side` complement on both sides of spot -- in both
cases a strike listed since the fetch would not have been selected. Anything
else, including a ladder that runs out on one side, is a miss and goes to IB.
That is deliberately conservative: the failure mode of a wrong hit is quoting a
window we cannot cover, and a miss only costs what the code cost before.
"""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Any, Callable

log = logging.getLogger(__name__)


def _default_connect():
    import psycopg2

    url = os.getenv('DATABASE_URL')
    if not url:
        return None
    return psycopg2.connect(url)


class OptionContractRegistry:
    """Reads and writes `option_contract_registry`.

    Every method is best effort. A cache that raises would turn a latency
    optimisation into an outage, so a database that is down, missing or
    unmigrated degrades to the behaviour this replaced: ask IB every time.
    """

    def __init__(self, connect: Callable[[], Any] | None = None, enabled: bool | None = None) -> None:
        self._connect = connect or _default_connect
        if enabled is None:
            enabled = os.getenv('IB_OPTION_CONTRACT_CACHE_ENABLED', 'true').strip().lower() not in (
                '0', 'false', 'no', 'off',
            )
        self.enabled = bool(enabled)
        # Backstop, not a tuning knob. Correctness comes from the strike-set and
        # geometry checks in lookup(); this only bounds how long a ladder that
        # somehow slipped both could stay in play.
        self.max_age_days = max(int(os.getenv('IB_OPTION_CONTRACT_CACHE_MAX_AGE_DAYS', '30')), 0)
        # Counted per fetch so the saving is measurable from raw_metadata rather
        # than argued from the design.
        self.hits = 0
        self.misses = 0
        self.stale_reasons: list[str] = []

    def reset_counters(self) -> None:
        self.hits = 0
        self.misses = 0
        self.stale_reasons = []

    # -- reads ---------------------------------------------------------------

    def lookup(
        self,
        symbol: str,
        expiry: date,
        right: str,
        spot: float,
        window_pct: float,
        max_per_side: int,
        as_of: date | None = None,
        valid_strikes: set[float] | None = None,
    ) -> list[dict[str, Any]] | None:
        if not self.enabled:
            return None
        rows = self._read_ladder(symbol, expiry, right, as_of or date.today())
        if not rows:
            self.misses += 1
            self.stale_reasons.append('no_rows')
            return None
        reason = (
            self._strike_set_changed(rows, valid_strikes)
            or self._insufficient_reason(rows, spot, window_pct, max_per_side)
        )
        if reason:
            self.misses += 1
            self.stale_reasons.append(reason)
            return None
        self.hits += 1
        return rows

    @staticmethod
    def _strike_set_changed(rows: list[dict[str, Any]], valid_strikes: set[float] | None) -> str | None:
        """Reject a ladder IB no longer agrees with.

        Every fetch already calls reqSecDefOptParams, which returns the strike
        set IB lists for the symbol right now, so cross-checking costs nothing.
        This is what makes a ladder safe to keep past the day it was fetched: a
        split or other corporate action does not add strikes at the edge, where
        `_insufficient_reason` would catch it -- it replaces the ladder wholesale
        while the old conIds stay resolvable as adjusted contracts with a
        non-standard deliverable. That is the one drift the geometry rule cannot
        see, and the one that would quote the wrong thing rather than nothing.

        Absent a live strike set the check is skipped rather than assumed: the
        caller not supplying one must not silently become a stricter cache.
        """
        if not valid_strikes:
            return None
        # A tolerance, because strikes cross a float boundary between IB's wire
        # format and NUMERIC(18,4).
        listed = sorted(valid_strikes)
        for row in rows:
            strike = row['strike']
            if not any(abs(strike - candidate) < 1e-4 for candidate in listed):
                return 'strike_set_changed'
        return None

    def _read_ladder(self, symbol: str, expiry: date, right: str, as_of: date) -> list[dict[str, Any]]:
        conn = None
        try:
            conn = self._connect()
            if conn is None:
                return []
            with conn, conn.cursor() as cur:
                # Newest ladder within the backstop window, not one specific day.
                #
                # Scoping this to `refreshed_on = today` made the cache
                # structurally unable to hit: measured 2026-08-31, all 141
                # quoted symbols were visited exactly once each, so every read
                # preceded that symbol's only write of the day. 724 lookups, 1
                # hit, every miss `no_rows` -- while the table filled correctly
                # with 45,721 rows. The daily scope was belt on top of braces,
                # and it was the belt that cost 22.1s per symbol.
                #
                # What actually guards correctness is the pair of checks in
                # lookup(): the live strike set from reqSecDefOptParams, and the
                # geometry rule. The age bound is only a backstop on how far a
                # bad ladder could propagate, so it is generous by design rather
                # than tuned -- options here expire inside ~90 days anyway.
                cur.execute(
                    """
                    SELECT con_id, strike, trading_class, exchange, multiplier, currency
                    FROM option_contract_registry
                    WHERE symbol = %s AND expiry = %s AND option_right = %s
                      AND refreshed_on >= %s
                      AND refreshed_on = (
                        SELECT MAX(refreshed_on) FROM option_contract_registry
                        WHERE symbol = %s AND expiry = %s AND option_right = %s
                      )
                    ORDER BY strike
                    """,
                    (symbol, expiry, right, as_of - timedelta(days=self.max_age_days),
                     symbol, expiry, right),
                )
                return [
                    {
                        'con_id': int(row[0]),
                        'strike': float(row[1]),
                        'trading_class': row[2],
                        'exchange': row[3],
                        'multiplier': row[4],
                        'currency': row[5],
                        'right': right,
                        'expiry': expiry,
                    }
                    for row in cur.fetchall()
                ]
        except Exception as exc:  # noqa: BLE001 -- a cache must never be the failure
            log.warning('option contract registry read failed for %s %s %s: %s', symbol, expiry, right, exc)
            return []
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass

    @staticmethod
    def _insufficient_reason(
        rows: list[dict[str, Any]],
        spot: float,
        window_pct: float,
        max_per_side: int,
    ) -> str | None:
        """None when the cached ladder cannot change the selection.

        Two independent ways to be sure of that. Either the ladder already spans
        the whole window, so no strike we would consider is missing from it; or
        it supplies the full complement on both sides, so a strike listed beyond
        its edge since the fetch would have been ranked out anyway.
        """
        strikes = sorted(row['strike'] for row in rows)
        if not strikes:
            return 'no_rows'
        low = spot * (1 - window_pct / 100)
        high = spot * (1 + window_pct / 100)
        if strikes[0] <= low and strikes[-1] >= high:
            return None
        below = [strike for strike in strikes if low <= strike < spot]
        above = [strike for strike in strikes if spot <= strike <= high]
        if len(below) >= max_per_side and len(above) >= max_per_side + 1:
            return None
        return 'ladder_short_of_window'

    # -- writes --------------------------------------------------------------

    def store(
        self,
        symbol: str,
        expiry: date,
        right: str,
        contracts: list[Any],
        as_of: date | None = None,
    ) -> None:
        """Record the full ladder IB returned. Never the selected subset.

        Storing only what was quoted would make the next read look like a short
        ladder and force a refetch, which is the cost this exists to avoid.
        """
        if not self.enabled or not contracts:
            return
        payload = []
        for contract in contracts:
            con_id = int(getattr(contract, 'conId', 0) or 0)
            strike = float(getattr(contract, 'strike', 0) or 0)
            if con_id <= 0 or strike <= 0:
                continue
            payload.append((
                symbol, expiry, right, strike, con_id,
                getattr(contract, 'tradingClass', None) or None,
                getattr(contract, 'exchange', None) or None,
                str(getattr(contract, 'multiplier', '') or '') or None,
                getattr(contract, 'currency', None) or None,
                as_of or date.today(),
            ))
        if not payload:
            return
        conn = None
        try:
            from psycopg2.extras import execute_values

            conn = self._connect()
            if conn is None:
                return
            with conn, conn.cursor() as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO option_contract_registry
                      (symbol, expiry, option_right, strike, con_id,
                       trading_class, exchange, multiplier, currency, refreshed_on)
                    VALUES %s
                    ON CONFLICT (symbol, expiry, option_right, strike) DO UPDATE SET
                      con_id = EXCLUDED.con_id,
                      trading_class = EXCLUDED.trading_class,
                      exchange = EXCLUDED.exchange,
                      multiplier = EXCLUDED.multiplier,
                      currency = EXCLUDED.currency,
                      refreshed_on = EXCLUDED.refreshed_on,
                      refreshed_at = NOW()
                    """,
                    payload,
                    page_size=len(payload),
                )
        except Exception as exc:  # noqa: BLE001 -- a cache must never be the failure
            log.warning('option contract registry write failed for %s %s %s: %s', symbol, expiry, right, exc)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass
