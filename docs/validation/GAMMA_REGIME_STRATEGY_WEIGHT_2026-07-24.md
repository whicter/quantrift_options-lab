# Dealer Gamma Regime → Strategy Weighting (2026-07-24)

## Goal

User shared a post about "Long Gamma" options strategies and asked for a
classification of strategies by Greek exposure, then asked to add this
consideration into the recommendation engine: "推荐的策略也要考虑这些".

## Classification researched (web search, not invented)

Gamma and Theta are nearly exact opposites under Black-Scholes
(Theta ≈ −½·Gamma·S²·σ²), so "long gamma" ≈ "short theta". By Gamma×Vega:

- **Long gamma / long vega / short theta** (buy premium): Long Call, Long Put,
  Long Straddle, Long Strangle, Backspreads.
- **Short gamma / short vega / long theta** (sell premium): naked
  Calls/Puts, Short Straddle/Strangle, Iron Condor/Butterfly, Covered Call,
  Cash-Secured Put, Credit Verticals, Jade Lizard.
- **Special case**: Calendar/Diagonal spreads are short gamma near the front
  expiry but long vega (the back-month leg carries more vega).

## Finding before writing code: the weighting subsystem was dead in production

`candidateEngine.cjs` already had a complete `directionalWeight(strategy,
environment)` system (trend alignment + IV-rank tilt), fully unit-tested — but
**neither real caller ever supplied an `environment` argument**:
`scan.js:443` and `materializeScannerCandidates.js:135` both called
`buildActionableSetups(...)` without the 5th positional `environment` param, so
it always defaulted to `null`. The function's early-return guard
(`if (!environment || !environment.trendRegime) return neutral`) meant the
entire subsystem — trend weighting, IV-rank weighting, and now gamma weighting —
had been fully built, fully tested, and **never once activated in production**.

This is why the guard had to change from `!environment.trendRegime` to
`!environment`: a `trendRegime`-less environment (all that's realistically
available at either call site today) must still let the gamma tilt apply
independently.

## Implementation

- `STRATEGY_GAMMA_PROFILE`: all 13 `ACTIONABLE_STRATEGIES` classified
  `long_gamma` or `short_gamma` per the table above (Calendar/Diagonal ->
  `short_gamma`, matching the near-expiry-dominates characterization).
- `directionalWeight` rewritten: guard now only requires `environment` itself;
  trend/IV/gamma branches each act independently and compose. Gamma branch:
  negative dealer gamma (short gamma, hedging amplifies moves) boosts
  `long_gamma` strategies ×1.1 and discounts `short_gamma` ones ×0.9; positive
  dealer gamma (hedging dampens/pins) does the reverse. This is a soft
  market-structure tilt, never a `conflict` — it produces an independent,
  informational `gammaNote` (distinct from the trend-conflict `note`/warning).
- Wired at both real call sites: `scan.js` and `materializeScannerCandidates.js`
  now pass `{ gammaRegime: row.gamma_regime || null }` — the data was already on
  `row`, just never threaded through. The materialize job also persists
  `signals_json.gamma_note`.
- DTO/frontend passthrough: `candidateDto.cjs`, `analyzeRecommendation.js` carry
  `gammaNote` unconditionally (not gated behind `directionConflict`);
  `Tab1Overview.jsx` renders it in a new `.az-rec-context` info box (blue,
  distinct from the yellow `.az-rec-warning`).

## Verification

- Server: 7 new pure-function tests on `directionalWeight` (incl. a regression
  guard proving gamma now works with only `gammaRegime`, no `trendRegime`;
  both boost/discount directions for both gamma profiles; composition with the
  trend tilt; unrecognized regime is a no-op; every `ACTIONABLE_STRATEGIES`
  entry has a gamma profile) + 1 `buildActionableSetups` passthrough test + 2
  `candidateDto` tests + 1 assertion added to the existing
  `materializeScannerCandidates` test. Full suite: **221/221**.
- Frontend: 1 new test (`gammaNote` passes through independent of
  `directionConflict`). Full suite: **93/93**; eslint + build clean.
- Live smoke against production data: queried a real symbol with a current
  `gamma_regime` and a quoted option chain, ran the actual engine —
  **TSLL** (negative gamma) → Long Put boosted from score 54.0 to
  effectiveScore 59.4 (×1.1), `gammaNote`: "负 Gamma 环境：做市商对冲往往放大波动，
  利于做多 Gamma".

## Files

- `server/src/domain/scanner/candidateEngine.cjs` — `STRATEGY_GAMMA_PROFILE`,
  `directionalWeight` rewrite, `gammaNote` on the candidate object.
- `server/src/domain/scanner/candidateDto.cjs` — `gammaNote` passthrough.
- `server/src/routes/scan.js`, `server/src/jobs/materializeScannerCandidates.js`
  — environment wiring (`{ gammaRegime: row.gamma_regime || null }`).
- `frontend/src/lib/analyzeRecommendation.js`,
  `frontend/src/pages/analyze/Tab1Overview.jsx`, `frontend/src/index.css`
  (`.az-rec-context`).
- `server/test/candidateEngine.test.js`, `server/test/candidateDto.test.js`
  (new), `server/test/materializeScannerCandidates.test.js`,
  `frontend/src/lib/analyzeRecommendation.test.js`.

## Note

`trendRegime` remains unwired at both call sites (no trend signal is
constructed/passed today) — that half of the pre-existing subsystem stays inert
until a real trend source (e.g. the R1.1 State Matrix classification) is threaded
in. Out of scope for this change; flagged for a future pass.
