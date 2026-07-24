# Daily Market Briefing (R1.2) — 2026-07-23

## Goal

A market-level daily briefing (competitor: nextpick's briefing): one-glance
synthesis of the whole `/market` page — market tilt, gamma breadth, IV face,
state distribution, sector leaders/laggards — plus the "what matters today" items
not in the detail panels (earnings ahead, top option activity). A market summary,
not a trade signal.

## Two data corrections (both were mine; the data is healthy)

While scoping, I twice misread the data. Corrected:

- **Earnings** live in `iv_history.earnings_date` (written by `collect.py` from TT
  metrics, read by `metrics.js`), not `symbol_metrics_snapshots`. 56 symbols carry
  a date; 10 fall in the next week (KLAC/STX/BA 7/28, MSFT/META 7/29, AMZN/AAPL 7/30…).
- **ΔOI is NOT mostly zero.** Over the last 2 days `option_oi_delta_snapshots` has
  571k rows — 40% zero (contracts that genuinely didn't change day-over-day), 32%
  null (no prior-day baseline yet), and **28% (158k) nonzero**, 184k `confirmed`.
  Aggregating `SUM(ABS(oi_delta))` per symbol gives a rich top list: NFLX 945k,
  SPCX 829k, XLE 752k, SPY 700k, GDX 612k, NBIS, IREN, NVDA… An earlier sample
  that happened to hit QQQ's zero rows produced the wrong "mostly 0" impression.

## Implementation

- Refactor: `loadBreadth` / `loadStateMatrix` / `loadSectorRotation` extract each
  aggregation's query+build so the briefing and the existing endpoints share one
  copy (no SQL duplication); the three handlers became thin wrappers. Server suite
  stayed 199/199 through the refactor.
- Pure `buildBriefing({breadth, stateMatrix, rotation, spyGamma, qqqGamma,
  earnings, unusual, dateLabel})`: derives a market tilt (S1 vs S5) and a
  synthesized headline (positive-gamma %, IV-rank median, state distribution,
  sector leaders/laggards, earnings-ahead), plus structured callouts. Degrades
  gracefully on empty inputs.
- `GET /api/market/briefing` runs the three loaders + regime gamma (SPY/QQQ) +
  earnings (iv_history, next 7 days) + top unusual (oi_delta aggregate) and calls
  buildBriefing.
- Frontend `components/MarketBriefing.jsx` at the top of `/market`: the headline
  card (tilt-colored left rail) + callouts (index gamma, earnings-ahead chips,
  ΔOI chips → Analyze). The headline is server-composed so it can be materialized
  / shared later.

## Verification

- Server: `buildBriefing` unit-tested (4: tilt + headline synthesis, callouts +
  gamma labels, bearish tilt, empty-degrade); suite 203/203.
- Frontend: display-only component (synthesis tested server-side); suite 92/92,
  eslint + build clean.
- Live end-to-end headline (2026-07-24): "2026-07-24 市场偏多头，51.3% 标的处正
  Gamma，IV Rank 中位 58，状态 强势上行 20 / 回调 21 / 空头 9，11 只高波动观望，板块
  能源、保险 领跑、太阳能、机器人/AI 落后，未来一周 10 只财报（KLAC、STX、BA、FCF…）。"
  Callouts carried SPY/QQQ 负Gamma, 10 earnings, top unusual NFLX/SPCX/XLE/SPY/GDX.

## Remaining (MVP scope)

On-demand today (read-only, reuses the aggregates, cheap). The task's "materialize
one per day + shareable link/card" is a follow-on step.

## Files

- `server/src/routes/market.js` — `loadBreadth`/`loadStateMatrix`/`loadSectorRotation`
  extraction, `buildBriefing`, `sendMarketBriefing`, `/briefing`.
- `server/test/marketWeeklyRoute.test.js` — 4 tests.
- `frontend/src/components/MarketBriefing.jsx`, `frontend/src/lib/api.js`
  (`getMarketBriefing`), `frontend/src/pages/Market.jsx`, `frontend/src/index.css` (`.brief-*`).
