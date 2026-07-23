# Current-Price Staleness Fix (Spot Hint) — 2026-07-20

## Symptom

Production quantrift.io showed TSLA "现价" `$391.06` while the real price was ~`$381.82` — off by ~$9 and four days stale (391.06 was Thursday 2026-07-16's close).

## Root Cause

Two independent stale-spot paths, plus a plan limit:

1. `run_refresh_worker.py::SPOT_HINT_MAX_AGE_DAYS = 4`. The option refresh worker (runs every ~5 min) reused the latest persisted daily close as the underlying spot, skipping Polygon `/prev`, for any close up to **4 days old** (from the `f089fd1` request-saving optimization). On Monday, Thursday's 391.06 was still "fresh enough," so every 5-minute refresh re-served it.
2. The daily price cron (`quantrift-options-prices`, `cron 35 13 * * 1-5`, `autorestart:false`) runs once per weekday at 13:35 PT and had last run Thursday. `price_history` (and `price_history_30m`, same cron) were frozen at 07-16 for all 72 symbols; Friday 07-17 was never collected even though Polygon already had it.
3. Polygon `$29` Options plan: the minute-aggregate endpoint returns `NOT_AUTHORIZED` — **verified during market hours (2026-07-20 11:02 ET), not just pre-market.** Only daily aggregates and `/prev` (prior close) are entitled. So on this plan the freshest obtainable price from Polygon is the prior trading day's close.

## Live Findings

```
2026-07-20 06:52 ET (pre-market):  /v2/aggs/.../range/1/minute/today  -> NOT_AUTHORIZED
2026-07-20 11:02 ET (market open): /v2/aggs/.../range/1/minute/today  -> NOT_AUTHORIZED
                                   /v2/aggs/.../prev                   -> 380.84 (Fri close)
                                   /v2/aggs/.../range/1/day (5 days)   -> OK, includes 07-17
```

A separate observation: a production TSLA snapshot at 10:22 ET carried `source=ib_internal, underlying=374.43` — a genuine intraday price. IB Gateway (the quote-fallback path from `8e3df5f`) provides an in-session underlying price that Polygon's plan does not. That is the only free intraday-price source available today.

## Fix (this change)

- `SPOT_HINT_MAX_AGE_DAYS` 4 -> 1 (`OPTION_SPOT_HINT_MAX_AGE_DAYS`). A daily close only shortcuts as spot when it is <=1 day old; otherwise `latest_db_spot` returns None and the provider fetches a fresh price. Verified: on Monday, `latest_db_spot(TSLA/SPY/MU)` all return None (latest daily is Friday 07-17 = 3 days), forcing `/prev` = prior close instead of the multi-day-old daily row.
- `polygon_option_chain_provider.fetch_underlying` now prefers, in order: a delayed intraday minute bar (via new `_fetch_intraday_last`) -> the daily-close spot_hint -> `/prev`. The intraday probe is gated by `OPTION_INTRADAY_SPOT_ENABLED` (default **false**) because Polygon returns NOT_AUTHORIZED for it today; leaving it on would fire ~200 guaranteed-failing requests per refresh cycle. After a Stocks-plan upgrade, set the flag true and the code activates automatically. The intraday path never raises (empty/unauthorized/error -> None). `raw.endpoint`/`raw.as_of` record the source.
- Manually backfilled the missing Friday 07-17 daily bar; TSLA daily is now 380.84.

## Effective Freshness After This Fix

- **Off-hours / weekend / pre-market:** prior trading day's close via `/prev`. Correct.
- **Market hours, Polygon-primary snapshot:** prior close (Polygon minute is not entitled). Not yet intraday — that needs either P2.1 (route the underlying through IB during the session) or a Polygon Stocks upgrade.
- **Market hours, IB-fallback snapshot:** a real intraday underlying (observed 374.43).

This eliminates the 4-day-stale bug (391.06 Thu -> 380.84 Fri, refreshed each morning). It does not by itself deliver a live in-session price on the current Polygon plan.

## Tests

`collector/tests/test_polygon_option_provider.py`: `test_intraday_delayed_price_beats_a_daily_close_hint_when_enabled`, `test_intraday_is_not_requested_when_disabled`, `test_unauthorized_intraday_falls_back_to_hint_without_raising`, `test_off_hours_no_intraday_and_no_hint_falls_to_prev`. `FakeSession` gained URL-routed intraday responses. `collector -m unittest discover -s tests` -> 236/236.

## Follow-ups (recorded in task.md)

- P2.1: source the underlying spot from IB Gateway during the regular session (free intraday). Needs its own design + market-hours validation + IB entitlement handling.
- P3: label the displayed price with its real as-of time; never present a prior close as a live "现价".
- P4: daily-cron reliability / missing-day backfill.
- Plan upgrade (paid): Polygon Stocks entitlement for true intraday minute data.

## Rollback

Revert this change. Data: no destructive change; the manually backfilled 07-17 daily bar is a normal upsert.
