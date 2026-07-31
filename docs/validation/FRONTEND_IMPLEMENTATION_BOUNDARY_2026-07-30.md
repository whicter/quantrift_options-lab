# Frontend Implementation Boundary — 2026-07-30

## Goal

Keep proprietary implementation and operational details out of product pages.
The browser UI may show user-meaningful results, availability, timestamps, risk
notes and user-controlled filters. It must not render model versions, formulas,
threshold rationale, scoring ingredients, weights, proxy assumptions,
aggregation methods, provider identities, queue/coverage internals or raw
errors.

## Implemented

- Removed the shared `DataDetails` component from Analyze, Scan and Weekly.
- Removed the `/ledger` product page, navigation entry and public read route.
  `candidate_ledger`, capture and expiry evaluation remain backend-only.
- Added a wildcard frontend redirect so removed/unknown paths such as `/ledger`
  return to the product home page rather than rendering an empty shell.
- Replaced opaque numeric scores on Home, Analyze and Weekly with user-facing
  state labels.
- Reworded Analyze, Scan, Market, Earnings, Weekly, account and payoff surfaces
  to describe results and risk without exposing calculation mechanics.
- Reduced Analyze and Technical Levels display adapters so unused
  source/provider/model/evidence fields do not enter component props.
- Added static regression tests for forbidden implementation-copy fragments and
  raw metadata fields.

## Related product-shell follow-up

- Navigation labels are `市场概览 / 个股分析 / 期权扫描 / 周复盘 / 策略库`;
  the Analyze page title is `个股/ETF 分析`.
- `/market` uses the same elastic product content rail as the other routes
  instead of a page-specific 1160px maximum.
- The Analyze quote header gives ticker and price the same 24px visual tier and
  aligns both primary and secondary rows.
- Scanner candidate titles and atomic facts wrap with soft indentation instead
  of truncation; duplicate debit text is removed.

The candidate wrapping work was delivered in `05559cd`; shared width and naming
alignment were delivered in `de5b29f` and `6d47ff7`.

## Documentation boundary

Internal documentation may retain formulas, model versions and replay details so
the system remains reproducible. Product documentation now distinguishes those
backend validation contracts from the much smaller rendered contract. Historical
validation records retain their original evidence and carry a current-status note
when a former public surface has been removed.

## Verification

- `cd frontend && npm run verify`
  - ESLint: passed.
  - Frontend tests: **106 passed**.
  - Production build: passed.
  - `check:dist`: passed; no source maps or secret patterns.
  - The existing Vite chunk-size warning remains informational.
- `cd server && npm test`
  - Server tests: **244 passed**.
- Browser smoke audit against the local app:
  - Analyze tabs 0–3, Scan, Weekly sections 0–1, Market, Earnings and `/ledger`.
  - Forbidden implementation-detail phrase matches: **0**.
  - `/ledger` redirects to `/`.
- `git diff --check`: passed.

## Deployment status

This record verifies the local repository state only. Production deployment and
hosted acceptance were not performed as part of this change.
