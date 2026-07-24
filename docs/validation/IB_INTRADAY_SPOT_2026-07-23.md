# IB Intraday Underlying Spot (P2.1) — code complete, acceptance pending — 2026-07-23

## Goal

During the regular US session, source the underlying spot from IB Gateway (a real
in-session delayed last) instead of a prior daily close. The $29 Polygon Options
plan cannot serve stock intraday (403, verified 2026-07-20), so IB is the only
free in-session price. The option chain itself still comes from Polygon; only the
spot changes.

## Implementation

Reuses the existing `IbOptionChainProvider.fetch_underlying` (already the
fallback path's underlying source — no new IB code):

- `run_refresh_worker.fetch_ib_intraday_spot(symbol)` — best-effort wrapper
  returning `{price, source:'ib_internal', as_of}` or None. Any IB failure
  (down, late, entitlement-limited, non-positive price) returns None so the
  Polygon refresh is never broken.
- `run_refresh_worker.is_regular_us_session(now_et)` — Mon-Fri 09:30–16:00 ET
  gate (close exclusive; holidays not modeled — a holiday just means IB is asked
  for a spot it may not have, which falls back cleanly).
- `fetch_and_persist_option_snapshot` (polygon path): when
  `OPTION_IB_INTRADAY_SPOT_ENABLED` and in-session, fetches the IB spot and
  passes it as `intraday_spot` to the provider.
- `polygon_option_chain_provider.fetch_option_chain`/`fetch_underlying` — new
  `intraday_spot` param, highest priority: IB in-session spot > Polygon delayed
  intraday (entitlement-gated) > db spot_hint > `/prev`. An invalid/non-positive
  IB price falls through. Provenance is recorded in `raw_metadata`
  (`underlying_source`, `underlying_endpoint='ib_intraday_last'`, `underlying_as_of`);
  the snapshot `source` stays `polygon_licensed` because the options are Polygon.
  This keeps the composite snapshot's price origin honest and lines up with the
  P3 price as-of label.

env `OPTION_IB_INTRADAY_SPOT_ENABLED` defaults **false** — the code is inert
until flipped, so this ships at zero production risk.

## Verification so far

- Unit tests (7): provider — IB `intraday_spot` beats hint and `/prev` and
  records provenance; invalid IB spot falls back to the hint. worker —
  `is_regular_us_session` boundaries (open inclusive, close exclusive, weekend);
  `fetch_ib_intraday_spot` returns price/source/as_of; best-effort None on IB
  failure; rejects non-positive price; flag defaults off. batch-derivation — the
  polygon path passes `intraday_spot=None` when the flag is off.
- Full collector suite: 270/270.

## Remaining (external gate only)

Market-open live acceptance, which cannot run while the market is closed
(implemented at 21:xx ET). At the next regular session:

1. Set `OPTION_IB_INTRADAY_SPOT_ENABLED=true` in `collector/ecosystem.config.cjs`
   (worker env) and reload the daemon.
2. Confirm a refreshed `option_chain_snapshots` row for an active symbol has an
   `underlying_price` matching the live IB price, `raw_metadata.underlying_endpoint
   = 'ib_intraday_last'`, and `underlying_source = 'ib_internal'`.
3. Confirm after 16:00 ET the same symbol falls back to `endpoint='prev_agg'`.
4. Watch IB market-data line usage — requests are per-symbol and released
   immediately (sequential worker), so should stay well within IB's ~100
   concurrent-line limit; confirm no `10091/10167` storms.

Until this passes, P2.1 is code-complete but not accepted.

## Rollback

`OPTION_IB_INTRADAY_SPOT_ENABLED=false` (the default) fully disables it.

## Files

- `collector/run_refresh_worker.py` — flag, `is_regular_us_session`,
  `fetch_ib_intraday_spot`, polygon-path wiring.
- `collector/providers/polygon_option_chain_provider.py` — `intraday_spot` param,
  priority, provenance in `raw_metadata`.
- `collector/tests/test_polygon_option_provider.py`,
  `collector/tests/test_refresh_provider_contract.py`,
  `collector/tests/test_batch_derivation.py`.
