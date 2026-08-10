"""Fill the quotes lane with `option_quote_snapshot` jobs for the quote watchlist.

`quantrift-options-quote-worker` has been online and idle since 2026-08-03 --
101,264 log lines of "No queued refresh jobs in quotes lane". The lane partition,
the IB execution path, dedupe and priority all work; nothing ever put jobs in the
queue. Before the 2026-07-30 positioning/pricing isolation the market-wide refresh
fell back to IB when Polygon returned a quote-less chain, and that fallback was
the only mechanism producing executable quotes at scale (~55 symbols). Isolating
the lanes was right -- an IB timeout must not occupy a GEX worker slot -- but it
removed that mechanism without replacing it, and quoted coverage decayed to a
single symbol. This is the replacement.

Design notes:

- Fills to a queue DEPTH target rather than enqueuing a fixed count, mirroring
  `schedule_option_refresh`. IB is serial and a symbol can take ~16 minutes, so a
  fixed count per cycle would stack jobs faster than the worker drains them.
- Priority stays BELOW the on-demand value. A user opening Analyze must never
  queue behind a background sweep of 50 symbols.
- Staleness is measured against the last snapshot that actually carried usable
  bid/ask, not the last snapshot of any kind: a Polygon positioning refresh
  writes a fresh row with no quotes at all, and treating that as "recently
  quoted" would permanently starve the symbol it just overwrote.
"""

from __future__ import annotations

import argparse
import logging
import os
from typing import Any

import psycopg2
from psycopg2.extras import Json

from collector_runtime import configure_collector
from run_refresh_worker import is_regular_us_session
from select_quote_watchlist import effective_watchlist

configure_collector(__file__)
log = logging.getLogger(__name__)

# One in flight plus a small buffer. The worker runs concurrency 1 (IB's fixed
# client id makes concurrent option fetches conflict), so a deep queue buys
# nothing and only delays the freshness signal.
QUEUE_TARGET = max(int(os.getenv('QUOTE_REFRESH_QUEUE_TARGET', '4')), 1)
# Below QUOTE_ENRICHMENT_PRIORITY (90), which `analyze.js` uses for a symbol a
# user is actually looking at.
BACKGROUND_PRIORITY = min(max(int(os.getenv('QUOTE_REFRESH_PRIORITY', '30')), 0), 89)
# A cash-secured put is a 30-45 DTE decision, so hours-old quotes are useful for
# discovery. This is the age past which a symbol becomes eligible again, not a
# freshness promise made to any user.
MAX_AGE_MINUTES = max(int(os.getenv('QUOTE_REFRESH_MAX_AGE_MINUTES', '360')), 1)

QUEUE_DEPTH_SQL = """
    SELECT COUNT(*) FROM provider_fetch_jobs
    WHERE job_type = 'option_quote_snapshot' AND status IN ('queued', 'running')
"""

# Age per symbol, measured from the newest snapshot that carried a usable quote.
# LEFT JOIN so a symbol that has never been quoted comes back with NULL and sorts
# first -- never quoted is the most stale state there is.
QUOTE_AGE_SQL = """
    SELECT w.symbol,
           EXTRACT(EPOCH FROM (NOW() - MAX(s.snapshot_ts))) / 60 AS age_minutes
    FROM UNNEST(%s::text[]) AS w(symbol)
    LEFT JOIN option_chain_snapshots s
      ON s.symbol = w.symbol
     AND EXISTS (
           SELECT 1 FROM option_contract_snapshots c
           WHERE c.snapshot_id = s.id
             AND c.bid IS NOT NULL AND c.ask IS NOT NULL
             AND c.bid > 0 AND c.ask >= c.bid
         )
    GROUP BY w.symbol
    ORDER BY age_minutes DESC NULLS FIRST, w.symbol ASC
"""


def stale_symbols(conn, symbols: list[str], max_age_minutes: int = MAX_AGE_MINUTES) -> list[dict]:
    if not symbols:
        return []
    with conn.cursor() as cur:
        cur.execute(QUOTE_AGE_SQL, (symbols,))
        rows = cur.fetchall()
    stale = []
    for symbol, age in rows:
        age_minutes = float(age) if age is not None else None
        if age_minutes is None or age_minutes >= max_age_minutes:
            stale.append({'symbol': symbol, 'age_minutes': age_minutes})
    return stale


def queue_depth(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(QUEUE_DEPTH_SQL)
        return int(cur.fetchone()[0])


def enqueue(conn, candidates: list[dict], capacity: int) -> int:
    """Insert jobs, skipping symbols already queued or running.

    The NOT EXISTS guard matches `run_refresh_worker.enqueue_option_quote_snapshot`:
    an active job for the symbol means the work is already scheduled, regardless
    of age. Without it a sweep firing while a 16-minute IB fetch is in flight
    would queue a duplicate of the symbol currently being fetched.
    """
    inserted = 0
    with conn.cursor() as cur:
        for item in candidates:
            if inserted >= capacity:
                break
            cur.execute(
                """
                INSERT INTO provider_fetch_jobs
                  (symbol, job_type, provider, status, attempts, request_params)
                SELECT %s, 'option_quote_snapshot', 'ib_internal', 'queued', 0, %s::jsonb
                WHERE NOT EXISTS (
                  SELECT 1 FROM provider_fetch_jobs
                  WHERE symbol = %s
                    AND job_type = 'option_quote_snapshot'
                    AND status IN ('queued', 'running')
                )
                """,
                (
                    item['symbol'],
                    Json({
                        'priority': BACKGROUND_PRIORITY,
                        'require_quotes': True,
                        'reason': 'quote_watchlist_sweep',
                        'age_minutes': round(item['age_minutes'], 1) if item['age_minutes'] is not None else None,
                    }),
                    item['symbol'],
                ),
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted


def run(
    max_age_minutes: int = MAX_AGE_MINUTES,
    queue_target: int = QUEUE_TARGET,
    require_session: bool = True,
) -> dict[str, Any]:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    # Outside the regular session there is no quote stream, so IB does not fail
    # fast -- it waits out IB_OPTION_STREAM_TIMEOUT on every one of up to 240
    # contracts and then reports no usable bid/ask. Measured 2026-08-09 (a
    # Saturday): a single symbol was still running at 197s and was on track for
    # the full ~16 minute worst case to produce nothing. Enqueuing while closed
    # is not merely useless, it occupies the serial IB client for hours and
    # starves the on-demand lane a user is actually waiting on.
    if require_session and not is_regular_us_session():
        log.info('Quote refresh scheduler idle: outside the regular US session')
        return {'status': 'market_closed', 'watchlist': 0, 'enqueued': 0}

    conn = psycopg2.connect(database_url)
    try:
        watchlist = effective_watchlist(conn)
        if not watchlist:
            log.warning(
                'Quote watchlist is empty; run select_quote_watchlist.py first. '
                'Nothing will be quoted, and the candidate engine has no executable legs.'
            )
            return {'status': 'empty_watchlist', 'watchlist': 0, 'enqueued': 0}

        depth = queue_depth(conn)
        capacity = max(queue_target - depth, 0)
        candidates = stale_symbols(conn, watchlist, max_age_minutes=max_age_minutes)
        enqueued = enqueue(conn, candidates, capacity) if capacity else 0
    finally:
        conn.close()

    never_quoted = sum(1 for c in candidates if c['age_minutes'] is None)
    result = {
        'status': 'ok',
        'watchlist': len(watchlist),
        'stale': len(candidates),
        'never_quoted': never_quoted,
        'queue_depth': depth,
        'capacity': capacity,
        'enqueued': enqueued,
    }
    log.info('Quote refresh scheduler: %s', result)
    if candidates and not capacity:
        log.info(
            '%s symbols are stale but the queue is at target (%s); they wait for the next cycle',
            len(candidates), queue_target,
        )
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Enqueue option quote refreshes for the watchlist')
    parser.add_argument('--max-age-minutes', type=int, default=MAX_AGE_MINUTES)
    parser.add_argument('--queue-target', type=int, default=QUEUE_TARGET)
    parser.add_argument(
        '--ignore-session', action='store_true',
        help='enqueue even outside the regular session (diagnostics only; IB will '
             'burn its full per-contract timeout and return no quotes)',
    )
    args = parser.parse_args()
    print(run(
        max_age_minutes=args.max_age_minutes,
        queue_target=args.queue_target,
        require_session=not args.ignore_session,
    ))
