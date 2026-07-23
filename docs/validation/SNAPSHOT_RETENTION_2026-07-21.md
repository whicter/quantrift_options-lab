# Snapshot-Table Retention — 2026-07-21

## Motivation

User asked whether reads/writes were slow. Individual indexed queries were fast
(17-41 ms), but two materialized-snapshot tables had no retention and grew
unbounded:

```
scanner_results_snapshots   929 MB   536,109 rows   (60-140k rows/day, oldest 07-15)
option_oi_delta_snapshots   447 MB   682,515 rows
option_contract_snapshots   853 MB   807,236 rows
option_chain_snapshots      9.9 MB     8,070 rows
```

These are recomputed every ~5 minutes and no product reads their history: scan
and alerts use only `MAX(snapshot_ts)` (latest batch); weekly/unusual look back
at most 5 trading days. Pruning old rows loses no product capability.
Accumulating fact tables (`volatility_history`'s 252-day IV, `price_history`,
`iv_history`) are never touched.

## Design

`collector/prune_snapshots.py`, two prune roots (FKs do the rest):

- `option_chain_snapshots` (snapshot_ts, 7 days). Its `ON DELETE CASCADE`
  children — `option_contract_snapshots`, `gex_snapshots`,
  `gex_by_strike_snapshots`, `option_oi_delta_snapshots` — are removed with it,
  so one prune bounds the four largest option tables.
- `scanner_results_snapshots` (created_at, 3 days). Standalone.

Retention windows exceed the longest consumer look-back (7d > weekly's ~5
trading days; 3d for latest-batch-only scan). All windows are env-overridable
(`OPTION_CHAIN_RETENTION_DAYS`, `SCANNER_RESULTS_RETENTION_DAYS`).

Deletes are ctid-batched (`SNAPSHOT_PRUNE_BATCH_SIZE=5000`) and capped per call
(`SNAPSHOT_PRUNE_MAX_ROWS_PER_CALL=50000`), committed per batch, so a large
first cleanup drains across cycles instead of one long Railway lock. Best
effort: a failure is logged and never aborts the collector cycle. Wired into the
daemon hourly (`SNAPSHOT_PRUNE_SECONDS=3600`).

## Initial Cleanup

```bash
cd collector
SNAPSHOT_PRUNE_MAX_ROWS_PER_CALL=2000000 python3 -c "import prune_snapshots as p; print(p.run())"
# -> {'option_chain_snapshots': 2, 'scanner_results_snapshots': 245723}
psql: VACUUM FULL scanner_results_snapshots
```

- scanner_results_snapshots: 245,723 rows deleted (536k -> 290k), and
  `VACUUM FULL` reclaimed physical disk: **929 MB -> 545 MB**.
- option_chain_snapshots: 2 rows (already within 7 days), so its cascade
  children were already bounded.

## Verification

collector `-m unittest discover -s tests` -> 242/242 (+4:
batch-drains-to-empty, stops-at-max-rows, zero-retention-no-op, delete filters
by age and table). Daemon reloaded to run the prune each hour.

## Rollback

Remove the prune_snapshots import/call from run_collector_daemon.py. No data
rollback is possible or needed (pruned rows were expired materialized snapshots
recomputed every cycle).
