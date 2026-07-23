# Option Refresh Budget Starvation (Dual-Runtime Clobber) — 2026-07-21

## Symptom

User: "why is the data so old and OI empty". Investigation:
- OI was NOT empty (latest TSLA 66/66, AAPL 72/72, SPY 30/30, MU 316/316 contracts had OI).
- The real problem: zero option snapshots written for the entire US regular session (13:30-20:00 UTC 2026-07-21); the universe was stuck ~9 hours stale. Pre-market (07:00-12:00 UTC) had written 59-78 snapshots/hour normally.

## Root Cause

Daemon log: `Option refresh scheduler idle (budget exhausted): queue_depth=0 target=20 remaining_budget=0` throughout the session.

`reserve_budget` upserts the shared `provider_request_usage` row with
`ON CONFLICT DO UPDATE SET request_budget = EXCLUDED.request_budget`, so **any
process that runs the worker overwrites the shared budget with its own env
value.** `run_refresh_worker.py` read `PROVIDER_DAILY_BUDGET` with a default of
**1000**. The Mac PM2 daemon has the env set to 50000, but
`run_railway_refresh_cycle.py` imports and runs the same worker; if the Railway
side runs with the env unset it writes 1000, clobbering 50000 down to 1000.

Evidence — historical `provider_request_usage` rows for `polygon_licensed /
option_chain_snapshot`:

```
2026-07-21: count=1005  budget=50000   (final, after recovery)
2026-07-18: count=1000  budget=1000    <- a day the low default won
```

On 2026-07-21 the 1000-budget version won during the session: ~1000 requests
(≈400 pre-market snapshots x ~2.5 requests each) exhausted it by 12:00 UTC,
starving every refresh for the rest of the day, including the whole market
session. This is the dual-runtime contention Option B targeted, mutated from a
dedup race into a budget-value clobber.

## Fix

- `PROVIDER_DAILY_BUDGET` default 1000 -> 1_000_000 in `run_refresh_worker.py`,
  `ecosystem.config.cjs`, `.env.example`. Polygon's paid plan is unlimited, so
  the cap is only a runaway-loop backstop and must sit far above real daily
  usage (~1-3k) — then a process with the env unset can no longer starve
  production by clobbering the row low. Production row bumped to 1,000,000
  (remaining 998,995).
- Also fixed a `date`-not-JSON-serializable bug that failed all stale-metrics
  jobs: `run_symbol_metrics_snapshot`'s summary carries a raw `datetime.date`
  (`market_date`, consumed as a real date by the symbol_data_state update), and
  `finish_job` serialized the summary with `psycopg2 Json` (json.dumps), which
  raised "Object of type date is not JSON serializable". `finish_job` now uses a
  `default=str` encoder (`_job_json`) so any date/Decimal in a summary
  stringifies instead of failing the job.

## Verification

- collector `-m unittest discover -s tests` -> 238/238 (+2: summary
  serialization tolerance, high-default-budget assertion).
- After `pm2 reload`: 20 new snapshots in the following 5 minutes; universe
  recovering from 9h stale (bounded by the separately-tracked
  REFRESH_WORKER_BATCH_SIZE=2 throughput). No further metrics-job failures.

## Residual (Option A / ops)

The two runtimes still write the same budget row. The high default makes the
clobber harmless (both values >> daily usage, no starvation), but a full fix
means either confirming the Railway refresh cycle is truly disabled (no Railway
cron triggers `run_railway_refresh_cycle`) or moving to Option A single-owner.

## Rollback

Revert the default change; no destructive data change (the budget-row bump is a
normal upsert).
