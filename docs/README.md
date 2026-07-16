# Options Lab 期权策略库

Interactive options strategy education and analysis tool with payoff diagrams, Greeks visualization, IV analysis, and strategy recommendations.

## Production

| Surface | URL |
|---|---|
| Website | https://www.quantrift.io |
| Root redirect | https://quantrift.io → https://www.quantrift.io |
| Railway API | https://quantriftoptions-lab-production.up.railway.app |

Production verification on 2026-07-14:

- `https://quantrift.io` returns HTTP 308 to `https://www.quantrift.io/`
- `https://www.quantrift.io` returns HTTP 200
- `GET /health` returns `{"status":"ok"}`
- `GET /api/metrics?symbols=AAPL` returns AAPL IV metrics from `iv_history`
- `GET /api/scan?minIvr=0&maxIvr=100&limit=5` returns scan results

## Project Structure

```
quantrift_options-lab/
  frontend/     ← React 19 + Vite (Vercel)
  server/       ← Node.js API (Railway)
  collector/    ← Python data collectors (Mac Studio PM2, direct repository runtime)
```

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Pages

| Route | Description |
|---|---|
| `/` | Quantrift 产品入口：live Market Regime + Scan/Analyze/Weekly workflow |
| `/learn` | V1 教育工具：86个策略、Payoff图、Greeks图表、知识库 |
| `/analyze` | V2 标的分析：真实价格趋势、S/R、Focus Score、GEX、VRP、IV skew 与期限结构 |
| `/scan` | V2 扫描器：从真实期权快照筛出具体候选单，显示 expiry/DTE、legs、credit/debit、风险、breakeven 与机会分 |

## Features (V1 — /learn)
- 86 strategies across 7 categories: Direction / Income / Volatility / Calendar / Complex / Arbitrage / Guide
- Payoff diagram: expiry line + current scenario line + breakeven markers
- Greeks six-chart: Delta / Gamma / Theta / Vega / Rho with DTE slider
- Scenario editor: spot price, IV shift, rate, dividend, range, contracts
- Risk metrics: Max Profit/Loss, Breakeven, Delta, Theta, Vega, Gamma, Rho, POP
- Leg editor: real-time chart updates
- Greeks 知识库: 5大Greek + 12个互动卡片（GEX、Gamma Squeeze、Vanna/Charm等）
- Bilingual: English strategy names + Chinese descriptions

## Features (V2 — /analyze + /scan)
- Ticker-first flow: input symbol → system analyzes → recommends strategy
- IV analysis: IV Rank, IV30 vs HV30, term structure
- Direction signals: MA50/200, RSI, MACD
- Earnings date detection
- Scanner: filter by opportunity/preset, then enumerate 13 actual-contract structures; Calendar/Diagonal support cross-expiry legs and advanced naked-risk structures require explicit opt-in
- Data coverage status API: `/api/status/data`
- Price history API: `/api/prices/:symbol` for daily bars and `/api/prices/:symbol?interval=30m` for intraday bars
- Analyze missing-data UX distinguishes uncollected watchlist symbols from symbols outside the watchlist
- Analyze derived APIs: `/api/sr/:symbol` returns pivot-clustered support/resistance plus Focus Score; `/api/chain/stats/:symbol` returns actual-contract IV skew and ATM IV term structure
- Analyze never creates example price history or synthetic option legs when real inputs are missing
- Persistent scanner universe: known database symbols plus on-demand Analyze registrations feed the materialized scanner; `/api/analyze/:symbol` reports field coverage and queues only missing data products
- Universe filters: price, share/dollar volume and earnings are live; market cap, sector and optionable filtering is wired but remains null until reference fields are populated
- Market Regime: `/api/market/regime` combines SPY/QQQ daily momentum, regular-session 30M breakout, IV Rank and GEX; stale intraday bars cannot confirm a breakout
- Weekly Recap: `/api/weekly/:symbol` uses real rolling-week OHLC, daily GEX snapshots, Max Pain and ΔOI. It contains no mock fallback or fabricated money-flow data
- Scanner alerts: email and browser-push subscriptions persist rules and tokenized unsubscribe state; PM2 evaluates each materialized scan batch with delivery deduplication

## Data Sources (V2)
- ATM IV / HV30/60/90: Polygon option snapshots and daily OHLCV, derived into `volatility_history`
- IV Rank: derived only after 252 independent market-day ATM observations; Tastytrade remains the explicit cold-start fallback until readiness
- Daily OHLCV: up to 400 adjusted bars in Railway `price_history`, sourced by scheduled Polygon aggregates
- 30-minute OHLCV: 35 calendar days in Railway `price_history_30m`, including VWAP and trade count when supplied
- Price provider default: `polygon`; requests are globally paced to stay within the configured Stocks aggregates rate
- 2026-07-15 runtime: 67/67 watchlist symbols covered in both daily and 30M Polygon history; PM2 scheduled price job uses `SYMBOLS=watchlist`
- Dev/backfill provider: `stooq`, only when explicitly selected
- Option chains: scheduled ingestion uses `polygon_licensed`; `ib_internal` and `tt_internal` remain explicit fallback/research adapters.
- IB API: delayed market data is accepted by the current transition pipeline with `IB_MARKET_DATA_TYPE=3`.
- yfinance is not the default price or options data path because of rate-limit and licensing/reliability constraints

## Product Data Direction
- Core product signals: Call Wall, Put Wall, Global GEX, Local Gamma, Gamma Flip, Max Pain, PCR, IV Skew, OI concentration, Unusual OI delta
- User requests should read precomputed snapshots from Railway PostgreSQL through the Railway API
- Public user requests must not synchronously depend on a local Mac Studio IB Gateway
- Provider adapters isolate ingestion so a future data source can be added without changing API or frontend contracts.
- Provider credentials are loaded from local/deployment secret stores only. PM2 config, docs and Git must never contain API keys.
- GEX/API regression coverage includes sign, walls, Gamma Flip, PCR zero division, confidence downgrade, and fresh/missing/stale snapshot behavior. API refresh jobs default to `polygon_licensed`.
- Collector health checks run every 300 seconds and persist deduplicated active/resolved alerts for coverage, failed jobs, snapshot age and completeness. Notification channels are webhook/SMTP with log fallback.
- Production data UX should use snapshot cache + stale-while-revalidate: return fresh snapshots immediately, return stale-but-labeled snapshots while refreshing, and show queued/unavailable states instead of fake mock data when a symbol has no data
- Scanner results should be precomputed/cached, not full-market recalculated on every user request
- Phase 3C scanner path: `collector/materialize_scan.py` writes `scanner_results_snapshots`; `/api/scan` reads the latest materialized batch only
- Scanner materialized rows include IV, latest price, GEX/walls, OI/volume, OI delta, price-history trend, and earnings date
- Scanner quote selection is independent from positioning freshness: a new Greeks/OI snapshot without bid/ask cannot hide the latest usable quoted snapshot. Results expose quote source/time/freshness.
- Phase 3C refresh path: API enqueues `provider_fetch_jobs`; `collector/run_refresh_worker.py` processes jobs with `provider_request_usage` budget tracking; `/api/status/cache` monitors backlog/stale/failure/budget state
- Phase 3E unusual path: `collector/materialize_oi_delta.py` writes `option_oi_delta_snapshots`; `/api/unusual/:symbol` and `/api/scan` read confirmed OI delta state
- Analyze computes direction context from real price history and displays Focus Score, VRP, Gamma Flip, Local Gamma, S/R, IV skew and term structure. Strategy legs remain hidden until an actual contract candidate is attached.
- Current collector behavior: IV and price collectors cover the watchlist; option-chain collection now defaults to `watchlist.txt` but can be narrowed with `OPTION_SYMBOLS` / `SYMBOLS` for bounded backfills.
- Refresh worker safeguards: stale `running` jobs are recovered, unsupported provider jobs fail closed, TT auth exits are converted into job errors, option-chain jobs can fall back from TT to IB, and malformed symbols are rejected before entering `provider_fetch_jobs`.
- PM2 auto-refresh scheduler continuously closes watchlist gaps in bounded batches of two, prioritizes missing then oldest snapshots, and applies a 30-minute cooldown after recent attempts.
- IB contract discovery persists only contracts actually returned by IB with a valid `conId` and `localSymbol`; the collector never constructs synthetic expiry/strike/right combinations.
- Stale or partial GEX remains visible when the snapshot contains the required computed fields. The UI labels its age/quality; only missing required fields suppress GEX/Wall analysis.
- Scanner `不限` applies no hidden preset and enumerates every qualifying setup across supported strategies in the current 1-90 DTE ingestion window, including multiple rows per symbol. It rejects incomplete or non-positive-credit structures and displays exact legs plus executable-side pricing.

## Roadmap
- [x] V2: Railway PostgreSQL + Node.js API (replace mock data)
- [x] V2: Python collectors on Mac Studio (PM2 direct-repository runtime)
- [x] V2: Polygon daily/30M OHLCV pipeline (`collect_prices.py`, `price_history`, `price_history_30m`, `/api/prices/:symbol`)
- [x] V2: Polygon-derived HV/ATM IV pipeline with 252-day IV Rank readiness gate and per-field provenance
- [x] V2: Vercel deployment
- [x] V2: GEX data model + provider adapter abstraction
- [x] V2: Cache/freshness architecture for option chain, GEX, scanner and refresh jobs
- [x] V2: Refresh worker loop, provider budget accounting and stale/empty snapshot monitoring
- [x] V2: Phase 3E OI delta / unusual activity snapshot layer
- [x] V2: Persistent scanner universe and unknown-symbol on-demand price/options/GEX refresh
- [x] V2: Market Regime and fully real-data Weekly Recap
- [x] V2: Quantrift responsive product home
- [x] V2: Scanner email/web-push subscription and delivery pipeline
- [ ] V2: Options scanner push notifications
- [ ] V3: User auth + subscription tiers
- [ ] V3: Portfolio tracking + Greeks aggregation
