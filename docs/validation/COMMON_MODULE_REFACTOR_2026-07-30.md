# Common Module Refactor Validation — 2026-07-30

## Scope

Behavior-preserving internal refactor across three independently deployed
runtimes:

- Node server Market calculations moved from the Express route to
  `server/src/domain/market/`.
- Node cross-route ticker, finite-number/date, New York market-date, and
  route-test response helpers moved to shared server modules.
- Scanner read and materialization paths share the quoted-chain eligibility and
  candidate contract-projection SQL fragments.
- Python Polygon transport consolidated in
  `collector/providers/polygon_http.py`.
- Python collector environment/logging and symbol-override parsing consolidated
  in `collector/collector_runtime.py`.
- Browser JSON transport consolidated in `frontend/src/lib/http.js`.
- Browser formatters, simple read-only async resources, repeated company-logo
  failure handling, and research-note styling consolidated in frontend modules.

No API path, request field, response schema, provider selection, scoring rule,
or product disclosure boundary was intentionally changed.

## Focused evidence

- `cd server && node --test test/marketWeeklyRoute.test.js`
  - 28 passed, 0 failed.
- `cd collector && .venv/bin/python -m unittest tests.test_polygon_http tests.test_polygon_price_provider tests.test_polygon_reference_metadata tests.test_market_breadth tests.test_polygon_option_provider`
  - 42 passed, 0 failed.
- `cd frontend && node --test src/lib/http.test.js`
  - 4 passed, 0 failed.
- `cd frontend && npx eslint src/lib/http.js src/lib/http.test.js src/lib/api.js`
  - passed.
- `cd server && node --test test/symbols.test.js test/marketWeeklyRoute.test.js test/supportResistanceRoute.test.js test/technicalLevelsRoute.test.js test/analyzeRoute.test.js test/pricesRoute.test.js test/chainStatsRoute.test.js`
  - 82 passed, 0 failed.
- `cd collector && .venv/bin/python -m unittest tests.test_collector_runtime tests.test_collect_prices tests.test_collect_options_symbols tests.test_materialize_oi_delta tests.test_compute_gex_walls tests.test_materialize_scan_volatility`
  - 36 passed, 0 failed.
- `cd frontend && npm run lint && npm test`
  - ESLint passed; 118 tests passed, 0 failed.
- `cd server && node --test test/optionChainSql.test.js test/analyzeRoute.test.js test/scanRoute.test.js test/materializeScannerCandidates.test.js`
  - 36 passed, 0 failed.

## Full regression

- `cd server && npm test`
  - 285 passed, 0 failed.
- `cd collector && .venv/bin/python -m unittest discover -s tests`
  - 303 passed, 0 failed.
- `cd frontend && npm run verify`
  - ESLint passed.
  - 118 tests passed, 0 failed.
  - Vite production build passed.
  - `check-dist` found 8 files, no source maps, and no secret patterns.
  - Vite emitted the existing non-fatal chunk-size warning: the main JS chunk
    is 692.19 kB before gzip.

`git diff --check` passed. No live provider, database, Railway, or Vercel
mutation was required because this refactor preserves runtime contracts.

The frontend rolling-deploy fallback remains intentionally in
`frontend/src/lib/marketBriefing.js`: a newly deployed frontend can still meet
an older backend briefly during a staggered deployment. Removing it requires
hosted frontend/backend deployment-state verification, not a local dedup pass.
