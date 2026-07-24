# Refresh Worker Batch Validation — 2026-07-24

## Scope

Validate the single-worker throughput tuning from `REFRESH_WORKER_BATCH_SIZE=2` to `10`.
This is a batch-size change only; bounded multi-worker concurrency remains out of scope.

## Implementation

- Commit: `c0d91f0`
- File: `collector/ecosystem.config.cjs`
- Runtime value: `REFRESH_WORKER_BATCH_SIZE=10`
- Previous value: `2`
- No database migration
- Production requires a PM2/collector reload before the new environment value is active.

## Evidence

- Measured option refresh cost: approximately `2.83 seconds/symbol`.
- Per-cycle estimate at batch 10: approximately `28 seconds` for symbol refresh work, leaving about `32 seconds` of the 60-second poll for GEX, materialization, database writes, and variance.
- Estimated cold fill for approximately 81 symbols: about `41 minutes` at batch 2 versus about `9 minutes` at batch 10.
- Provider safety remains enforced by the shared PostgreSQL-backed E7 rate limiter; batch size does not disable or bypass it.

## Verification boundary

Confirmed by code and commit configuration:

- The PM2 ecosystem config now exports batch size `10`.
- `collector/run_refresh_worker.py` reads the environment value and remains single-process.
- No second worker was started.

Not established by this record:

- A full open-market production cold-fill comparison.
- Safety of multiple worker processes.
- Removal of the single-process assumptions in `PendingDerivations`, stale-running recovery, and queued-job deduplication.

## Rollback

Set `REFRESH_WORKER_BATCH_SIZE=2` and reload the collector. No schema rollback is required.
