# Collector health threshold drift — 2026-10-15

## Incident

The operator alert reported four `option_quote_snapshot` failures with
`threshold=0`, while the production PM2 ecosystem declares
`HEALTH_MAX_FAILED_24H=25`. Coverage was 310/310; the alert was a false escalation
caused by configuration drift between health-check entry points.

## Root cause

`collector/check_collector_health.py` loaded the collector `.env`, but that file did
not define health thresholds. `thresholds_from_env()` therefore used a hard-coded
default of `0`. The PM2 daemon had the intended value `25`, so its own health cycle
could report `ok` while another invocation persisted an alert with `threshold=0`.

## Fix

- Added `DEFAULT_MAX_FAILED_24H = 25` in the health checker.
- Changed both `HealthThresholds` and `thresholds_from_env()` to use that constant.
- Added a regression test proving a missing environment variable does not default to
  zero.
- Kept explicit `HEALTH_MAX_FAILED_24H` configuration as the override.

## Verification protocol

1. Run `cd collector && venv311/bin/python -m unittest discover -s tests -p 'test_*.py'`.
2. Check the live process with `pm2 env <collector-id>`.
3. Run the health checker against the production database and inspect the newest
   `collector_health_alerts.payload` threshold.
4. Confirm the alert resolves when the lane is below 25 failures and has no recent
   breach; do not delete alert rows to hide the incident.

## Follow-up rule

Any new health-check entry point must load the collector environment and must be
covered by a test that checks the persisted threshold. A config file alone is not
evidence that the running checker uses that config.
