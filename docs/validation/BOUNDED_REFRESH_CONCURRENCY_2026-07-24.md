# Bounded Refresh Concurrency Validation

Date: 2026-07-24

## Scope

Overlap independent refresh jobs inside the existing single PM2 collector process, without starting multiple PM2 replicas or duplicating global derivations.

## Implementation

- `REFRESH_WORKER_BATCH_SIZE=10`
- `REFRESH_WORKER_CONCURRENCY=3` (bounded by code to 1..8)
- Each job opens its own PostgreSQL connection and provider instance.
- Polygon requests continue through the PostgreSQL-backed global provider limiter.
- `PendingDerivations` is protected for concurrent requests.
- OI Delta and scanner materialization remain on the batch thread and execute at most once per batch.
- Explicit rollback: set `REFRESH_WORKER_CONCURRENCY=1`, reload from `collector/ecosystem.config.cjs`.

## Verification

Commands:

```text
cd collector
venv311/bin/python -m unittest discover -s tests -p 'test_option_provider_selection.py' -v
venv311/bin/python -m unittest discover -s tests -p 'test_batch_derivation.py' -v
/opt/homebrew/bin/python3.11 -m py_compile run_refresh_worker.py collect_options.py
```

Results:

- option provider selection: 12/12 passed
- batch derivation: 12/12 passed
- Python syntax compilation: passed
- `git diff --check`: passed

## Runtime Boundary

This validation proves the code path and focused tests. It does not claim production throughput or prove that IB Gateway is healthy. Production must be reloaded from the ecosystem file and then checked for `REFRESH_WORKER_CONCURRENCY=3` in the process environment and `Processing N refresh jobs` logs. Do not add a second PM2 instance until cross-process derivation, recovery, and deduplication coordination is separately implemented and verified.
