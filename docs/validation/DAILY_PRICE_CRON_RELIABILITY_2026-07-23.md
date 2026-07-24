# Daily Price Cron Reliability (P4) — 2026-07-23

## Problem

`quantrift-options-prices` (`collect_prices.py`) ran once per weekday at 13:35 PT
(= 16:35 ET, only ~35 min after the 16:00 ET close). At that moment Polygon's
end-of-day daily aggregate for the just-closed session is frequently still
pending, so the run writes everything except the newest bar. Because the next
run is the following weekday, a missed/late bar stayed absent for up to three
days — the Friday 2026-07-17 bar was missing until a manual backfill on Monday
2026-07-20. This freezes charts, HV, and IV-rank inputs (the "现价" itself is
already handled by the option worker via `/prev`, so P4 is a charts/indicators
reliability fix, not a live-price fix).

## Fix

Two independent guards:

1. **Second daily run.** `cron_restart: '35 13,18 * * 1-5'` adds an 18:35 PT run
   (= 21:35 ET), past the EOD settle. A bar that was pending at 16:35 ET is
   finalized by then and picked up the same day. Each run already refetches 400
   days and upserts idempotently, so the second run also self-heals any gap the
   first one left — no separate backfill path needed.

2. **Freshness guard.** `check_price_freshness` runs at the end of `run()` and
   compares each symbol's newest stored `price_history.date` against
   `settled_market_date(now_et)` — the most recent session whose bar should be
   finalized (weekday, past the ET settle hour; weekends step back to Friday).
   Lagging symbols produce a single WARNING. It is observation-only: wrapped so
   it can never fail the run, and US market holidays are deliberately not modeled
   (a holiday may over-expect one date → a benign WARNING). This turns the
   previously silent multi-day gap into something visible in the logs.

`PRICE_EOD_SETTLE_HOUR_ET` (default 20) is the settle threshold. Before it, the
guard only demands the previous session's bar (so the 13:35 PT run does not
false-alarm on a not-yet-finalized same-day bar); the 21:35 ET run demands and
fetches today's.

## Verification

Pure helpers are unit-tested (`tests/test_collect_prices.py`, 7 new):

- `settled_market_date`: weekday after settle → today; weekday before settle →
  previous weekday; Monday morning → previous Friday; Saturday → Friday.
- `symbols_behind`: flags only missing/stale symbols, ignores ones ahead.
- `check_price_freshness`: WARNs with the expected date when a symbol lags;
  silent when all current (fake connection).

Full collector suite: 254/254.

## Rollback

Revert the cron to `35 13 * * 1-5` and/or set the guard aside — it has no write
side effects, so removing it changes only log output. The 400-day idempotent
upsert behavior is unchanged.

## Files

- `collector/collect_prices.py` — `settled_market_date`, `symbols_behind`,
  `check_price_freshness`, guard call in `run()`, `PRICE_EOD_SETTLE_HOUR_ET`.
- `collector/ecosystem.config.cjs` — second daily run.
- `collector/tests/test_collect_prices.py` — 7 tests.
