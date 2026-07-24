# Symbol State Matrix (R1.1) — backend — 2026-07-23

## Goal

The "decision language" layer competitors have and we lacked (gap G2): classify
the whole scan universe into a small set of actionable market **states** with
per-symbol reasons, so a user reads "which of my ~200 names are in an uptrend
pulling back / breaking out / capitulating" instead of synthesizing raw numbers
themselves. Compliance boundary respected — labels describe the **state**, never
prescribe entry/stop/target; this is a cross-sectional classification, not a
buy/sell signal.

## State machine (user-approved 6 + fallback, 2026-07-23)

Structure-first, first-match-wins so states never overlap:

1. **S0 高波动/事件** — gate: `IV Rank ≥ 80` OR `RVol ≥ 2.5`. Signal reliability
   is low when vol/volume blow out; flag and stand aside.
2. **S3 区间突破** — `close > prior-20d high` AND `RVol ≥ 1.5`. A fresh volume
   breakout is distinct and worth surfacing regardless of MA structure.
3. **Uptrend** (`close > MA200` AND `MA50 > MA200`):
   - **S2 上行·回调中** if `close < MA50` OR `ret5 ≤ -momBand`
   - else **S1 强势上行** (reason flags 追高区 when `ext50 ≥ extHigh`)
4. **Downtrend** (`close < MA200` AND `MA50 < MA200`):
   - **S4 下行·企稳试探** if `close > MA50` OR `ret5 ≥ +momBand`
   - else **S5 空头**
5. **S6 区间/中性** — fallback (MAs interleaved, no clean trend).
6. **insufficient** — fewer than 200 daily bars (MA200 unavailable).

`gamma_regime` rides along as per-symbol context but does not drive the state
(matches the approved rule table). Thresholds are env-overridable:
`STATE_IVR_HIGH` (80), `STATE_RVOL_SPIKE` (2.5), `STATE_RVOL_BREAKOUT` (1.5),
`STATE_EXT_HIGH` (3), `STATE_MOM_BAND` (1.5).

## Implementation

- `server/src/routes/market.js`: pure `classifyState(signals, thresholds)` and
  `buildStateMatrix(rows)` (per-symbol classification + a distribution count that
  zero-fills every state, so an empty bucket reads as 0, not missing).
- `GET /api/market/state-matrix`: one SQL aggregation over the `scan_enabled`
  universe (close, MA50/MA200, 5-/20-day return, prior-20d high, RVol via
  `AVG(volume) FILTER`), joined to latest `gex_snapshots.gamma_regime` and
  `volatility_history.iv_rank`. Returns per-symbol `{state, reasons[], signals}`,
  the state metadata (ordered, for stable bucket rendering), and the distribution.

## Verification

- Unit tests (9): insufficient history; S0 gate wins over trend; S3 breakout;
  S1-vs-S2 (incl. a -0.5% tick staying S1, a -2% move becoming S2); S5-vs-S4
  (incl. a +0.5% bounce staying S5); S6 fallback; distribution zero-fill; and a
  compliance assertion that no state label contains 入场/止损/目标价/买入/卖出/buy/sell.
- Full server suite: 195/195.
- Live over the production DB (2026-07-23, 74 symbols): S1 20, S2 21, S3 0
  (quiet Friday, no volume breakouts), S6 9, S4 4, S5 9, S0 11, insufficient 0.
  Spot-checks read true: semis (SMH/SOXX/SOXX/AMAT/MSFT) cluster in S0 on
  elevated IV; TSLA/PLTR/NFLX in S5; megacaps in S1/S2.

### Tuning note

The first cut triggered S2 on any negative 5-day return, so AAPL at -0.5% (noise)
was misclassified as a pullback and S2 ballooned to 29. Adding a ±1.5% `momBand`
(a pullback/stabilization must be a meaningful move) moved 8 noise cases back to
S1 — S1 12→20, S2 29→21 — a truer distribution.

## Remaining

Frontend `/market` page (the decision-language hub; R1.3 rotation and R1.2
briefing will join it, and the existing breadth Market Internals moves in). Built
mockup-first (like R2.2) so the layout is approved before implementation. The
scanner-diversity integration (bucket by state before generating candidates) is a
separate follow-on step.

## Files

- `server/src/routes/market.js` — `STATE_META`, `STATE_THRESHOLDS`,
  `classifyState`, `buildStateMatrix`, `sendMarketStateMatrix`, `/state-matrix`.
- `server/test/marketWeeklyRoute.test.js` — 9 tests.
