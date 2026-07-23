# Option Refresh Scheduler Starvation Fix

Date: 2026-07-19

## Symptom

The Analyze page for STX (and others) kept showing a stale-snapshot notice with an age around 1424 minutes (~23.7 hours), despite the option-refresh collector daemon actively writing hundreds of fresh snapshots per hour for other symbols.

## Root Cause

`schedule_option_refresh.load_refresh_state()` computed each symbol's scheduling staleness from `option_chain_snapshots` filtered to rows that also had at least one contract with a valid bid/ask (`EXISTS (... c.bid IS NOT NULL AND c.ask IS NOT NULL AND c.ask > 0 AND c.ask >= c.bid)`). A symbol that has never once received a quote-bearing snapshot is therefore absent from the resulting `latest_snapshots` dict, and `select_candidates()` treats an absent entry as "never collected" -- sorting it ahead of every symbol with a real, merely-old timestamp.

Sixteen `scan_enabled` symbols had zero quote-bearing snapshots ever: `VIX, BA, COST, GLD, GS, MUU, NFLX, SPCX, TLT, XBI, XHB, XLRE, XLV, XLY, XOP, XSD`. `VIX` specifically can never succeed through this pipeline: `PolygonOptionChainProvider.fetch_underlying()` calls `/v2/aggs/ticker/VIX/prev`, a stock-aggregates endpoint that returns no results for an index (`RuntimeError('Polygon prev agg returned no results for VIX')`), confirmed by 11 consecutive failures across the 6 hours before the fix, one every `OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES=30`.

Every 30-minute retry cooldown, these symbols re-entered the eligible pool and, because they always ranked "most stale," reclaimed most of the 20-slot per-cycle capacity ahead of symbols that had succeeded before but were chronologically older. Real, previously-successful symbols went 20+ hours (STX, SRVR, MU, SMH, DTCR, META, AEHR, XLU, KIE, SOXX, XLP, MRVL, ICLN -- 13 confirmed) and VIX's own history was 61.7 hours stale, unrecoverable by retry.

Whether a specific job needs a live quote is decided independently by `require_quotes` on the enqueued job (set only during the US regular session, per the 2026-07-19 `8e3df5f` fix); `load_refresh_state`'s scheduling query does not need the quote-bearing restriction to serve that purpose.

## Fix

- `schedule_option_refresh.py::load_refresh_state`: the `latest_snapshots` query now uses the latest `option_chain_snapshots.snapshot_ts` for a symbol regardless of quote content. Scheduling staleness answers "is a refresh due"; `require_quotes` on the resulting job (unchanged) still governs whether the worker chases a live bid/ask via Polygon -> IB fallback.
- `symbol_universe`: `VIX.scan_enabled` set to `FALSE` (data change, not code) with a `metadata.disabled_reason='index_underlying_unsupported'` note, since the stock-aggregates underlying-price path can never serve an index. `sync_universe.py`'s `ON CONFLICT DO UPDATE` only touches `active`/`updated_at`, not `scan_enabled`, so this will not be silently re-enabled by a future universe sync.

## Tests

`collector/tests/test_option_refresh_scheduler.py`, new `LoadRefreshStateTests`:
- `test_reports_the_latest_snapshot_even_without_a_quote`
- `test_snapshot_query_no_longer_requires_a_quoted_contract`
- `test_never_quoted_symbol_no_longer_outranks_an_older_real_snapshot`

`cd collector && .venv311/bin/python -m unittest discover -s tests` -> 232/232 passed.

## Runtime Verification

```bash
cd collector
set -a && source .env && set +a
python3 -c "
import psycopg2, schedule_option_refresh as sched
from datetime import datetime, timezone
conn = psycopg2.connect('$DATABASE_URL')
symbols, scan_enabled = sched.load_universe(conn)
latest_snapshots, recent_jobs = sched.load_refresh_state(conn, symbols)
recent_active = sched.load_recent_active(conn, sched.RECENT_ACTIVE_HOURS)
tiers = sched.assign_tiers(symbols, scan_enabled, recent_active)
now = datetime.now(timezone.utc)
print(sched.select_candidates(symbols, latest_snapshots, recent_jobs, now, sched.MAX_AGE_MINUTES, 20, tiers))
"
pm2 reload quantrift-options-collector --update-env
```

- Before the fix (dry-run against production data): the top of `select_candidates`' output was dominated by `VIX` and other never-quoted symbols every cycle; `STX`/`SRVR` never appeared.
- After the fix (same dry-run): `SRVR` and `STX` were the top two candidates by real staleness (1440/1437 minutes), immediately followed by the other 10 previously-starved symbols (`SMH, DTCR, META, AEHR, XLU, KIE, SOXX, XLP, MRVL, ICLN`).
- After `pm2 reload` and two scheduler cycles (~7 minutes), production `option_chain_snapshots` showed fresh writes for `STX` (2 min), `SRVR` (3 min), `SMH` (2 min), `DTCR` (1 min), `AEHR` (1 min). The remaining previously-starved symbols continue clearing as worker throughput allows (`REFRESH_WORKER_BATCH_SIZE=2` is a separately tracked, pre-existing throughput limit, not part of this bug).
- `VIX` no longer appears in `provider_fetch_jobs` after disabling `scan_enabled`; its 30-minute failure loop stopped.

## Rollback

Code: revert the `load_refresh_state` query change (re-add the quote-bearing `EXISTS` clause). Data: `UPDATE symbol_universe SET scan_enabled = TRUE WHERE symbol = 'VIX'` -- reversible, no destructive change was made.
