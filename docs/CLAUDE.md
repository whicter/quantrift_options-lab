# Options Lab — Claude Instructions

## Project Overview
Interactive options strategy education tool, to be part of a future paid website.
Target: self-use + subscribers. Bilingual (English strategy names, Chinese descriptions).

## Tech Stack
- **Frontend**: React 19 + Vite
- **State**: Zustand
- **Charts**: Custom Canvas rendering (no chart libraries)
- **Styling**: CSS variables, dark theme (#0b0d10 background)
- **Deployment**: Vercel（前端静态）+ Railway（Node.js 后端 + PostgreSQL）
- **Database**: PostgreSQL（Railway 独立 Service，V2 引入）

## Key Directories
```
docs/                  ← All project documentation (task.md, wiki.md, learning.md, etc.)
frontend/src/
  data/strategies.js       ← All 70+ strategy definitions
  data/mockAnalysis.js     ← Mock data (9 symbols, GEX/PCR/trend/scenarios)
  data/companyInfo.js      ← Company info lookup (12 symbols, logo/zh/tagline)
  lib/blackscholes.js      ← BS pricing engine + Greeks
  components/              ← UI components (incl. InsightCarousel)
  pages/analyze/           ← 4-tab analyze page
  pages/weekly/            ← 5-section weekly recap
  store/useStrategyStore.js ← Zustand global state
server/src/             ← Express API routes, migration, cache/refresh helpers
collector/              ← Collectors, GEX compute, scanner materializer, refresh worker
```

## Current Architecture
- Read `docs/ARCHITECTURE.md` before changing data flow.
- Phase 3C is complete.
- Browser requests go to Railway API, then PostgreSQL snapshots/cache.
- `/api/scan` reads `scanner_results_snapshots`; it must not recompute the full watchlist on request.
- Stale/missing data enqueues `provider_fetch_jobs`; `collector/run_refresh_worker.py` is the execution boundary.
- `/api/status/cache` reports job backlog, failures, scanner age, empty snapshots and provider budget.
- Scanner rows must represent complete actionable candidates from actual same-expiry quotes. DTE ranges are diagnostics only; fixed placeholder POP values are forbidden.
- `不限` enumerates all qualifying setups across supported strategies and may return multiple rows for one symbol.
- Production option snapshots currently use `polygon_licensed`; credentials belong only in `collector/.env` or deployment secret stores. Never add provider keys to PM2 config, docs, tests, or Git.
- Phase 3E is complete: `option_oi_delta_snapshots` powers `/api/unusual/:symbol`, `/api/scan` unusual filters and Analyze Tab3 unusual activity.
- `ib_internal` and `tt_internal` are internal/transitional data sources, not public licensed product sources.
- Scheduled price history uses Polygon aggregates and writes both `price_history` (daily) and `price_history_30m`; IB price remains an explicit fallback only.

## Code Conventions
- Use the Edit tool directly — never Python/Bash to modify files
- Functional React components only, no class components
- Keep strategy data and calculation logic separate from UI
- Canvas charts: always account for devicePixelRatio for retina displays
- All monetary values in USD, strikes relative to default spot = 100

## Strategy Data Format
```js
{
  id: 'long_call',
  name: 'Long Call',          // English
  zh: '买入看涨',              // Chinese
  cat: 'direction',            // direction|income|volatility|calendar|complex|arb|guide
  tag: 'bullish',              // bullish|bearish|neutral|volatile|guide
  lvl: 'novice',              // novice|intermediate|advanced
  desc: 'Short description',
  legs: [
    { type: 'call'|'put', dir: 1|-1, K: 100, dte: 45, iv: 0.30, qty: 1 }
    // dir: 1=long, -1=short; K=strike price; iv=decimal
  ],
  notes: {
    build, when, strike, iv, dte, delta, tp, sl, adj
  }
}
```

## Next Task
- Follow `docs/task.md` section `实施优先级（执行顺序）`.
- Phase 3D-6, collector alerts, Polygon price/derived volatility, and scanner strategy expansion are complete. Immediate next section: Analyze data product.
- Derived volatility is isolated in `volatility_history`; use New York market dates for DTE and daily observations. Do not mark derived IV Rank ready before 252 observations.
- Scanner candidate quotes come from the latest usable quoted snapshot, independently of the latest positioning snapshot. Preserve quote provenance and the explicit advanced-risk gate.
- Collector runtime: PM2 directly executes the current repo via `collector/ecosystem.config.cjs`; do not create or sync a second runtime copy.
- IB contract discovery must persist only actual `reqContractDetails` results with valid `conId`; never construct expiry/strike/right Cartesian products.
- Volume/OI is only an activity proxy. Confirmed unusual OI requires previous snapshot comparison.
