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

## Remaining

Frontend surface — the endpoint is the data product; wiring a compact breadth
widget (suggested: beside the `/` home Market Regime) is a UI-placement decision
left for a follow-up. This is the R2.2 backend layer.

## Files

- `server/src/routes/market.js` — `percentile`, `pct`, `buildBreadth`,
  `sendMarketBreadth`, `/breadth` route, exports.
- `server/test/marketWeeklyRoute.test.js` — 3 tests.
