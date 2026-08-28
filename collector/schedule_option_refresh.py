from __future__ import annotations

import logging
import os
from datetime import datetime, time as dt_time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any

import psycopg2
from psycopg2.extras import Json

from collector_runtime import configure_logging, load_collector_env
from common import load_watchlist


load_collector_env(__file__)

log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
REFRESH_PROVIDER = os.getenv('OPTION_REFRESH_PROVIDER', 'tt_internal').strip().lower()
MAX_AGE_MINUTES = max(int(os.getenv('OPTION_REFRESH_MAX_AGE_MINUTES', '60')), 1)
RETRY_COOLDOWN_MINUTES = max(
    int(os.getenv('OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES',
                  os.getenv('OPTION_REFRESH_RETRY_COOLDOWN_MINUTES', '30'))),
    1,
)

# Keep the queue filled to a target depth instead of enqueuing a fixed 2 per
# cycle. At 2 per 300s a 78-symbol universe took ~195 minutes for one pass.
# Depth is what bounds provider load; the per-cycle cap only limits how fast a
# drained queue refills.
QUEUE_TARGET = max(int(os.getenv('OPTION_REFRESH_QUEUE_TARGET', '20')), 1)
MAX_ENQUEUE_PER_CYCLE = max(int(os.getenv('OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE', '20')), 1)
RECENT_ACTIVE_HOURS = max(int(os.getenv('OPTION_REFRESH_RECENT_ACTIVE_HOURS', '24')), 1)
CORE_SYMBOLS = [
    symbol.strip().upper()
    for symbol in os.getenv('OPTION_REFRESH_CORE_SYMBOLS', 'SPY,QQQ,AAPL,TSLA,PLTR').split(',')
    if symbol.strip()
]

# Priority ladder. The value is written into request_params.priority and the
# worker claims jobs by it, so these must stay below the API's on-demand 100:
# a background sweep may never outrank a user waiting on a page.
PRIORITY_USER_REQUESTED = 100
PRIORITY_CORE = 80
PRIORITY_RECENT_ACTIVE = 60
PRIORITY_UNIVERSE_SCAN = 40
PRIORITY_COLD_BACKFILL = 20

TIER_NAMES = {
    PRIORITY_USER_REQUESTED: 'user_requested',
    PRIORITY_CORE: 'core',
    PRIORITY_RECENT_ACTIVE: 'recent_active',
    PRIORITY_UNIVERSE_SCAN: 'universe_scan',
    PRIORITY_COLD_BACKFILL: 'cold_backfill',
}

MARKET_TIMEZONE = ZoneInfo('America/New_York')
_REGULAR_OPEN = dt_time(9, 30)
_REGULAR_CLOSE = dt_time(16, 0)
# After the close, one pass captures the settled chain. Before the open, one
# pass captures the open interest OCC publishes overnight -- the only field that
# actually changes while the market is shut.
_SETTLEMENT_OPEN = dt_time(16, 15)
_SETTLEMENT_CLOSE = dt_time(17, 15)
_PREOPEN_OPEN = dt_time(8, 0)
_PREOPEN_CLOSE = dt_time(9, 15)

MARKET_HOURS_GATE_ENABLED = os.getenv(
    'OPTION_REFRESH_MARKET_HOURS_GATE', 'true').strip().lower() in ('1', 'true', 'yes')


def refresh_window(now_et: datetime | None = None) -> tuple[str, int | None]:
    """Which refresh regime the clock is in, and the staleness bar for it.

    Measured 2026-08-28: refresh volume was FLAT across all 24 hours, so 71% of
    every chain fetch happened while the market was shut. Greeks, IV and open
    interest cannot change then -- 93% of stored snapshots carried a byte-identical
    strike->OI map -- so that 71% was the pipeline re-reading its own output.
    It mattered because the pipeline was saturated: 73.4h of serial work per day,
    24.5h of wall time at concurrency 3, against a 24-hour day.

    Returns (window, max_age_minutes). Outside the regular session the bar is
    measured from the window's anchor rather than a fixed age, which yields
    exactly one refresh per symbol per window: a symbol already refreshed after
    the close is not stale relative to the close.

    Holidays are deliberately not modelled, matching `is_regular_us_session`.
    A holiday costs one day of regular-session cadence against data that did not
    move -- roughly nine days a year, next to the 71% this removes.
    """
    now_et = now_et or datetime.now(timezone.utc).astimezone(MARKET_TIMEZONE)
    if now_et.weekday() >= 5:
        return 'idle', None
    clock = now_et.timetz().replace(tzinfo=None)

    if _REGULAR_OPEN <= clock < _REGULAR_CLOSE:
        return 'regular', MAX_AGE_MINUTES

    def _minutes_since(anchor: dt_time) -> int:
        anchored = now_et.replace(hour=anchor.hour, minute=anchor.minute,
                                  second=0, microsecond=0)
        return max(int((now_et - anchored).total_seconds() // 60), 1)

    if _SETTLEMENT_OPEN <= clock < _SETTLEMENT_CLOSE:
        return 'settlement', _minutes_since(_REGULAR_CLOSE)
    if _PREOPEN_OPEN <= clock < _PREOPEN_CLOSE:
        return 'preopen', _minutes_since(_PREOPEN_OPEN)
    return 'idle', None


def assign_tiers(symbols: list[str], scan_enabled: set[str], recent_active: set[str]) -> dict[str, int]:
    """Assign each symbol its refresh priority tier.

    Tiers describe who wants the data, not how old it is. Staleness orders
    symbols within a tier; it never promotes one above another tier.
    """
    tiers: dict[str, int] = {}
    for symbol in symbols:
        if symbol in CORE_SYMBOLS:
            tiers[symbol] = PRIORITY_CORE
        elif symbol in recent_active:
            tiers[symbol] = PRIORITY_RECENT_ACTIVE
        elif symbol in scan_enabled:
            tiers[symbol] = PRIORITY_UNIVERSE_SCAN
        else:
            tiers[symbol] = PRIORITY_COLD_BACKFILL
    return tiers


def select_candidates(
    symbols: list[str],
    latest_snapshots: dict[str, datetime],
    recent_jobs: set[str],
    now: datetime,
    max_age_minutes: int,
    limit: int,
    tiers: dict[str, int] | None = None,
) -> list[str]:
    """Pick which symbols to refresh, highest priority and oldest data first.

    With no tiers supplied every symbol ranks equally and ordering reduces to
    missing-first then oldest-first.
    """
    tiers = tiers or {}
    cutoff = now - timedelta(minutes=max_age_minutes)
    eligible = [
        symbol
        for symbol in symbols
        if symbol not in recent_jobs
        and (
            symbol not in latest_snapshots
            or latest_snapshots[symbol] is None
            or latest_snapshots[symbol] < cutoff
        )
    ]
    return sorted(
        eligible,
        key=lambda symbol: (
            -tiers.get(symbol, 0),
            symbol in latest_snapshots and latest_snapshots[symbol] is not None,
            latest_snapshots.get(symbol) or datetime.min.replace(tzinfo=timezone.utc),
            symbols.index(symbol),
        ),
    )[:limit]


def fill_count(
    queue_depth: int,
    queue_target: int = QUEUE_TARGET,
    max_per_cycle: int = MAX_ENQUEUE_PER_CYCLE,
    remaining_budget: int | None = None,
) -> int:
    """How many jobs to add this cycle.

    Bounded by three limits: the target queue depth, the per-cycle cap, and the
    provider's remaining daily budget. Without the budget bound, filling the
    queue to depth would enqueue jobs that immediately fail once the budget is
    spent -- pure churn that marks rows failed for nothing.
    """
    capacity = min(queue_target - queue_depth, max_per_cycle)
    if remaining_budget is not None:
        capacity = min(capacity, remaining_budget)
    return max(0, capacity)


def load_remaining_budget(conn, provider: str, job_type: str = 'option_chain_snapshot') -> int | None:
    """Provider requests left in today's budget, or None when uncapped.

    Reads the same provider_request_usage row the worker reserves against, so
    the scheduler stops filling before the worker starts failing on budget.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT request_count, request_budget
            FROM provider_request_usage
            WHERE provider = %s AND usage_date = CURRENT_DATE AND job_type = %s
            """,
            (provider, job_type),
        )
        row = cur.fetchone()
    if not row or row[1] is None:
        return None
    request_count, request_budget = row
    return max(0, int(request_budget) - int(request_count))


def load_universe(conn) -> tuple[list[str], set[str]]:
    """Load refresh candidates from symbol_universe.

    watchlist.txt is only a seed. The persistent universe is the registry, and
    it grows when a user analyzes an unknown symbol, so reading the file would
    permanently exclude on-demand symbols from background refresh.
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT symbol, scan_enabled
                FROM symbol_universe
                WHERE active = TRUE
                ORDER BY scan_enabled DESC, symbol
                """
            )
            rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        log.warning('symbol_universe missing; falling back to watchlist seed')
        return load_watchlist(), set()

    if not rows:
        log.warning('symbol_universe empty; falling back to watchlist seed')
        return load_watchlist(), set()

    symbols = [row[0] for row in rows]
    scan_enabled = {row[0] for row in rows if row[1]}
    return symbols, scan_enabled


def load_queue_depth(conn) -> int:
    """Outstanding option-chain jobs, whoever queued them.

    Counts on-demand jobs too: they consume the same provider budget, so a burst
    of user requests must throttle the background sweep rather than stack on it.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM provider_fetch_jobs
            WHERE job_type = 'option_chain_snapshot'
              AND status IN ('queued', 'running')
            """
        )
        return int(cur.fetchone()[0])


def load_recent_active(conn, hours: int) -> set[str]:
    """Symbols a user recently drove through Analyze."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT symbol
            FROM provider_fetch_jobs
            WHERE created_at >= NOW() - (%s::int * INTERVAL '1 hour')
              AND request_params->>'reason' LIKE 'analyze_on_demand%%'
            """,
            (hours,),
        )
        return {row[0] for row in cur.fetchall()}


def load_refresh_state(conn, symbols: list[str]) -> tuple[dict[str, datetime], set[str]]:
    with conn.cursor() as cur:
        # Staleness for scheduling must be "when did we last collect this
        # symbol at all", not "when did we last get a quote-bearing snapshot".
        # A symbol that has literally never had a valid bid/ask (a permanently
        # unquotable index like VIX, or one Polygon has simply never quoted)
        # would otherwise carry no timestamp here at all and sort as if it had
        # never been collected -- ahead of every symbol with a real, merely-old
        # snapshot. Every 30-minute retry cooldown it would then win the
        # priority sort again and re-claim most of the queue, starving symbols
        # that succeeded before but are just chronologically older (observed:
        # STX/SRVR/MU going 20+ hours unrefreshed while 16 never-quoted symbols
        # cycled through every cooldown window). Strategy quotes are now a
        # separate on-demand job type; this query only answers "is a Polygon
        # positioning refresh due".
        cur.execute(
            """
            SELECT DISTINCT ON (symbol) symbol, snapshot_ts
            FROM option_chain_snapshots
            WHERE symbol = ANY(%s)
            ORDER BY symbol, snapshot_ts DESC
            """,
            (symbols,),
        )
        latest_snapshots = {symbol: snapshot_ts for symbol, snapshot_ts in cur.fetchall()}

        cur.execute(
            """
            SELECT DISTINCT symbol
            FROM provider_fetch_jobs
            WHERE symbol = ANY(%s)
              AND job_type = 'option_chain_snapshot'
              AND (
                status IN ('queued', 'running')
                OR created_at >= NOW() - (%s::int * INTERVAL '1 minute')
              )
            """,
            (symbols, RETRY_COOLDOWN_MINUTES),
        )
        recent_jobs = {row[0] for row in cur.fetchall()}
    return latest_snapshots, recent_jobs


def enqueue_candidates(
    conn,
    symbols: list[str],
    tiers: dict[str, int] | None = None,
) -> int:
    tiers = tiers or {}
    inserted = 0
    with conn.cursor() as cur:
        for symbol in symbols:
            priority = tiers.get(symbol, PRIORITY_UNIVERSE_SCAN)
            cur.execute(
                """
                INSERT INTO provider_fetch_jobs (
                  symbol, job_type, provider, status, attempts, request_params
                )
                SELECT %s, 'option_chain_snapshot', %s, 'queued', 0, %s
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM provider_fetch_jobs
                  WHERE symbol = %s
                    AND job_type = 'option_chain_snapshot'
                    AND status IN ('queued', 'running')
                )
                """,
                (
                    symbol,
                    REFRESH_PROVIDER,
                    Json({
                        'reason': 'universe_auto_refresh',
                        'priority': priority,
                        'tier': TIER_NAMES.get(priority, 'universe_scan'),
                    }),
                    symbol,
                ),
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted


def run() -> dict[str, Any]:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    window, max_age_minutes = refresh_window()
    if MARKET_HOURS_GATE_ENABLED and window == 'idle':
        # Deliberately before connecting: there is nothing to decide. On-demand
        # jobs are enqueued by the API on its own path, so idling the background
        # sweep never makes a user wait.
        log.info('Option refresh scheduler idle (market closed, outside the '
                 'settlement and pre-open windows)')
        return {'selected': [], 'inserted': 0, 'provider': REFRESH_PROVIDER,
                'window': window, 'queue_depth': None, 'capacity': 0}
    if not MARKET_HOURS_GATE_ENABLED:
        window, max_age_minutes = 'regular', MAX_AGE_MINUTES

    conn = psycopg2.connect(DB_URL)
    try:
        symbols, scan_enabled = load_universe(conn)
        queue_depth = load_queue_depth(conn)
        remaining_budget = load_remaining_budget(conn, REFRESH_PROVIDER)
        capacity = fill_count(queue_depth, remaining_budget=remaining_budget)
        if capacity <= 0:
            reason = 'budget exhausted' if remaining_budget == 0 else 'queue at target'
            log.info(
                'Option refresh scheduler idle (%s): queue_depth=%s target=%s remaining_budget=%s',
                reason, queue_depth, QUEUE_TARGET, remaining_budget,
            )
            return {
                'selected': [], 'inserted': 0, 'provider': REFRESH_PROVIDER,
                'queue_depth': queue_depth, 'capacity': 0, 'remaining_budget': remaining_budget,
            }

        recent_active = load_recent_active(conn, RECENT_ACTIVE_HOURS)
        tiers = assign_tiers(symbols, scan_enabled, recent_active)
        latest_snapshots, recent_jobs = load_refresh_state(conn, symbols)
        candidates = select_candidates(
            symbols,
            latest_snapshots,
            recent_jobs,
            datetime.now(timezone.utc),
            max_age_minutes,
            capacity,
            tiers,
        )
        inserted = enqueue_candidates(conn, candidates, tiers)
    finally:
        conn.close()

    result = {
        'selected': candidates,
        'inserted': inserted,
        'provider': REFRESH_PROVIDER,
        'queue_depth': queue_depth,
        'capacity': capacity,
        'remaining_budget': remaining_budget,
        'universe_count': len(symbols),
    }
    result['window'] = window
    log.info(
        'Option refresh scheduler window=%s selected=%s inserted=%s provider=%s '
        'queue_depth=%s capacity=%s universe=%s',
        window, candidates, inserted, REFRESH_PROVIDER, queue_depth, capacity, len(symbols),
    )
    return result


if __name__ == '__main__':
    configure_logging()
    run()
