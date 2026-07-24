# Options-Native Market Breadth (R2.2) — backend — 2026-07-23

## Goal

A market-breadth product the three competitors lack: not just "% of stocks above
their MA", but an options-native read of market health — % positive/negative
dealer gamma, the IV-rank distribution across the universe, and the PCR
distribution. Pure aggregation of data already in the database; zero new
collection.

## Endpoint

`GET /api/market/breadth` (`server/src/routes/market.js::sendMarketBreadth`),
mounted at `/api/market/breadth`. Three parallel SQL aggregations over the
`scan_enabled` universe:

- **trend** — per symbol, latest close vs MA50/MA200 computed in SQL
  (`AVG(close) FILTER (WHERE rn <= N)`); symbols with fewer than N bars are
  excluded from that band.
- **gamma** — latest `gex_snapshots.gamma_regime` and `pcr_oi` per symbol.
- **iv_rank** — latest `volatility_history.iv_rank` per symbol (ready rows only).

`buildBreadth` and `percentile` are pure and unit-tested. Every block reports a
`counted` sample size, and `pct()` returns null (not a fake 0) when a block has
no data — so a thin product never reads as broad. Response also carries
`universe_count` and `gamma_as_of`.

## Verification

- Unit tests (3, `test/marketWeeklyRoute.test.js`): percentile interpolation +
  thin/empty inputs; full breadth aggregation (bar-count exclusion, null-regime
  exclusion, elevated %, PCR median); zero-count discloses null not 0.
- Full server suite: 187/187.
- Live smoke against the production DB (2026-07-23, 80 symbols with data):

  | block | value |
  |-------|-------|
  | gamma | 55% positive / 45% negative (counted 80) |
  | iv_rank | median 59.5, p25–p75 39.9–72.8, 64.3% elevated (counted 56) |
  | trend | 43.2% above MA50, 68.9% above MA200 (counted 74) |
  | pcr | median 0.98, p25–p75 0.56–1.80 (counted 80) |

  56 of 80 have a ready IV rank (the rest lack the 252-observation history),
  correctly disclosed via `counted` rather than silently dropped.

## Frontend (2026-07-23)

Design was chosen from a rendered mockup comparing two layouts; the user picked
**方案 B — a Market Internals panel** with mini distribution graphics (over 方案 A,
a compact one-line strip). Built to the product's own tokens.

- `frontend/src/lib/marketBreadth.js` — pure `buildBreadthView(breadth)` turns the
  API response into render-ready geometry: gamma split widths, IV/PCR p25–p75
  band insets and median-marker positions (`scalePos` maps a value into 0–100%
  on its domain, clamped; PCR domain `[0.3, 2.3]`). Each block collapses to null
  when its `counted` is 0, and the view reports `empty` when nothing is usable —
  so a thin product renders nothing rather than fake bars.
- `frontend/src/components/MarketInternals.jsx` — renders the panel: dealer-gamma
  split bar (hero), IV-rank and PCR quartile tracks, % above MA50/MA200 bars.
  `gamma_as_of` shown in ET (consistent with the P3 price label). Stays quiet
  while loading and hides on missing/empty.
- Placed on the home page between the hero and the workflow cards
  (`.home-internals`); color semantics reuse the product tokens (positive green /
  negative red / IV blue / PCR yellow).

## Verification

- Server: `buildBreadth`/`percentile` unit-tested (3); suite 187/187.
- Frontend: `buildBreadthView`/`scalePos` unit-tested (6, geometry + null
  collapse + empty + non-ready passthrough); suite 82/82; eslint + Vite build
  clean.
- Live smoke against the production DB (2026-07-23, 80 symbols with data):

  | block | value |
  |-------|-------|
  | gamma | 55% positive / 45% negative (counted 80) |
  | iv_rank | median 59.5, p25–p75 39.9–72.8, 64.3% elevated (counted 56) |
  | trend | 43.2% above MA50, 68.9% above MA200 (counted 74) |
  | pcr | median 0.98, p25–p75 0.56–1.80 (counted 80) |

  56 of 80 have a ready IV rank; disclosed via `counted` rather than dropped.

## Files

- `server/src/routes/market.js` — `percentile`, `pct`, `buildBreadth`,
  `sendMarketBreadth`, `/breadth` route, exports.
- `server/test/marketWeeklyRoute.test.js` — 3 tests.
- `frontend/src/lib/marketBreadth.js`, `frontend/src/lib/marketBreadth.test.js` (6),
  `frontend/src/components/MarketInternals.jsx`, `frontend/src/lib/api.js`
  (`getMarketBreadth`), `frontend/src/pages/Home.jsx`, `frontend/src/index.css`
  (`.mi-*`, `.home-internals`).
