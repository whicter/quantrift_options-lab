# Honest Price As-Of Label (P3) — 2026-07-23

## Problem

The Analyze price header rendered `result.price` bare (`Analyze.jsx`, the
`az-price` div) with no timestamp. Worse, `result.price` has two origins that
the header could not distinguish:

- **intraday spot** — `applyGex` overrides the price with
  `gexData.underlying_price` (the ~5-min option-snapshot spot) when GEX is
  usable (`analyzeData.js`), and
- **prior daily close** — otherwise it stays `price_history.close`, the last
  daily bar.

So a prior daily close (e.g. a Friday close shown the following Monday) rendered
identically to a live in-session price, with no way for the user to tell. This
is the same honesty failure behind the 2026-07-20 "$391 shown as TSLA's current
price" incident.

## Fix

A single `priceAsOf` object now travels with the price and names its origin:

1. `createRealAnalysis` seeds `priceAsOf = {kind:'close', date, ts:null}` from
   the daily bar's market date.
2. `applyGex` overrides it to `{kind:'intraday', ts:snapshot_ts, freshness}`
   **only** when `gexData.underlying_price` wins; otherwise it keeps the seeded
   daily-close as-of (the GEX-unusable early-return already carries it via
   `...data`).
3. The header renders `formatPriceAsOf(priceAsOf)` under the price:
   - intraday → `截至 MM-DD HH:MM ET`, with ` · 延迟` appended when freshness is
     not `fresh`. The timestamp is converted to America/New_York via
     `toLocaleString`, not shown raw-UTC, so the time is truthful.
   - close → `截至 YYYY-MM-DD 收盘`, so a prior close is explicitly a close.
4. Server parity: `analyzeDto.buildAnalyzeSummary` adds `price_as_of`
   (`{kind:'intraday', ts, freshness}` when positioning has a price, else null).
   The frontend `/summary` cutover is still pending; this keeps the two paths in
   sync per the CLAUDE.md rule.

## Verification

- frontend `analyzeData.test.js`: usable-GEX override stamps an intraday as-of
  from the snapshot ts; unusable GEX keeps the daily-close as-of instead of
  faking an intraday one.
- server `analyzeSummary.test.js`: DTO carries an intraday `price_as_of` from
  the snapshot ts; omits it (null) when positioning has no price.
- Full sweeps green: frontend 76/76, server 184/184; eslint clean; Vite build
  clean (pre-existing chunk-size warning only).
- Market closed at implementation time (21:52 ET Thu), so the header currently
  shows the daily-close label `截至 2026-07-xx 收盘` — which is exactly the
  correct, honest behavior when there is no in-session price.

## Files

- `frontend/src/pages/Analyze.jsx` — `formatPriceAsOf`, `priceAsOf` seed,
  header render, `az-price-block` wrapper.
- `frontend/src/lib/analyzeData.js` — `priceAsOf` override in `applyGex`.
- `frontend/src/index.css` — `.az-price-block` / `.az-price-asof`.
- `server/src/domain/analyze/analyzeDto.js` — `price_as_of` field.
