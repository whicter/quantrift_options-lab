# Wide OI-by-Strike + Full-Chain Max Pain — 2026-07-23

## Problem

The OI-by-strike chart was sparse and Max Pain was a near-money estimate because
both read the narrow ~6-strike Greeks chain (`OPTION_MAX_STRIKES_PER_SIDE=6`,
tuned for GEX cost). TSLA stored only 9 strikes. A fixed % or fixed strike count
is wrong across the universe by an order of magnitude (SPY 15% IV vs SOXL 189%).

## Design (Plan B x adaptive)

Two orthogonal decisions: **window width** (adaptive to the symbol's implied
move) x **what to fetch** (a dedicated OI-only wide fetch, separate from the
Greeks chain GEX needs).

- `adaptive_oi_window_pct(spot, iv, max_dte, n_sigma=1.5, min_pct=8, max_pct=60)`
  = `100 * n_sigma * iv * sqrt(t)`, clamped. IV is decimal; missing IV uses a
  default. SPY 0.15 -> ±11%, TSLA 0.48 -> ±36%, SOXL 1.89 -> ±60% (cap).
- `fetch_oi_by_strike(symbol, spot, iv)`: OI-only paginated snapshot fetch over
  the adaptive window; per-side strike count bounded (`_bound_oi_strikes`);
  returns `{points:[{strike,call_oi,put_oi,total_oi}], max_pain, window_pct}`.
  No Greeks/quotes, so it stays cheap at ~50 strikes/side. Best effort — any
  failure returns empty and never breaks the snapshot.
- `max_pain_from_oi`: full-chain max pain (strike minimizing total intrinsic
  payout across every strike's call+put OI).
- The Greeks-bearing chain that GEX uses is unchanged (still narrow, cost flat).

## Data flow

- `OptionChainSnapshot.oi_by_strike` field; provider fills it in
  `fetch_option_chain` after the term-structure fetch.
- worker `latest_db_iv` (volatility_history.atm_iv -> iv_history.iv30) passes
  `iv_hint`; `fetch_option_chain(iv_hint=...)`.
- `option_chain_snapshots.oi_by_strike` JSONB column (additive migration,
  applied to production Railway); `collect_options.persist_snapshot` writes it.
- `chain.js::deriveOiDensity` prefers the stored wide OI (adds `max_pain`,
  `window_pct`, `aggregation:'wide_oi_only_adaptive_window'`); falls back to the
  narrow chain for pre-existing snapshots.
- Frontend `analyzeData.js` passes `maxPain`/`windowPct`; Tab4 OI card shows
  "Max Pain $X · ±Y% 全链" and the strike count; the chart is now continuous.

## Verification

- collector 247/247, server 173/173, frontend 71/71 (eslint + Vite build clean).
- Live end-to-end: TSLA spot $319.69 -> wide OI **62 strikes** ($225-412.5,
  ±29.8% window), **full-chain Max Pain $382.5** (vs sparse-data $370). An
  earlier TSLA run at $369.57 gave 94 strikes ($240-500) and max pain $390,
  seeing the 48k put OI at $350 and call OI at $405/$460 the narrow chain missed.
- Adaptive window: SPY ±11%, TSLA ±36%, SOXL ±60% (cap) — a fixed value would be
  wrong for all three.

## Note on two max-pain values

`compute_gex.py::compute_max_pain` (narrow chain, stored in
`gex_snapshots.max_pain`) is left unchanged and still backs the GEX DTO. The OI
chart and Analyze show the new full-chain value (`oi_density.max_pain`). The two
use different strike coverage by design; documented so they are not conflated.

## Rollback

Set `OPTION_OI_BY_STRIKE_ENABLED=false` (provider stops the fetch; server falls
back to the chain). The additive column and stored JSON are harmless if unused.
