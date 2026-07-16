# quantrift_options-lab — Claude Memory

## Session
- **Session UUID**: `c8b5de84-d234-48bd-97b1-ae873526ac94`
- **Resume**: `cd ~/Documents/quantrift_options-lab && cr`
- `cr()` in ~/.zshrc: `claude --resume $(cat .claude_session)`

## 路径
- **本机**: `/Users/cohan/Documents/quantrift_options-lab`
- **Mac Studio**: `/Users/congrenhan/Documents/quantrift_options-lab`
- **GitHub**: `https://github.com/whicter/quantrift_options-lab`

## Git 同步规则
- 本机只能 `git pull`，不能 push（公司网络封锁 SSH）
- Mac Studio 负责所有 `git push`
- **本机 → GitHub**:
  ```bash
  git add -A && git commit -m "描述"
  rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' \
    /Users/cohan/Documents/quantrift_options-lab/ \
    mac-studio:/Users/congrenhan/Documents/quantrift_options-lab/
  ssh mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && \
    git add -A && git commit -m '描述' && git push"
  ```
- **Mac Studio → 本机**: 先 ssh 查看改动 → Mac Studio push → rsync 指定文件拉回

## 规则
- **Bash 直接跑**，不问确认（.claude/settings.json 已配 `Bash(*)`）
- **参数改动必须先问用户确认**，不能自己决定
- **不能输出模棱两可的猜测**，只说能从代码/日志中证明的事实

## 技术栈
- **Frontend**: React 19 + Vite，部署 Vercel，根目录 `frontend/`
- **Backend**: Node.js Express，部署 Railway，根目录 `server/`
- **Collector**: Python，PM2 直接运行 Mac Studio 当前仓库的 `collector/`，不复制 runtime
- **DB**: PostgreSQL on Railway（核心表：`iv_history`, `price_history`, `option_chain_snapshots`, `option_contract_snapshots`, `gex_snapshots`, `gex_by_strike_snapshots`, `scanner_results_snapshots`, `provider_fetch_jobs`, `provider_request_usage`）

## 当前架构状态
- `docs/ARCHITECTURE.md` 是架构主文档。
- Phase 3C 已完成：snapshot cache、freshness contract、scanner materialization、refresh queue、worker、provider budget、cache monitoring。
- `/api/scan` 只读 `scanner_results_snapshots`，不在用户请求时全 watchlist 重算。
- `collector/materialize_scan.py` 生成 scanner cache。
- `collector/materialize_oi_delta.py` 生成 OI delta / unusual activity cache。
- `collector/run_refresh_worker.py` 消费 `provider_fetch_jobs`。
- `/api/status/cache` 查看 backlog / failures / scanner stale / empty snapshots / provider budget。
- PM2 app `quantrift-options-collector` 每 300 秒 bounded enqueue 最多 2 个 missing/stale option symbols、每 60 秒处理 queue、每 300 秒 materialize scanner；`quantrift-options-prices` 工作日 13:35 PT 跑 OHLCV。
- IB option discovery 先按 expiry/right 调用 `reqContractDetails`，只保存 IB 实际返回且具有有效 `conId` 的合约；禁止 expiry × strike × right 笛卡尔积。
- `IB_MARKET_DATA_TYPE=3` 接受延迟行情。stale/partial GEX 只要包含必要字段就显示并标注质量，不再整块隐藏。
- Analyze 已接入真实 S/R、Focus Score、VRP、Gamma Flip、Local Gamma、IV skew 与 term structure。旧 target fallback 推荐腿已移除；没有 actual contract candidate 时不显示策略腿。
- Production option collection uses `polygon_licensed`; `ib_internal` / `tt_internal` remain fallback/research adapters. API 与前端只读取 PostgreSQL snapshot。
- Provider credentials只允许存在于 `collector/.env` 或部署 secret store，不得写入 PM2 config、文档、测试或 Git。

## 关键文件
- `server/src/migrate.js` — 建表脚本，Railway 上跑一次
- `server/src/routes/scan.js` — scanner cache API，只读 `scanner_results_snapshots`
- `server/src/routes/status.js` — `/api/status/data`, `/api/status/options`, `/api/status/cache`
- `collector/auth.py` — Tastytrade 认证，`--login` 手动登录；仅在成功 session exchange 返回 successor 时原子持久化 remember-token
- `collector/collect.py` — 每日 4:30pm ET 采集 IV → PostgreSQL
- `collector/collect_options.py` — bounded option-chain snapshots
- `collector/compute_gex.py` — GEX / Wall / Gamma Flip compute
- `collector/materialize_scan.py` — scanner cache materializer
- `collector/materialize_oi_delta.py` — OI delta / unusual activity materializer
- `collector/run_refresh_worker.py` — refresh queue worker

## Tastytrade API
- 账户: whicter.han@gmail.com
- remember-token 存于 Mac Studio `collector/.env`（首次需 `python auth.py --login`）；Railway Cron 用 `/data` volume 和 `TT_REMEMBER_TOKEN_STATE_PATH=/data/tastytrade-remember-token` 保存 provider 返回的 successor，不能只依赖短生命周期容器变量
- `/market-metrics?symbols=X,Y` → iv_rank(0-1), implied-volatility-30-day(%), hv-30-day(%)

## 待完成（优先级排序）
1. Production auth/subscription/paywall（需要产品方案与身份/支付凭据）
2. Remaining V1 polish
3. External/manual blockers

Universe/on-demand is complete: `symbol_universe` replaced the watchlist-only scanner boundary; `/api/analyze/:symbol` registers unknown tickers, reports independent price/metrics/options/GEX coverage, and queues only missing products. Scanner materialization reads the registry. COST runtime expanded the registry from 77 to 78 and produced Polygon price, 54 contracts and fresh GEX; its TT metrics manual-login failure is exposed as a blocker without a retry loop. Market cap/sector/optionable filters are wired but their registry values remain unpopulated.

Market/weekly is complete: `/api/market/regime` combines SPY/QQQ daily, regular-session 30M, GEX and IV with strict freshness gating. `/api/weekly/:symbol` replaced `weeklyMock.js` with actual five-session OHLC, available daily GEX/by-strike history, Max Pain and ΔOI. Wrong-side Walls are rejected; ΔOI is never called money flow. Runtime showed Mixed 51 and correctly marked 7/14 intraday bars stale against 7/15 daily data.

P2.1 product home is complete: `/` renders Quantrift with an actual scanner visual, live Market Regime strip, and direct Scan/Analyze/Weekly actions. The brand nav returns home and `/learn` remains separate. Frontend tests/build/lint passed; automated browser screenshot remains blocked by the browser plugin initialization error.

P2.2 scanner alerts are complete: subscription API supports email/web push, consent, normalized rules and token unsubscribe; `scanner_alert_deliveries` is an idempotent outbox; PM2 evaluates after each scanner materialization. Runtime migration/API/dry-run passed. SMTP/VAPID secrets are not configured, so real external receipt remains an explicit manual deployment check and current readiness correctly reports blocked/null.

P2.3 heartbeat is complete in code and persistence: Mac daemon reports through a bearer-authenticated endpoint; Railway status includes expected-but-never-seen nodes; monitor incidents transition active/resolved with cooldown and blocked webhook state. Server 39 tests and collector 78 tests passed. Railway migration and full local-against-Railway state-machine smoke passed. Production shared token/URL and webhook still require operator configuration.

Derived IV Rank cutover is complete in all control planes: ready symbols are filtered before scheduled TT authentication, skipped by queued metrics jobs, and treated as covered by Analyze. Server 40 and collector 81 tests pass. Railway remains 0/67 ready, so current TT eligibility is expected until 252 independent market dates accumulate.

Tastytrade metrics cron is deployed as Railway service `quantrift-metrics-cron`: one-shot image/config run weekdays at 22:30 UTC and exit. Collector 104 tests and a repo-root Docker build pass. The 2026-07-16 first manual execution connected to PostgreSQL and loaded 67 symbols, then TT rejected the remember token (`401 invalid_credentials`; local no-write probe `403`). Replace the Railway token after `auth.py --login`, manually rerun, and verify `iv_history` before marking the cloud collector live.

Mac Studio power recovery is partially complete: `pmset -g custom` verified AC Power `autorestart 1` on 2026-07-16, and LaunchAgent `pm2.congrenhan` has `RunAtLoad=true` with `pm2 resurrect`; its saved list contains all five Quantrift collector apps. UPS procurement and a controlled full recovery test for PM2, IB Gateway, collector health, jobs and snapshots remain physical operations.

IB Gateway cloud evaluation is complete: use a fixed-egress VPS, pinned Gateway/IBC image, paper/read-only mode, Docker secret and loopback-only ports. `ops/ib-gateway/` holds the template and 72-hour soak gates. Collector 85 tests and compose config pass; VPS purchase and IBKR 2FA remain external.

P3 Clerk scaffold is implemented: conditional frontend provider/sign-in/account UI, Express auth middleware, users/subscriptions schema, Free/Pro entitlements and `/api/account/me`. Server 43 and frontend 19 tests/build pass. The Railway additive migration succeeded and target tables were read-only verified; Clerk keys and real sign-in remain external.

Portfolio is implemented: authenticated multi-leg CRUD, `positions`/`position_legs`, actual snapshot matching, signed P/L and aggregate Greeks, close lifecycle and fail-closed missing quotes. Server 46 and frontend 21 tests/build pass. Railway schema is applied; authenticated runtime remains pending Clerk keys.

Stripe billing is implemented: Checkout/Portal, signed raw webhook, transactional event-id dedupe, subscription projection, per-user customer creation lock and rollout-gated paid-route entitlements. Frontend globally supplies Clerk bearer tokens. Server 56 and frontend 21 tests/build pass, and Railway schema is applied. Stripe keys/webhook, Clerk keys and production lifecycle remain external blockers.

Frontend verification debt is cleared in an independent section: full ESLint passes with 0 errors/0 warnings, frontend tests are 21/21, and the Vite production build succeeds. Remaining chunk-size output is a non-failing performance warning.

Analyze Tab4 now uses real OI density rather than GEX: `/api/chain/stats` independently selects IV and OI snapshots, aggregates nonexpired Call/Put OI by strike, and returns OI-specific provenance. Server 58 and frontend 21 tests, full lint and build pass. Railway-backed PLTR smoke returned fresh Polygon OI across 7 expiries/84 contracts/11 strikes.

Reddit community trends are deployment-ready: OAuth provider, bounded auth/rate handling, universe-safe extraction, normalized Railway tables, Scanner heat column and saved 30-minute PM2 cron are complete. Empty-table runtime preserves scanner results and reports missing. Collector 90, server 58, frontend 23, lint and build pass. Real snapshot remains blocked only on Reddit OAuth credentials/access; the job is currently disabled-safe.

Reddit enabled-path schema fix: `load_universe` must query `symbol_universe.scan_enabled`, not the nonexistent `scannable`. A direct database-contract test now covers this path even when OAuth credentials are absent.

Universe reference metadata is complete: `collect_universe_metadata.py` uses Polygon ticker reference data to fill symbol names, asset type, market cap and SIC-derived sector/category while preserving manually maintained fields. `optionable` is true only from persisted usable option snapshots, not guessed from reference data. Railway runtime on 2026-07-16 processed 78 active/scan-enabled symbols, updated 77, missed only `VIX`, failed 0, and scanner materialization carried market cap 27 / sector 28 / optionable true 69. PM2 `quantrift-universe-metadata` is saved as a Sunday 12:15 one-shot cron.

Unusual Whales sweep/TRF data layer is code-complete: account-configured WebSocket JSON transport, official FlowAlert/TradeReport normalization, idempotent event/state tables, `/api/flow/:symbol`, Analyze UI and disabled-safe PM2 process. Railway migration is applied and both empty tables are confirmed. PM2 registration is saved and disabled runtime remains online/idle with restart count 0. Fresh stream + no ticker event is quiet; absent heartbeat is missing; only `market_center=L/2` is dark pool. Collector 95, server 62, frontend 25, lint and build pass. Real stream acceptance requires `UW_WS_URL`, `UW_API_TOKEN`, and the account subscription envelope.

Composite Momentum is complete in `/api/sr/:symbol` and Analyze Tab2: regular-session 30M, daily and weekly-aggregated closes produce disclosed 30/40/30 weighted components. Missing timeframe history fails closed; lagging 30M marks the result stale. Railway AAPL replay used 250 daily/200 intraday rows and returned 84 with a correct 7/15 vs 7/14 stale gate.

Analyze P1.2 已完成：`/api/sr/:symbol` 从最多 250 根真实日线派生 pivots/Focus；`/api/chain/stats/:symbol` 从真实 IV contracts 派生 skew/term structure。日期统一 ISO；纽约当日 incomplete volume 不算 daily RVol；缺真实数据不生成 mock 曲线或 synthetic legs。

Collector health alert 已完成：`check_collector_health.py` 每 300 秒检查 coverage/failures/age/completeness，`collector_health_alerts` 持久化 fingerprint/cooldown/resolution，通知支持 webhook/SMTP/log fallback。

Polygon price history 已实现：`collect_prices.py` 同轮写 `price_history` 日线与 `price_history_30m`，source=`polygon_licensed`；PM2 scheduled provider 不再依赖 IB price，IB adapter 仅保留为显式 fallback。
Runtime 已验证 67/67 双 timeframe coverage；shared Stocks limiter 为 16 秒并跨 option/price PM2 进程协调。下一 section 直接从 349+ 日线 rows 自算 HV30/60/90，并对 ATM IV/IV Rank 做 history readiness gate。

Derived volatility 已完成：`volatility_history` 隔离 Polygon HV/ATM IV；API/scanner 输出字段级 provenance。Railway runtime 为 HV 67/67、ATM IV 67/67、ATM DTE 30–43；IV Rank 需要 252 个独立美东交易日，当前 1–2 observations/symbol、0/67 ready，因此仍使用 Tastytrade cold-start rank。一次 UTC 午夜 bug 曾把 30 DTE 算成 29 DTE，现统一使用 `America/New_York` market date 并有回归测试。

Scanner strategy expansion 已完成：13 种真实合约结构；sell 使用 bid、buy 使用 ask；Calendar/Diagonal 跨期规则和 Iron Fly/Jade Lizard 结构门控有测试。`/api/scan` 分离 latest positioning 与 latest quoted snapshot，恢复 55-symbol quote coverage；高级 Short Strangle/Short Put/Short Call 默认关闭。
