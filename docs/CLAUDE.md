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
- Phase 3D-6 through P2.3 heartbeat are complete. Remaining P3 commercialization requires an approved auth/billing design and credentials; audit non-external tasks before stopping.
- Heartbeat expected nodes must include machines that have never reported. Missing URL/token disables only heartbeat, not the collector loop; missing webhook delivery is `blocked`, not `sent`.
- A ready derived IV Rank must stop Tastytrade work in scheduled, queued, and on-demand paths. Never manufacture or duplicate market dates to satisfy the 252-observation gate.
- The Railway metrics cron is one-shot `collect.py`, not the Mac daemon. Preserve `/collector/railway.metrics.json`, UTC schedule, `NEVER` restart and secret-free image.
- IB Gateway cloud candidates must use fixed egress, paper/read-only first, pinned image and loopback/private API. Never expose ports 4001/4002 publicly or combine data migration with live write access.
- Clerk owns authentication only; local users/subscriptions own entitlements. Railway P3 schema is applied; keep auth enforcement disabled until frontend/backend keys and billing runtime tests pass.
- Portfolio routes must bind user ownership in SQL and value only actual matching persisted contracts. Any missing leg quote makes position and aggregate pricing incomplete; never substitute entry price.
- Stripe redirects never grant entitlement. Accept plan changes only from verified raw-body webhooks with event-id idempotency. Keep enforcement false until Clerk/Stripe runtime acceptance passes.
- Preserve the clean frontend baseline: run full ESLint, unit tests and production build after frontend changes; disclose the Vite chunk-size warning separately from correctness failures.
- Preserve the durable scanner alert outbox and unique subscription/batch/symbol key. Missing SMTP/VAPID is `blocked`, never `sent`.
- Keep VAPID private material in collector secrets; server/frontend use only the public key.
- `/` owns the Quantrift product entry with live Market Regime and direct core workflows. Keep `/learn` as a separate education route.
- Preserve `/api/market/regime` freshness gating and the mock-free `/api/weekly/:symbol` contract. Missing GEX/Max Pain/ΔOI remains locally missing.
- A Weekly Call Wall is only an upward trigger above spot; a Put Wall is only a downward trigger below spot. Never relabel ΔOI as money flow.
- `symbol_universe` owns the persistent scanner registry. `/api/analyze/:symbol` registers valid unknown symbols and queues only missing field products; never perform a synchronous full-universe provider scan.
- Preserve partial data and expose recent non-retryable failures as blockers instead of creating enqueue loops.
- Analyze derived endpoints are `/api/sr/:symbol` and `/api/chain/stats/:symbol`; preserve ISO dates and fail closed when real inputs are absent. Never synthesize price paths or option legs.
- Derived volatility is isolated in `volatility_history`; use New York market dates for DTE and daily observations. Do not mark derived IV Rank ready before 252 observations.
- Scanner candidate quotes come from the latest usable quoted snapshot, independently of the latest positioning snapshot. Preserve quote provenance and the explicit advanced-risk gate.
- Collector runtime: PM2 directly executes the current repo via `collector/ecosystem.config.cjs`; do not create or sync a second runtime copy.
- IB contract discovery must persist only actual `reqContractDetails` results with valid `conId`; never construct expiry/strike/right Cartesian products.
- Volume/OI is only an activity proxy. Confirmed unusual OI requires previous snapshot comparison.
