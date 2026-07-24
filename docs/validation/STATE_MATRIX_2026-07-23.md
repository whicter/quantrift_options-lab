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

## Frontend (2026-07-23)

Design chosen from a rendered mockup comparing two matrix layouts; the user
picked **方案 A — state columns (Trend Matrix style)**, the layout alphastockpro
is benchmarked on, over 方案 B (state cards). A new `/market` page is the
decision-language hub.

- `frontend/src/lib/stateMatrix.js` — pure `buildStateMatrixView(res)`: groups
  symbols into canonical-ordered buckets (zero-filling empty states so a state
  with no members still renders its column), builds the distribution-bar segments
  (insufficient excluded, % of total), and derives a compact per-symbol `signal`
  via `compactSignal` (state trigger, never an imperative).
- `frontend/src/pages/Market.jsx` — page: the options-native breadth panel
  (`MarketInternals`, migrated up from home) on top, then a distribution bar, then
  seven state columns. Each symbol chip links to Analyze, shows its compact
  signal, and carries the full `reasons` as a hover tooltip; an empty bucket shows
  "今日无". A footer discloses the active thresholds.
- Nav gains a 市场 entry; the breadth panel is removed from home (home keeps the
  slim regime strip). `api.js` gains `getMarketStateMatrix`.

## Verification

- Server: `classifyState`/`buildStateMatrix` unit-tested (9); suite 195/195.
- Frontend: `buildStateMatrixView`/`compactSignal` unit-tested (5, incl. a
  no-imperative assertion on the signal labels); suite 87/87; eslint + build clean.
- Live over the production DB (2026-07-23, 74 symbols): S1 20, S2 21, S3 0
  (quiet Friday, no volume breakouts), S6 9, S4 4, S5 9, S0 11, insufficient 0.
  Spot-checks read true: semis (SMH/SOXX/AMAT/MSFT) cluster in S0 on elevated IV;
  TSLA/PLTR/NFLX in S5; megacaps in S1/S2.

### Tuning note

The first cut triggered S2 on any negative 5-day return, so AAPL at -0.5% (noise)
was misclassified as a pullback and S2 ballooned to 29. Adding a ±1.5% `momBand`
(a pullback/stabilization must be a meaningful move) moved 8 noise cases back to
S1 — S1 12→20, S2 29→21 — a truer distribution.

## Remaining

The scanner-diversity integration (bucket by state before generating candidates)
is a separate follow-on step; R1.3 rotation and R1.2 briefing will join `/market`.

## Files

- `server/src/routes/market.js` — `STATE_META`, `STATE_THRESHOLDS`,
  `classifyState`, `buildStateMatrix`, `sendMarketStateMatrix`, `/state-matrix`.
- `server/test/marketWeeklyRoute.test.js` — 9 tests.
- `frontend/src/lib/stateMatrix.js` (+ `.test.js`, 5), `frontend/src/pages/Market.jsx`,
  `frontend/src/lib/api.js` (`getMarketStateMatrix`), `frontend/src/App.jsx` (route),
  `frontend/src/components/NavBar.jsx` (市场 link), `frontend/src/pages/Home.jsx`
  (breadth migrated out), `frontend/src/index.css` (`.market-page`, `.sm-*`, tone tokens).
