# Collection Resilience Audit — 2026-08-03

## Why

Three separate defects hit production within a week, each a different shape of
the same theme: a collector that fails without saying so.

1. `earnings_date` frozen for 207 symbols (a skip-gate killed a piggyback field).
2. A PLTR option chain fetched successfully and then discarded because an
   unrelated far expiry timed out.
3. Daily prices stuck on the previous Friday with no error anywhere.

Rather than fix (3) alone, the whole collector and server were audited for the
three failure classes: **freeze**, **timeout/retry**, **all-or-nothing**.

## Method

Three parallel agents, one per failure class, reading the code; plus a
**runtime-side** pass by hand — querying every major table for its actual
staleness. The runtime pass is what found the live incident: code review cannot
see that a table simply stopped advancing.

Every finding below was re-verified against the source before any change.

## The live incident, and a correction to its first diagnosis

The visible symptom was the price collector taking **~10 minutes per symbol**
(301 symbols ⇒ ~50 hours, so it could never finish before the next run) with
`polygon/stocks` showing `next_allowed_at` **1076s out and climbing**, with
`last_status=429`.

**First diagnosis — a real bug, but not the root cause.** `MAX_WAIT_SECONDS`
was applied by the *caller*, after an unconditional slot claim: the row advanced
by one delay, the caller slept a capped 300s instead of the true wait, then
**fired anyway**. Against a provider that had just returned 429 — exactly when
`penalize()` pushes the slot far out — every worker skipped the backoff it had
just been handed, earned a fresh 429, and pushed the slot further still.

That is genuinely broken and is fixed (below). But after fixing it the collector
was *still* taking ~10 minutes per symbol, which the fix alone could not explain.

**Actual root cause: 30 accumulating worker processes.** `crontab` contained:

```
* * * * 1-5   run_refresh_worker.py
```

One worker started **every minute**, while each run takes minutes to tens of
minutes. Starts outran exits, so they accumulated — 30 live processes spanning
2h33m of start times, none exiting. Thirty processes each claiming slots at
+16s advanced the shared row ~30× faster than wall-clock drained it.

This also explains the original 429 storm: not a limiter fault, but thirty
processes hitting Polygon at once.

Worse, the same work was **already** covered by PM2's
`quantrift-options-collector` (`run_collector_daemon.py`, `COLLECTOR_POLL_SECONDS=60`,
`SCAN_MATERIALIZE_SECONDS=300`) — identical cadence, so two schedulers ran the
same pipeline against one database, violating the documented single-writer rule.

**The lesson worth keeping: a plausible root cause that survives verification can
still be an amplifier rather than the source.** The limiter bug was real,
reproducible, and fixed — and the symptom persisted. Confirming the *fix removed
the symptom*, not merely that the *diagnosis was defensible*, is what surfaced
the cron.

### Resolution

- Killed the 30 accumulated processes.
- Backed up crontab to `~/crontab_backup_2026-08-03.txt`.
- Removed the `run_refresh_worker` and `materialize_scan` entries (PM2 covers
  both). Kept the `collect.py` entry, which PM2 does not schedule.
- Reset the stuck limiter row.

**Measured after**: 4 minutes → 6 symbols, against 0.4 symbols per 4 minutes
before. ~15× recovery. The remaining runtime is the intended floor of
`POLYGON_STOCK_REQUEST_DELAY=16`, not a defect — though the first estimate of
~2.7h assumed 2 requests per symbol. Measured steady state is **~2m07s per
symbol** (≈8 paced requests: daily and 30-minute aggregates each paginate), so a
full 301-symbol sweep is closer to **10 hours**. That is a real constraint on
how often the full universe can be refreshed, not something the fixes changed.

## Fixes applied

| # | Defect | Fix | Commit |
|---|---|---|---|
| 1 | Rate-limiter deadlock: cap applied after an unconditional claim, so backoff was bypassed and the slot inflated forever | Claim is **conditional** — the row advances only if the slot is already within the caller's budget, else `RateLimitDeferred` and nothing is written | `f666eb4` |
| 2 | Retry with no backoff: a re-queued job was instantly claimable and the quote worker polls every 5s, burning all 3 attempts in ~10-15s | `next_attempt_at` column (NULL = eligible now) with 30s/2m/8m exponential backoff, gated in the claim query | `f666eb4` |
| 3 | `option quote unavailable` treated as permanent, though it is the most transient condition in the system | Removed from the non-retryable list; Analyze declines to enqueue quote jobs outside RTH entirely (`deferred_market_closed`) | `f666eb4` |
| 4 | Dead IB socket spun ~20 minutes and reported `provider_status='ok'` | Added 504/1100/1101/1102/10197 as terminal, `isConnected()` check inside the contract loop, `error_msg` now affects `provider_status` (`partial`) | `e55c9b2` |
| 5 | Scanner materialization wrote all rows in one statement — one bad row produced **zero** scanner rows for the cycle | Chunked with a per-row fallback; dropped rows are counted and named | `e55c9b2` |
| 6 | `collect.py` caught upsert failures without counting them, so losing all 50 symbols reported "0 rows written, 0 errors" | Failed writes count; a run that attempted symbols and wrote nothing raises | `e55c9b2` |
| 7 | The freeze fixed in `collect.py` existed unchanged in `run_symbol_metrics_snapshot` — and there the early return had no `market_date`, so `symbol_data_state` reported the product **healthy while frozen** | Readiness lowers cadence rather than stopping collection, matching `collect.py` | `b99279b` |
| 8 | `server/src/db.js` had **no timeouts at all** — every pg default is "wait forever" | `connectionTimeoutMillis` / `statement_timeout` / `query_timeout` / `idleTimeoutMillis`, all below the frontend's 30s deadline | `b99279b` |
| 9 | The per-expiry guard added earlier that day wrapped only contract *discovery*, not the slower snapshot phase | Snapshot loop moved inside the guard; budget-exhausted expiries recorded | `b99279b` |
| 10 | `collect_prices.py` raised on any failed symbol **before** running `derive_volatility`, so one delisted ticker discarded HV/ATM-IV/IV-Rank for the whole universe | Derivation runs on what landed; the non-zero exit follows it | `b99279b` |

`#8` deserves a note: the frontend request timeout added on 2026-07-30 made the
browser give up after 30s during the volume-full outage. That looked like a fix.
It was not — the server-side hang, pool exhaustion and socket leak were all still
there, and *more* hidden, because the client now bailed before the server ever
reported. The real fix was the pool deadlines.

## Not yet addressed

Ranked findings still open, from the same audit:

- `materialize_scan` / `derive_volatility` / `materialize_oi_delta` — whole-universe
  single-transaction writes with no per-symbol isolation.
- `run_refresh_worker` — `executor.map` lets one connection failure discard the
  batch's deferred derivations.
- `Promise.all` over independent panels in `market.js`, `weekly.js`,
  `statusReports.js` (one rejection 500s the lot); `technicalLevels.js` already
  uses `allSettled` and is the in-repo model.
- `evaluateLedger` documents "best-effort per row" but has no per-row guard.
- Silent-failure counterparts: `polygon_option_chain_provider` pagination `break`
  with no log, `_parse_contract` dropping rows without a counter,
  `backfill_iv_history` still not flagging `days > 0 and computed == 0`.
- ~~`POLYGON_STOCK_REQUEST_DELAY=16` is probably far more conservative than
  necessary now that the 429 storm's real cause is gone~~ — **measured, and the
  hypothesis was wrong. Do not lower it.** Live probe against the production key
  on 2026-08-03:

  | delay | result |
  |---|---|
  | ~0.3s (≈3.3 req/s) | 4 of 12 succeeded, then **8 consecutive 429s** |
  | 5.0s | 6 of 8 succeeded, then 2 × 429 |
  | 3.0s | 4 of 8 succeeded, then 4 × 429 |

  Every run succeeds for the first few requests and then fails continuously —
  a token bucket with a small burst allowance and slow refill, not a simple
  per-second cap. 16s is a defensible steady-state value; 5s already draws 25%
  rejections. The unlimited-*calls* property of the paid plan says nothing about
  the *rate* limit, and conflating the two is what made this look like easy
  headroom.
- PM2 and crontab both remain as schedulers. Only the duplicates were removed;
  consolidating on one would prevent a recurrence by construction.

## Verification

- collector 325/325, server 291/291, frontend 118/118 + lint + build + check:dist.
- Limiter: 1836s-and-growing → drains normally; production row reset.
- Price collector: 0.4 → 6 symbols per 4 minutes.

Fifteen Analyze status tests were also found to depend on the real wall clock —
they passed during market hours and failed after the close, because the new
out-of-hours enqueue skip changed their expected state. All now pin an explicit
in-session time.
