# Analyze Public DTO Boundary — 2026-07-30

## Goal

Prevent normal Analyze API responses from sending proprietary decision rules or
raw internal rationale to the browser. Hiding a field in React is insufficient
when the same field remains visible in browser network tools.

## Implementation

- Added the allowlist-only
  `server/src/domain/analyze/publicCandidateDto.cjs`.
- `GET /api/analyze/:symbol/candidate` no longer serializes the full
  environment, pullback structure or scanner candidate DTO.
- Missing-candidate responses no longer return internal filter/data reasons.
- Complete rules remain in backend modules, tests and
  `docs/ANALYZE_DECISION_RULES_INTERNAL.md`.
- The frontend now consumes the public structure's direct `favours` field; it
  no longer depends on the internal `expression` object.

## Fields removed from the product response

- Environment: exact IV Rank, Gamma-side mapping, `reason`, `inputs` and
  `gammaFavours`.
- Pullback structure: confirmation list, support kind/level/distance, reason,
  expression shape/text and backend caveat.
- Candidate: score, ranking/pricing rationale, direction/Gamma notes, liquidity
  diagnostics, expected-move metadata and provenance.
- Payoff/POP: model version, distribution, rate, IV inputs, basis, reference
  price/profit, breakevens and input snapshot timestamps.
- Contract details: bid, ask and contract symbol.

## Verification

- Focused server DTO/route tests: passed.
- Focused frontend adapter/disclosure tests: passed.
- `cd frontend && npm run verify`
  - ESLint: passed.
  - Frontend tests: **112 passed**.
  - Production build: passed.
  - `check:dist`: passed; no source maps or secret patterns.
  - Existing Vite chunk-size warning remains informational.
- `cd server && npm test`
  - Server tests: **280 passed**.
- `git diff --check`: passed.

## Deployment status

This record verifies repository behavior. Hosted API acceptance was not
performed; after deployment, production verification should confirm that the
candidate response contains only the documented allowlist.
