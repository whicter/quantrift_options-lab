# Options Lab — Codex Instructions

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
docs/                      ← Source of truth docs
frontend/src/              ← React app
server/src/                ← Express API
collector/                 ← Python collectors, GEX compute, refresh worker
```

## Current Architecture
- See `docs/ARCHITECTURE.md` first.
- Phase 3C is complete: API reads PostgreSQL snapshots/cache; user requests do not synchronously call IB, TT, or any provider.
- `/api/scan` reads `scanner_results_snapshots`, produced by `collector/materialize_scan.py`.
- Refresh requests enqueue `provider_fetch_jobs`; `collector/run_refresh_worker.py` processes queued jobs.
- `/api/status/cache` monitors backlog, failures, scanner staleness, empty snapshots and provider budget.
- Scanner user output is an actionable candidate, not snapshot inventory: use actual same-expiry contracts, executable-side pricing and explicit risk; never display a DTE range or fixed POP as a recommendation.
- Scanner `不限` means all qualifying setups across supported strategies, not one inferred strategy per symbol. Multiple rows per symbol are expected.
- Production option snapshots currently use `polygon_licensed`; credentials belong only in `collector/.env` or deployment secret stores. Never add provider keys to PM2 config, docs, tests, or Git.
- Phase 3E is complete: `materialize_oi_delta.py` writes `option_oi_delta_snapshots`; `/api/unusual/:symbol` serves confirmed/baseline OI delta state.
- Public options data still requires a licensed provider adapter; `ib_internal` and `tt_internal` are internal/transitional only.

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
- Execution order is defined in `docs/task.md` under `实施优先级（执行顺序）`.
- Phase 3D-6 through P2.3 heartbeat are complete. Remaining P3 commercialization requires an approved auth/billing design and credentials; audit non-external tasks before stopping.
- Heartbeat expected nodes must include machines that have never reported. Missing URL/token disables only heartbeat, not the collector loop; missing webhook delivery is `blocked`, not `sent`.
- A ready derived IV Rank must stop Tastytrade work in scheduled, queued, and on-demand paths. Never manufacture or duplicate market dates to satisfy the 252-observation gate.
- The Railway metrics cron is one-shot `collect.py`, not the Mac daemon. Preserve `/collector/railway.metrics.json`, UTC schedule, `NEVER` restart and secret-free image.
- IB Gateway cloud candidates must use fixed egress, paper/read-only first, pinned image and loopback/private API. Never expose ports 4001/4002 publicly or combine data migration with live write access.
- Clerk owns authentication only; local users/subscriptions own entitlements. Railway P3 schema is applied; keep auth enforcement disabled until frontend/backend keys and billing runtime tests pass.
- Portfolio routes must bind user ownership in SQL and value only actual matching persisted contracts. Any missing leg quote makes position and aggregate pricing incomplete; never substitute entry price.
- Stripe redirects never grant entitlement. Accept plan changes only from verified raw-body webhooks with event-id idempotency. Keep enforcement false until Clerk/Stripe runtime acceptance passes.
- Preserve the clean frontend baseline: run full ESLint, unit tests and production build after frontend changes; disclose the Vite chunk-size warning separately from correctness failures.
- Never label GEX as OI. IV and OI analytics select their latest usable snapshots independently; Tab4 OI density must use persisted open interest and disclose cross-expiry aggregation.
- Reddit community heat is optional context and must never change options opportunity scoring. Preserve universe intersection, cashtag handling for ambiguous tokens, bounded OAuth/rate retries and disabled-safe behavior without credentials.
- External flow is context only. Accept dark pool only from TRF market center `L`/`2`; preserve provider event idempotency and stream-level freshness. Never infer institutional direction or opening status when the provider flag is absent.
- Composite Momentum must retain disclosed 30M/1D/1W weights and per-timeframe readiness. A lagging intraday market date is stale even when the numerical score is strong; never relabel it as current confirmation.
- Scanner alert evaluation runs only after scanner materialization. Preserve outbox uniqueness and `blocked` channel state; never send provider requests from notification evaluation.
- VAPID private key stays in collector secrets. API/browser may receive only `WEB_PUSH_VAPID_PUBLIC_KEY`.
- `/` is the Quantrift product entry. Preserve direct Scan/Analyze/Weekly workflows and live Market Regime; `/learn` is no longer the default redirect.
- `/api/market/regime` owns SPY/QQQ multi-timeframe regime; stale 30M data must never confirm breakout. `/api/weekly/:symbol` must remain mock-free and may return partial sections.
- Weekly scenarios require Call Wall above spot and Put Wall below spot. ΔOI is contracts, never dollar flow or confirmed institutional direction.
- `symbol_universe` is the persistent scanner registry. Unknown Analyze symbols use `/api/analyze/:symbol`; do not reintroduce a watchlist-only product boundary or synchronous full-universe provider work.
- Recent non-retryable field failures must be returned as blockers and must not be re-enqueued on every page request.
- Analyze derived endpoints are `/api/sr/:symbol` and `/api/chain/stats/:symbol`; missing real price/contract inputs must stay missing. Never generate example price paths or synthetic recommendation legs.
- `volatility_history` owns Polygon-derived HV and ATM IV. IV Rank remains fail-closed until 252 market-day observations; APIs expose per-field provenance and retain the Tastytrade cold-start rank until ready.
- Scanner positioning and quote snapshots are separate: select the newest usable real bid/ask snapshot for candidate legs and expose its source/time/freshness. Advanced naked-risk structures require explicit UI opt-in.
- Collector runtime: PM2 directly executes the current repo via `collector/ecosystem.config.cjs`; do not create or sync a second runtime copy.
- IB contract discovery must persist only actual `reqContractDetails` results with valid `conId`; never construct expiry/strike/right Cartesian products.
- Do not represent volume-only signals as confirmed institutional positioning.
