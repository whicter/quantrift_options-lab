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
- Analyze product conclusions are assembled server-side in `server/src/domain/analyze/` (positioningSummary, scenarioEngine, analyzeDto) and served by `GET /api/analyze/:symbol/summary`. The positioning conclusion and scenario triggers were ported byte-identically from the browser's `analyzeData.js`; keep them in sync if either changes. Normal users get a `data_status` label with no provider names; a valid `ADMIN_API_TOKEN` adds a `provenance` block. Recommendation stays at `/api/analyze/:symbol/candidate`. The frontend cutover (Analyze.jsx consuming `/summary` instead of computing in `analyzeData.js`) is pending with E11.
- The raw option chain is admin-only: `GET /api/admin/chain/:symbol` (`server/src/routes/adminChain.js`) behind `requireAdminToken`, returning the full contracts plus coverage/quality diagnostics recomputed from the returned rows. Product routes (`/api/scan`, `/api/analyze`) never return the contract chain; this is the authenticated inspection path.
- Provider pacing is shared through `provider_rate_limits`, not a local file lock — a lock file only constrains one host, so N machines would issue N times the rate. Callers claim a slot atomically and the database clock is the only authority, so skewed worker clocks cannot both fire early. Never hold the claim while sleeping. A 429 must call `penalize()` to back off every worker; a local `time.sleep` pauses one process while the rest keep hammering, which is what turns one rejection into a storm. Unit tests must pin `PROVIDER_RATE_LIMIT_BACKEND=file` so they cannot open a real connection when `DATABASE_URL` is present.
- The option refresh scheduler fills the job queue to `OPTION_REFRESH_QUEUE_TARGET` rather than enqueuing a fixed count per cycle, and reads candidates from `symbol_universe`, not `watchlist.txt` — the file is only a seed and would permanently exclude on-demand symbols. Queue depth counts on-demand jobs too, so a burst of user requests throttles the background sweep instead of stacking on it. Background priority tiers (`core` 80 / `recent_active` 60 / `universe_scan` 40 / `cold_backfill` 20) must always stay below the API's on-demand 100. Tiers express who wants the data; staleness only orders within a tier. The fill is bounded by remaining provider daily budget as well as queue depth — otherwise it enqueues jobs that immediately fail once the budget is spent. `PROVIDER_DAILY_BUDGET` is a self-imposed **runaway-loop backstop, not a cost throttle**: Polygon paid plans (including the $29 Options subscription) allow unlimited API calls, so extra calls cost nothing. The old default of 1000 was starving mid-day refreshes — ~81 symbols refreshed through a trading day exceed 1000 well before the close, after which every `option_chain_snapshot` job fails `provider budget exhausted` and option data freezes for the rest of the day. It is set to `50000` in `collector/ecosystem.config.cjs` (mirror the same value on the Railway refresh cron env). Two related worker guards: `provider budget exhausted:` is a non-retryable error (a spent budget will not replenish until the next budget day, so retrying only multiplies failures), and note the scheduler's budget gate **fails open** — `load_remaining_budget` returns `None` (treated as uncapped) when it cannot read today's usage row, so a stale/failed read silently disables the throttle (observed 2026-07-17: the gate leaked for ~2.5h until a daemon restart, flooding the exhausted budget). Keeping the budget far above real need avoids exercising that path.
- `server/src/domain/status/freshness.js` is the single freshness contract for every data product. Never re-derive a stale threshold inside a route — add it there. Freshness is computed, never stored. Daily price and metrics are judged by market date (a weekend has no bar to produce); 30M is judged against the latest daily market date, not the clock; option chain and GEX are judged by clock age, and GEX inherits its chain's timing. Real data outranks refresh state: stale-with-a-failed-refresh is `stale`, not `failed`. Its thresholds intentionally match the per-route constants it replaced; tightening option chain to the 60-minute P2.8 target is gated behind E6/E7.
- `symbol_data_state` is the per-symbol, per-product read-side summary (`price_daily`/`price_30m`/`metrics`/`option_chain`/`gex`). It stores observed facts only and deliberately has no `freshness` column: freshness decays with wall-clock time, so readers derive it from `latest_snapshot_ts` against the product policy. Products are tracked independently — never collapse them into one per-symbol status. Writes are best-effort; the snapshot tables remain the source of truth. `last_error_code` is a coarse code, never a raw provider message.
- Ingestion and global derivation are decoupled. Per-symbol GEX runs immediately after its option snapshot, but `materialize_oi_delta` and `materialize_scan` read every symbol, so a worker batch accumulates requests in `PendingDerivations` and runs each exactly once at the end. Never call them per job. A deferred `scanner_materialize` job stays `running` until the batch reports its real outcome — never finish it as succeeded before the materialization actually ran.
- `/api/admin/status/cache` reports job backlog, failures, scanner age, empty snapshots and provider budget.
- `/api/status/data` is the only public status route and returns just the symbol registry plus an overall health label. Operational detail lives under `/api/admin/status/*` and `GET /api/heartbeat/status` behind `ADMIN_API_TOKEN`, which fails closed with 503 when unset. Route any new status field through `toPublicDataStatus()` in `server/src/domain/status/statusReports.js`; never expose provider/source names to unauthenticated clients.
- Scanner rows must represent complete actionable candidates from actual same-expiry quotes. DTE ranges are diagnostics only; fixed placeholder POP values are forbidden.
- The Scanner browser must receive final candidate DTOs only. Candidate enumeration, scoring and economics belong to `server/src/domain/scanner/candidateEngine.cjs`; never return the complete `option_contracts` array from normal `/api/scan`.
- Production frontend builds explicitly disable source maps, and `frontend/scripts/check-dist.mjs` (`npm run check:dist`, enforced in CI) asserts the artifact rather than trusting the config: no `.map`, no inline source map, no provider secret patterns.
- CI is `.github/workflows/ci.yml`: server tests, frontend lint/test/build/check:dist, collector unittest, and `scripts/scan-secrets.sh`. Keep docs inside the secret scan's scope — a Polygon key reached Git history through them once; filter placeholders instead of excluding files.
- Security headers live in `frontend/vercel.json` (browser) and `server/src/lib/securityHeaders.js` (JSON API). The CSP deliberately does NOT include Clerk yet: no publishable key is configured, so the instance domain cannot be verified. Extend `script-src`/`connect-src`/`img-src`/`worker-src`/`frame-src` before enabling Clerk, or sign-in breaks silently.
- `不限` enumerates all qualifying setups across supported strategies and may return multiple rows for one symbol.
- Production option snapshots currently use `polygon_licensed`; credentials belong only in `collector/.env` or deployment secret stores. Never add provider keys to PM2 config, docs, tests, or Git.
- Phase 3E is complete: `option_oi_delta_snapshots` powers `/api/unusual/:symbol`, `/api/scan` unusual filters and Analyze Tab3 unusual activity.
- `ib_internal` and `tt_internal` are internal/transitional data sources, not public licensed product sources.
- Scheduled price history uses Polygon aggregates and writes both `price_history` (daily) and `price_history_30m`; IB price remains an explicit fallback only.
- Analyze builds a null-initialized real-data model. It never imports sample analysis data; absent price, metrics or GEX fields remain unavailable instead of inheriting an unrelated symbol's value.
- Scanner final SQL must qualify fields from `latest_rows` whenever joined CTEs expose the same column name. The 2026-07-16 production incident covered both `source` and `snapshot_ts`.

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
- The Railway metrics cron image is retained but defaults `TT_METRICS_ENABLED=false`: TT recognizes Railway as an untrusted device. Mac Studio's weekday 13:30 PT cron is the active metrics writer to shared PostgreSQL. Re-enable Railway only after an explicit TT device challenge.
- IB Gateway cloud candidates must use fixed egress, paper/read-only first, pinned image and loopback/private API. Never expose ports 4001/4002 publicly or combine data migration with live write access.
- Clerk owns authentication only; local users/subscriptions own entitlements. Railway P3 schema is applied; keep auth enforcement disabled until frontend/backend keys and billing runtime tests pass.
- Portfolio routes must bind user ownership in SQL and value only actual matching persisted contracts. Any missing leg quote makes position and aggregate pricing incomplete; never substitute entry price.
- Stripe redirects never grant entitlement. Accept plan changes only from verified raw-body webhooks with event-id idempotency. Keep enforcement false until Clerk/Stripe runtime acceptance passes.
- Preserve the clean frontend baseline: run full ESLint, unit tests and production build after frontend changes; disclose the Vite chunk-size warning separately from correctness failures.
- Never label GEX as OI. IV and OI analytics select their latest usable snapshots independently; Tab4 OI density must use persisted open interest and disclose cross-expiry aggregation.
- Reddit community heat is optional context and must never change options opportunity scoring. Preserve universe intersection, cashtag handling for ambiguous tokens, bounded OAuth/rate retries and disabled-safe behavior without credentials.
- External flow is context only. Accept dark pool only from TRF market center `L`/`2`; preserve provider event idempotency and stream-level freshness. Never infer institutional direction or opening status when the provider flag is absent.
- Composite Momentum must retain disclosed 30M/1D/1W weights and per-timeframe readiness. A lagging intraday market date is stale even when the numerical score is strong; never relabel it as current confirmation.
- Preserve the durable scanner alert outbox and unique subscription/batch/symbol key. Missing SMTP/VAPID is `blocked`, never `sent`.
- Keep VAPID private material in collector secrets; server/frontend use only the public key.
- `/` owns the Quantrift product entry with live Market Regime and direct core workflows. Keep `/learn` as a separate education route.
- Preserve `/api/market/regime` freshness gating and the mock-free `/api/weekly/:symbol` contract. Missing GEX/Max Pain/ΔOI remains locally missing.
- A Weekly Call Wall is only an upward trigger above spot; a Put Wall is only a downward trigger below spot. Never relabel ΔOI as money flow.
- `symbol_universe` owns the persistent scanner registry. `/api/analyze/:symbol` registers valid unknown symbols and queues only missing field products; never perform a synchronous full-universe provider scan.
- Universe reference metadata comes from Polygon ticker reference data via `collect_universe_metadata.py`; sector/category is SIC-derived and nullable, and `optionable` is true only from persisted usable option snapshots.
- Preserve partial data and expose recent non-retryable failures as blockers instead of creating enqueue loops.
- Analyze derived endpoints are `/api/sr/:symbol` and `/api/chain/stats/:symbol`; preserve ISO dates and fail closed when real inputs are absent. Never synthesize price paths or option legs.
- Derived volatility is isolated in `volatility_history`; use New York market dates for DTE and daily observations. Do not mark derived IV Rank ready before 252 observations.
- Scanner candidate quotes come from the latest usable quoted snapshot, independently of the latest positioning snapshot. Preserve quote provenance and the explicit advanced-risk gate.
- Collector runtime: PM2 directly executes the current repo via `collector/ecosystem.config.cjs`; do not create or sync a second runtime copy.
- Single-writer for the option refresh cycle (2026-07-17, Option B — commit `48b1cbc`): the cycle used to run in TWO places against one DB — the Mac Studio PM2 daemon (`run_collector_daemon.py`, loop) AND a Railway cron (`run_railway_refresh_cycle.py` via `collector/railway.metrics.json`, every 5 min) — and the two contended on shared state (the `provider_request_usage` budget row, each stamping its own `PROVIDER_DAILY_BUDGET`). Resolved by removing `cronSchedule` from `railway.metrics.json` so Mac Studio is the sole writer; the Railway service keeps its start command but runs once per deploy then idles (`restartPolicyType: NEVER`). Reversible: re-add `"cronSchedule": "*/5 * * * 1-5"`. Caveat: the config is committed, but the disable only takes effect once Railway redeploys that service — verify in the Railway dashboard. While single-writer holds, only one runtime writes the budget row; if the Railway cron is ever re-enabled, both runtimes must set the SAME `PROVIDER_DAILY_BUDGET` or the lower one stomps the shared row on `ON CONFLICT UPDATE`. Only IB Gateway and TT-authenticated metrics are genuinely local-constrained; everything Polygon-based is cloud-friendly, so the longer-term option (A) is to move the Polygon pipeline to Railway and leave Mac Studio as an IB/TT-only adapter.
- IB contract discovery must persist only actual `reqContractDetails` results with valid `conId`; never construct expiry/strike/right Cartesian products.
- Volume/OI is only an activity proxy. Confirmed unusual OI requires previous snapshot comparison.
