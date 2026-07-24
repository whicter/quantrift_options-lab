# IV Rank Forward Constant-30d Unification (Phase 3) — 2026-07-23

## Problem

The 252-day IV series that feeds IV Rank was spliced from two methods:

- **historical backfill** (`polygon_backfill_bs`) — constant-30-day maturity,
  ATM call+put, total-variance interpolation, and
- **forward daily collection** (`polygon_derived`) — a single ATM **call** at a
  floating 30–45 DTE.

Two mismatches (floating vs constant maturity, and call-only vs call+put) create
an artificial IV jump at the splice point. IV Rank is a relative measure over the
series (`(cur-min)/(max-min)`), so a methodology jump directly pollutes it. This
made Phase 3 a pre-launch must, not an optional refinement.

## Fix

Forward collection now uses the same constant-30-day convention as the backfill,
reading Polygon snapshot IV directly (no BS inversion — snapshots already carry
IV):

- `implied_vol.constant_maturity_atm_iv(expiry_points, target_days=30)` — pure:
  averages each expiry's call+put (`atm_iv_from_call_put`), then interpolates the
  `(dte, atm_iv)` points to the target maturity in total variance
  (`constant_maturity_iv`, which already brackets the segment containing 30).
- `derive_volatility.fetch_cm30_observations` — SQL takes, per daily snapshot and
  per bracketing expiry (DTE window 12–50), the ATM strike's call and put
  snapshot IV via `MAX(c.iv) FILTER (WHERE c.option_right = ...)`, one row per
  snapshot+expiry (nearest strike to underlying).
- `build_cm30_rows` — pure: groups by (symbol, metric_date), interpolates to
  cm30, and anchors provenance (`atm_expiry`/`atm_strike`/`atm_dte`) to the
  expiry nearest 30 with a usable ATM IV. Drops symbol-days with no usable IV.
- Writes `volatility_history.atm_iv` with `iv_source='polygon_snapshot_cm30'`.
  `upsert_atm_rows` now passes through `row.iv_source` (was hardcoded
  `polygon_derived`).
- env: `IV_CM30_ENABLED` (default true; false → legacy floating path),
  `IV_CM30_DTE_MIN/MAX` (12/50), `IV_CM30_TARGET_DAYS` (30).

## Provenance / cutover

`iv_source` distinguishes the three regimes so series analysis can reason about
method:

- `polygon_backfill_bs` — historical backfill, constant-30d.
- `polygon_snapshot_cm30` — forward, constant-30d (this change, 2026-07-23 on).
- `polygon_derived` — forward legacy floating ATM call (deprecated).

The forward legacy segment (2026-07-18…07-22) is within the 7-day
`option_chain_snapshots` retention, so the next `derive_volatility` run recomputes
those days as cm30 and overwrites them — healing the mid-series seam. Days beyond
retention cannot be recomputed, but none exist yet (backfill ended ~07-18).

## Verification

- Unit tests (9 new): `test_implied_vol.py` — call+put average then interpolate,
  missing-leg uses present leg, single-expiry holds flat, no-usable-leg → None.
  `test_derive_volatility.py` — interpolates to cm30 and labels source, provenance
  anchors to nearest-30 expiry, drops symbol-day with no usable IV, groups
  independently per symbol-day, SQL brackets 30 DTE and reads both rights.
- Live old-vs-new same-day diff (2026-07-23, production DB):

  | symbol | old floating | new cm30 | Δ (vol pts) | note |
  |--------|-------------:|---------:|------------:|------|
  | SPY    | 0.1571 | 0.1445 | −1.26 | call-only → call+put, interp to 30 |
  | QQQ    | 0.2515 | 0.2411 | −1.04 | |
  | TSLA   | 0.4118 | 0.4662 | **+5.44** | old call-only dropped the put skew |
  | MU     | 0.9779 | 0.9812 | +0.33 | anchor 36→29 DTE |

  These deltas are the artificial jumps the seam injected; cm30 matches the
  backfill convention so the spliced series is now method-consistent.
- Full collector suite: 263/263.

## Rollback

`IV_CM30_ENABLED=false` restores the legacy floating observation
(`polygon_derived`). No schema change — `iv_source` already existed.

## Files

- `collector/implied_vol.py` — `constant_maturity_atm_iv`.
- `collector/derive_volatility.py` — `fetch_cm30_observations`, `build_cm30_rows`,
  `_f`, cm30 env, `upsert_atm_rows` source passthrough, `run()` wiring.
- `collector/tests/test_implied_vol.py`, `collector/tests/test_derive_volatility.py`.
