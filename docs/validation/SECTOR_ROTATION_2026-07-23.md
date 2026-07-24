# Sector Rotation RRG (R1.3) — 2026-07-23

## Goal

The rotation view competitors have (nextpick RRG, alphastockpro sector strength)
and we lacked (gap G3): where money is rotating across sectors/themes, shown as a
simplified Relative Rotation Graph.

## Data-reality decision: ETFs as the sector proxy

The plan was "aggregate per-symbol data by `symbol_universe.sector`". Reality: the
SIC-derived `sector` field is **65% null (52/80 scan symbols)** and **never
classifies ETFs** — aggregating it would cover 28 stocks across 5 sectors and miss
every sector ETF. So each sector/theme ETF is used as its own rotation point
(XLE = energy, SMH = semis, …; all 11 GICS SPDRs + themes, 26 total). This is both
more honest and the canonical way an RRG is drawn (RRGs are sector-ETF graphs).

## Method (RRG-lite vs SPY)

Pure `buildSectorRotation(rows, benchmark='SPY')` in `server/src/routes/market.js`:

- `rs` = ETF 20-day return − benchmark 20-day return (relative strength, %).
- `momentum` = recent relative pace (`ret5 − bench.ret5`) − the month's average
  per-5-day relative pace (`rs / 4`) — i.e. is the relative strength accelerating.
- The (rs, momentum) sign pair → four RRG quadrants: **leading** (strong &
  accelerating), **weakening** (strong & decelerating), **improving** (weak &
  accelerating), **lagging** (weak & decelerating).
- Fails closed (`missing`) when the benchmark has no return; ignores symbols not in
  the curated ETF map; carries per-ETF context (ret20, iv_rank, gamma, above_ma50).

`GET /api/market/sector-rotation` runs one SQL pass (close/close5/close20/ma50 for
the ETF set + SPY), joined to latest gamma + iv_rank, and returns the sectors +
quadrant counts. Benchmark is `ROTATION_BENCHMARK` (SPY).

## Frontend — scatter + linked list (overlap solved)

Design approved from a rendered, interactive mockup. RRG scatters overlap when
ETFs cluster; the fix (as in StockCharts/Optuma) is scatter + a legible list,
linked:

- `frontend/src/lib/sectorRotation.js` — pure: `dotPosition` maps (rs, momentum)
  to plot x/y% (clamped to the plot half-width, y inverted); `buildRotationView`
  groups dots by quadrant (canonical order, sorted by rs desc) and tags each with
  its quadrant tone.
- `frontend/src/components/SectorRotation.jsx` — the scatter (dots carry the flow
  picture; a hovered dot rises to front, enlarges, shows a tooltip) beside a
  quadrant list that stays fully legible at any density. A single `hovered` state
  cross-highlights the twin in both views. No chart library (self-drawn, per the
  project convention). Placed on `/market` under the State Matrix.

## Verification

- Server: `buildSectorRotation` unit-tested (4: quadrant mapping from rs/momentum,
  benchmark-missing fail-closed, non-ETF ignored + missing-return skipped, labels
  contain no buy/sell words); suite 199/199.
- Frontend: `buildRotationView`/`dotPosition` unit-tested (5: x/y mapping +
  clamping, dot tone + grouping, rs-desc sort, empty-quadrant group present,
  non-ready/empty passthrough); suite 92/92; eslint + build clean.
- Live over the production DB (2026-07-23, 26 ETFs vs SPY +1.9%): leading 6
  (XLE +6.8 leads; energy + defensives XLU/XLV/XLP), weakening 3 (IBB/XLF/IGV),
  improving 11 (incl. XLK/SMH/SOXX — tech/semis the weakest relative strength but
  momentum turning up), lagging 6 (homebuilders, TAN/BOTZ). Coherent "money out of
  semis/tech into energy + defensives" story; semis' high IV (SMH 85, SOXX 83)
  corroborates their S0 high-vol classification.

## Files

- `server/src/routes/market.js` — `SECTOR_ETFS`, `ROTATION_BENCHMARK`, `round2`,
  `buildSectorRotation`, `sendSectorRotation`, `/sector-rotation`.
- `server/test/marketWeeklyRoute.test.js` — 4 tests.
- `frontend/src/lib/sectorRotation.js` (+ `.test.js`, 5),
  `frontend/src/components/SectorRotation.jsx`, `frontend/src/pages/Market.jsx`,
  `frontend/src/lib/api.js` (`getSectorRotation`), `frontend/src/index.css` (`.rrg-*`).
