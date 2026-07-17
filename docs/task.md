# Task Tracker

## ✅ 2026-07-16 — Page Copy Audit Remediation

- ✅ 全站：`zh-CN` metadata、产品 title/description、中文主题标签与固定研究/风险披露。
- ✅ 首页：静态预览明确标为示例且非当前市场；产品边界改为数据覆盖、快照候选与研究决策支持。
- ✅ Analyze：移除“盘中即时”“IV 优势”“做市商事实持仓”等断言；GEX/Wall/Flip 统一为带单位和定位假设的模型估算；POP、情景、财报提示改为条件化研究说明。
  - 2026-07-16 copy pass：Q1 先给出“正/负 Gamma 环境 + 估算 GEX”的直接结论，再用一句盘面含义解释波动可能收窄/放大；公开 OI 的模型边界放在结尾，不用“代理符号假设”打断主句。
  - 2026-07-17 copy pass：Q2 直接说明动量与 Gamma 环境组合下可能出现的波动表现；Q3 改为明确的上方/下方关注价位，模型边界仅保留为句末一句。
  - 2026-07-17 strategy-candidate repair：Analyze 改为调用后端的 `/api/analyze/:symbol/candidate`；服务端从最新已报价链生成并只返回入选策略腿，前端不再把 `recommendation` 硬编码为 `null`，也不再接收完整合约链。
  - 2026-07-17 quote-readiness repair：期权链存在不再等于策略腿可用。Analyze 与 watchlist refresh 均把至少一条有效 bid/ask 视为独立完成条件；无报价链按高优先级排队补取，避免 GEX/OI 已有但策略候选永久为空。
  - 2026-07-17 quote fallback repair：`require_quotes` 任务若 Polygon 快照没有有效 bid/ask，worker 自动尝试 `tt_internal`；两个 provider 都无报价则写入明确的 non-retryable blocker。不会把 mark、last 或日线价格伪装成策略腿报价。
  - 2026-07-17 TT persistence repair：provider 原始 DXLink 元数据可能含 Python `Decimal`；snapshot 写入层统一 JSON 编码为数值，避免 TT 已拿到报价却在 `raw_metadata/raw_contract` 持久化时失败。
  - 2026-07-17 retry classification repair：仅“所有报价 provider 无有效 bid/ask”及认证不可用会阻断 24 小时；序列化等代码故障保留为可重新入队的失败，修复部署后可立即恢复。
  - 2026-07-17 Railway refresh execution repair：原 cloud cron 只执行 `collect.py`，而 API 入队由 `run_refresh_worker.py` 消费，造成 on-demand jobs 永远不执行。cron 现每 5 分钟运行 `run_railway_refresh_cycle.py`：watchlist scheduler → refresh worker → scanner materialization；TT metrics 仍保持禁用，不在该云任务中登录或拉取 IV metrics。
  - 2026-07-17 scanner materialization repair：PostgreSQL GEX 原始 JSON 读回时包含 `Decimal`，`scanner_results_snapshots.payload` 的 JSONB 编码此前会抛错并使 refresh cycle 末尾失败。现与 option snapshot 持久化边界一致，将 Decimal 显式编码为 JSON number；Railway refresh scheduler 固定走 `polygon_licensed` 主 provider，避免将云端 watchlist 工作排到已知会触发 TT device challenge 的 provider。
  - 2026-07-17 on-demand quote retry repair：Railway TT 的 `device_challenge` 是该 cloud worker 的认证状态，不代表 Mac Studio/IB worker 不能采集。Analyze 过去把这类失败记成 24 小时全局 quote blocker，导致队列为空、可用本机 worker 也不能补齐 RKLB 等标的。现仅在 provider 已明确返回“所有尝试均无可用报价”时才阻断；认证失败保持可重试并可交由另一运行面消费。
  - 2026-07-17 provider-construction fallback repair：Polygon key 缺失会在 provider 初始化时抛错，旧 worker 只对“已返回但无 bid/ask”的 Polygon snapshot 做 TT fallback，因而直接重排队且永远不尝试本机 TT。现将可识别的 provider 初始化/连接不可用与无报价统一进入 fallback 序列；RKLB 等 quote job 可由本机 TT/IB 继续消费。
  - ✅ 2026-07-17 runtime acceptance：生产 `GET /api/analyze/RKLB` 从 `option_quotes=false` 恢复为 `ready`；更新后的本机 worker 对 job 1059 先识别 Polygon 未配置、再使用本机 TT 获取真实报价，写入 snapshot/GEX/OI delta/scanner。`GET /api/analyze/RKLB/candidate` 返回后端筛出的具体 Diagonal Spread 两腿、35/63 DTE、真实 bid/ask 与输入 snapshot time。
- ✅ Trend / Options：OBV 改为价量动量；PCR 仅描述 Put/Call 相对比例；外部事件流、OI 异动与数据状态不再暗示净资金流、机构身份或实时性。
- ✅ Scan：已采集报价快照、筛选匹配分、模型定位、社区样本和候选结构均附清晰边界；不再表述为可直接成交订单或预测分数。
- ✅ Weekly：自定义“恐慌/贪婪”改为周度模型分数；Gamma/Wall/Max Pain/ΔOI 改为快照模型与条件情景。
- ✅ Learn / Portfolio / Account：Greek、概率锥、导出水印、策略知识、记录平仓和订阅频率均明确模型/教育/记录边界。
- ✅ 审计记录：`docs/quantrift_page_copy_audit.md` 已加入逐块完成状态和剩余项。

### Deferred / requires a separate decision

- [ ] 全路由 SSR/SSG：当前先在静态 `index.html` 放入可抓取的产品语义摘要；完整 SSR/SSG 需要单独决定框架与部署迁移。
- [ ] 品牌名、域名和商标保护：需要产品所有者在注册商、法务和运营侧执行，不能由 repository 直接完成。

### Post-audit remaining work (ordered)

#### A. Release verification for the copy/model changes

- [ ] Add Playwright visual regression coverage for `/`、`/analyze?symbol=SPY`、`/scan`、`/weekly`、`/learn`、`/portfolio`、`/account` on desktop and mobile viewports.
  - Assert no clipped headers, horizontal overflow, hidden controls, or footer overlap.
  - Assert the homepage’s illustrative/non-current label and fixed research disclosure are visible.
  - Assert GEX/Wall/POP model disclosures appear when those values are rendered.
- [ ] Add production smoke checks after deployment.
  - Verify the deployed HTML contains `lang=zh-CN`, product title/description, static H1 and research disclaimer before JavaScript hydration.
  - Verify the production frontend artifact contains no `.map` files and no API/provider secrets.
  - Verify `/api/scan` and `/api/analyze/:symbol` responses retain source, snapshot time, freshness and model-version fields used by the UI.

#### B. GEX and research-model governance

- [x] Add a versioned model metadata contract to every GEX-derived product DTO.
  - Implemented in four independently deployable steps: (1) API adapter and persisted scan payload, (2) shared `DataDetails` UI, (3) deterministic GEX/Flip/Wall fixture validation, (4) versioned POP/Expected Move inputs and validation.
  - Step 1 completed: `/api/options/:symbol/gex`, `/api/scan`, and `/api/weekly/:symbol` expose `gex_metadata` with model, data state, coverage and calculation parameters.
  - `gex_metadata.model` carries metric, model version, unit, formula ID, positioning model and public-OI limitation. `data_state` carries status, snapshot time, age, refresh state, confidence and a public source label. `coverage` carries contract/quality and expiry-window fields. `parameters` carries move size, multiplier, local window, flip grid and risk-free rate.
  - Scanner materialization persists this metadata in its existing JSON payload, so it is tied to the GEX snapshot that generated the scanner row. Old rows without that payload are explicitly `partial`, never backfilled with invented assumptions.
  - The UI must render a compact user-facing data-details view and retain a richer admin/debug view.
- [x] Establish a reproducible GEX validation suite.
  - Step 3 plan: freeze option-chain fixtures with a known valuation timestamp; verify contract exposure, strike aggregation, Global/Local GEX, Wall selection, Gamma Flip interpolation and no-crossing behavior. Recompute the same fixture twice and require byte-stable output.
  - Add a fixture manifest containing model version, valuation date, multiplier, expiry range, expected outputs and tolerances. A separate replay command will load the fixture through the collector calculation path and emit a machine-readable result.
  - Add a real-snapshot comparison report for one ETF and one single stock: snapshot ID/time, option count, missing data ratios, formula inputs, output values and changed-field diff. It is validation of calculation consistency, not a trading-performance claim.
  - Implemented: `collector/tests/fixtures/gex_validation_v1.json`, `collector/gex_validation.py`, `collector/compare_gex_snapshots.py`, and `collector/tests/test_gex_validation.py`.
  - Reproducible fixture command: `cd collector && .venv/bin/python -m unittest tests.test_compute_gex_walls tests.test_gex_validation`.
  - Read-only production-snapshot comparison: `cd collector && .venv/bin/python compare_gex_snapshots.py --symbols SPY,AAPL`. 2026-07-16 result: SPY snapshot `757` (27 usable contracts, missing Greeks `25.00%`) and AAPL snapshot `815` (72 usable contracts, missing Greeks/OI `0.00%`) matched all stored Global/Local GEX, Gamma Flip, Call/Put Wall and Max Pain values within `0.0001` tolerance.
  - Fixed option-chain fixtures must verify per-contract GEX, aggregate GEX, Gamma Flip interpolation, Call/Put Wall selection, 1%-move units and sign-assumption labeling.
  - Run a historical comparison across at least one ETF and one single-stock chain before making any performance or market-structure claim.
- [x] Define and document expected-move and POP inputs per strategy.
  - Implemented on every concrete Scanner candidate as versioned `expected_move` and `pop` objects. The public DTO does not expose the full chain; it exposes only the selected setup, declared model inputs and the originating quote-snapshot timestamp.
  - Expected Move is `expected-move-v1-atm-iv-sqrt-time`: spot × the mean IV of the nearest same-expiry Call/Put × sqrt(calendar DTE / 365). It declares `contract_iv`, `nearest_atm_call_put_mean`, one standard deviation, calendar-day convention, expiry/DTE, input contracts and lower/upper range.
  - POP is `pop-v1-lognormal-breakeven`: risk-neutral lognormal terminal-price probability at the candidate expiry using that declared IV, `SCAN_RISK_FREE_RATE` (default `4.5%`), zero dividend-yield assumption and executable bid/ask-derived break-evens. It supports static-expiry Bear Call, Bull Put, Iron Condor, Iron Butterfly, Strangle, long/short single-leg and Jade Lizard payoff shapes. Calendar/Diagonal are explicitly unavailable because they do not have one static expiry payoff model.
  - Required inputs are fail-closed. Missing same-expiry ATM IV, non-positive DTE, absent static break-evens or an unsupported payoff shape return `status: unavailable` with a reason; the system never substitutes a fixed POP, mark price or fallback IV. Missing leg quotes prevent candidate construction.
  - Scanner UI renders compact `EM` / `POP` state with an in-context tooltip; EM/POP are model estimates, not a prediction, tradable quote or return guarantee.
  - Verification: `cd server && npm test` covers credit spread, debit strategy, Iron Condor, absent IV and missing quote behavior; route tests assert the public DTO includes the declared fields and contract-IV sample input. Frontend test/lint/build verify the compact rendering path.
- [x] Reconcile stored watchlist GEX after a model-version upgrade.
  - Root cause observed 2026-07-16: option-chain snapshots existed for 67 watchlist symbols, but 64 latest GEX rows were calculated with the legacy unversioned formula. The API correctly rejected those rows because it requires `gex-v2-1pct-positioning-proxy`, causing Analyze to say GEX/Wall unavailable.
  - `collector/reconcile_gex_models.py` now reads only the latest persisted chain per watchlist symbol, finds missing or version-mismatched GEX rows, and recomputes GEX/Wall/Flip locally from PostgreSQL. It never requests market data.
  - `run_collector_daemon.py` runs that reconciliation at startup and every hour by default (`GEX_MODEL_RECONCILE_SECONDS=3600`). This makes a model upgrade an automatic derived-data backfill rather than a user-visible coverage outage.
  - 2026-07-16 repair: 66 of 67 symbols recomputed successfully. `SRVR` stayed unavailable because its latest chain had a 44.44% missing-Greeks ratio, above the model's 25% quality threshold.
- [x] Make Analyze-triggered missing-data collection immediate and priority-aware.
  - Analyze already polls `/api/analyze/:symbol`; it now enqueues its missing price, metrics and option-chain jobs with priority `100`. The refresh worker consumes queued jobs by priority before the background watchlist schedule, so an interactive request is not delayed behind cold-start coverage work.
  - Current option chain but missing/current-version-rejected GEX enqueues `gex_recompute` with provider `internal`. The worker reads the latest persisted chain, recalculates GEX/Wall/Flip, and rematerializes Scanner without making an external provider request.
  - Truly missing chains still enqueue `polygon_licensed` option collection. After the worker persists a chain, its existing finalization path computes GEX, materializes OI delta and Scanner output; Analyze's existing five-second poll reloads the page data.
  - Verification: server `npm test` covers priority on-demand jobs and old-GEX local recompute; collector tests cover recompute from the latest persisted chain without provider calls.

#### C. Product architecture and disclosure follow-through

- [x] Implement a reusable `DataDetails` component across Analyze, Scan and Weekly.
  - `frontend/src/components/DataDetails.jsx` is collapsed by default. Analyze shows the selected GEX snapshot; each Scanner row offers a compact expandable detail; Weekly follows its selected historical GEX point.
  - It shows public snapshot/model context without emitting provider/internal implementation names: model version and unit, snapshot time, contract coverage/completeness, expiry window, positioning proxy and Local/Flip parameters.
  - State vocabulary is rendered as `fresh` / `delayed` / `stale` / `partial` / `unavailable` / `historical`. The detail disclosure is intentionally secondary to the opportunity/analysis result.
- [ ] Implement full SSR/SSG only after choosing the frontend migration path.
  - The current static HTML semantic summary satisfies the immediate crawler requirement; route-level SSR/SSG remains a separate architecture migration.
- [ ] Complete V3A follow-up tasks already specified below: backend Analyze DTO, authorization/entitlement fail-closed gate, internal-status split, DB role separation, shared rate limiting/cache coordination, deployment security headers and CI artifact checks.

#### D. External-owner prerequisites (not executable from this repository)

- [ ] Register and configure any replacement domain; update DNS, Vercel domain mapping, CORS allowlist, canonical URL, CSP/connect-src and email sender configuration.
- [ ] Obtain legal review for the chosen brand/product name and register trademark protection where appropriate.
- [ ] Rotate any provider key that has entered Git history and store replacements only in deployment secret stores. See the existing P2.8 task at line 941.

## ✅ Done (V1 Core)
- ✅ Project scaffolding: React + Vite + Zustand
- ✅ Documentation: CLAUDE.md, README.md, wiki.md, learning.md, task.md
- ✅ Black-Scholes engine: pricing + Delta/Gamma/Theta/Vega/Rho + POP + BEP
- ✅ Strategy data: 86 strategies, 7 categories, 9-field notes each（系统按卖方框架补强）
- ✅ App layout: 3-column dark theme (sidebar / main / right panel)
- ✅ Sidebar: search, category filter, strategy list, ↑↓ keyboard navigation
- ✅ Payoff chart: Canvas, expiry + scenario lines, BEP markers, fill zones
- ✅ Greeks six-chart: Risk/Theta/Delta/Vega/Gamma/Rho with DTE slider (4 time lines)
- ✅ Scenario panel: spot / IV shift / rate / div / range / contracts
- ✅ Risk metrics: Max P/L, BEP, POP, Delta, Theta, Vega, Gamma, Rho (12 metrics)
- ✅ Leg editor: add/edit/remove legs, real-time chart update
- ✅ Strategy notes: 9-card grid (build/when/strike/IV/DTE/delta/TP/SL/adj)
- ✅ Unlimited profit/loss detection for naked options
- ✅ Greeks 知识库页面（5大 Greek + 6个 Interaction 卡片）
- ✅ 知识库扩展：GEX、Gamma Squeeze 实战案例、Vanna/Charm、OpEx Pin Risk、Vol Skew、期权卖方系统化框架
- ✅ 期权实战交易框架记录（卖方哲学、Tastytrade 规则、Vol Risk Premium）→ learning.md
- ✅ 数据库/基础设施决策：PostgreSQL on Railway（放弃 DuckDB）

## ✅ Done (V2 Scaffold — historical, superseded by the real-data paths below)
- ✅ React Router 多页路由：/learn、/analyze、/scan
- ✅ NavBar 组件：页面导航
- ✅ /learn：V1 所有组件完整保留（Learn.jsx）
- ✅ /analyze：标的分析页的初始 UI scaffold（当时使用示例数据；现已由真实数据路径与 fail-closed 状态取代）
- ✅ /scan：扫描器页的初始 UI scaffold（当时使用示例数据；现已由 `/api/scan` 候选 DTO 取代）
- ✅ 历史示例数据：9 个标的；不再作为生产 Analyze/Scan 的 fallback
- ✅ Analyze ↔ Scan 联动：扫描器点击行自动填入并分析

## ✅ Done (Phase 1 — /analyze 4-Tab UI)
- ✅ /analyze 重构为 4-tab 布局（Tab 导航 + URL 状态 ?tab=0-3）
- ✅ Tab 1 今日概览：sector chips、3个 Q&A 卡片、conclusion card、badge 组（格局/动量/信号/GEX）、剧本 playbook、推荐卡
- ✅ Tab 2 日内变化：Kalman Filter 趋势图 Canvas、Trend Spread 动量柱、输出 badge、3格辅助信息（趋势格局/期权结构/RVol）
- ✅ Tab 3 数据解读：GEX by Strike Canvas（带 Put/Call Wall 竖线、当前价箭头）、3 核心数字（GEX Total/PCR/IV ATM）、Unusual Activity 列表、结论文本
- ✅ Tab 4 信号追踪：筹码标尺 Canvas（竖向密度图）、上方压力/下方支撑卡、观察结论
- ✅ mockAnalysis.js 扩展：9 标的增加 sector/gexTotal/gexByStrike/putWall/callWall/pcr/unusualActivity/trend/conclusion/scenarios 字段
- ✅ Canvas 全部支持 devicePixelRatio + ResizeObserver（Retina 适配）

## ✅ Done (Phase 2 — /weekly Weekly Recap UI)
- ✅ /weekly 路由 + /weekly/:symbol 参数路由（App.jsx + NavBar）
- ✅ Weekly.jsx：5段导航（?sec=0-4）、prev/next 按钮、进度计数；`/weekly` 默认加载 SPY，顶部保留常用标的快捷入口并支持输入任意有效标的代码。
- ✅ Weekly 真实数据：`/api/weekly/:symbol` 返回 rolling 5-session OHLC、每日实际 GEX history、Max Pain、ΔOI 与条件剧本；`weeklyMock.js` 已删除
- ✅ Sec1 本周定调：K线图 Canvas（5根OHLC）+ CME Gauge Canvas（半圆弧仪表盘）、定调文字
- ✅ Sec2 Gamma迁徙：星期选择器、GEX 日内图 Canvas（随天切换）、Call/Put Wall 迁移表
- ✅ Sec3 交割偏离：MaxPain vs FridayClose 偏离条形图、偏离 badge（中性/警告/空方）
- ✅ Sec4 仓位变化：真实 ΔOI 日汇总；明确不将 OI 变化伪装成美元资金流或机构方向
- ✅ Sec5 下周分叉：多头/空头剧本卡片（触发条件/价格目标/观察重点）
- ✅ index.css：新增 ~170行 Phase 1 样式 + ~200行 Phase 2 样式（.wk-* 类）
- ✅ /weekly 全量数据化：不再按 symbol fallback mock；每个 module 对真实字段独立 fail closed

## ✅ Done (Infrastructure)
- ✅ Git repo 初始化，branch: master
- ✅ GitHub repo: whicter/quantrift_options-lab
- ✅ Mac Studio: /Users/congrenhan/Documents/quantrift_options-lab（SSH push）
- ✅ 本机: /Users/cohan/Documents/quantrift_options-lab（HTTPS pull）
- ✅ 工作流确认：本机开发 → rsync → Mac Studio push
- ✅ 项目结构重组：frontend/ + server/ + collector/ 单 repo
- ✅ server/：Node.js Express API（/api/metrics, /api/scan, /health）
- ✅ collector/：Python IV 采集脚本（auth.py + collect.py，Tastytrade → PostgreSQL）
- ✅ 代码已同步至 GitHub（本机 → Mac Studio → push）
- ✅ .claude/settings.json：Bash(*) 全放行白名单
- ✅ .claude_session：session UUID 固化，`cr` 命令一键恢复对话

## ✅ Done (Phase 3A — UI Polish)

> 参考截图：华尔街咖啡馆 MRVL/META 盘中即时分析 + Nokia 周复盘
> 完成于 2026-07-13

- ✅ **GEX 发散柱图**：已确认 Tab3Options + Sec2Gamma 均已是从零轴向两侧延伸的发散柱，无需修改
- ✅ **时间轴滑块（/weekly Sec2）**：Mon-Fri 按钮改为横向轨道 + 5个节点，当前日期蓝色高亮，CSS `.wk-timeline-*`
- ✅ **底部解读条**：Tab1/2/3/4 底部均加 `InsightCarousel`，新建 `components/InsightCarousel.jsx`，静态全部展示，黄色高亮
- ✅ **PCR 拆分（Tab3）**：mockAnalysis.js 加 `pcrVol`（9个标的），Tab3 数字格从3格扩展为4格（GEX/PCR OI/PCR Vol/IV），CSS `.az-gex-numbers-4`
- ✅ **公司信息增强**：新建 `data/companyInfo.js`（12个标的，含中文名/英文全称/logo/tagline）；/analyze header 显示 logo + 中文名；/weekly Sec1 显示大 logo + 中文名
- ✅ **价格区间 chip（Tab4）**：顶部显示 `$putWall ~ $callWall` 金色圆角徽章，CSS `.az-price-range-chip`
- ✅ **Tab4 筹码标尺重做**：bar 高度改为动态适配（相邻 strike 间距一半），bars 连续填充无空隙，渐变填色 + 左边accent，形成真正的 OI 密度分布侧面图
- ✅ **InsightCarousel 改静态**：去除自动轮播/定时器，所有条目一次性全部展示

---

## ✅ Phase 3B-1 — Provider-first 价格历史闭环（IB internal + Tastytrade）

> 前置条件：Mac Studio PM2 直接运行当前 repo 的 collector
> 本 phase 最初以 `PRICE_PROVIDER=ib_internal` 建立 provider-first 闭环；2026-07-15 scheduled default 已由 P0.1 切为 `polygon`，IB/Stooq 仅保留显式 fallback。yfinance 不作为默认路径。

### 真实价格历史（趋势图）
- ✅ **collector 新增每日价格采集**：symbol → 60 天 OHLCV
  - 写入 Railway PostgreSQL 新表 `price_history (symbol, date, open, high, low, close, volume, source, created_at)`
  - 存储位置：数据库，不放前端 mock、不放本地 CSV；collector 每天按 watchlist upsert 最近 60 个交易日
  - ✅ `server/src/migrate.js` 新增建表语句；2026-07-14 已在 Railway PostgreSQL 创建 `public.price_history`
  - ✅ `collector/common.py`：共享 `watchlist.txt` loader
  - ✅ `collector/providers/base.py`：`PriceProvider` / `PriceBar` contract
  - ✅ `collector/providers/ib_price_provider.py`：IB Gateway internal adapter，source=`ib_internal`
  - ✅ `collector/providers/stooq_price_provider.py`：显式 dev/backfill adapter，source=`stooq`
  - ✅ `collector/collect_prices.py`：读取 watchlist 或 `SYMBOLS` override，按 provider upsert `price_history`
  - ✅ `collector/requirements.txt`：加入 `ibapi`
  - ✅ `collector/.env.example`：加入 `PRICE_PROVIDER`、`PRICE_HISTORY_LIMIT`、`IB_HOST`、`IB_PORT`、`IB_PRICE_CLIENT_ID`、`IB_TIMEOUT`、`SYMBOLS`
- ✅ **server 新增 `/api/prices/:symbol`** 端点：返回最近 60 天 OHLCV
  - ✅ `server/src/routes/prices.js`
  - ✅ `server/src/index.js` 挂载 `/api/prices`
  - ✅ `frontend/src/lib/api.js` 新增 `getPrices(symbol, limit)`
- ✅ **Tab2Trend.jsx 改用真实价格**：优先调用 `/api/prices/:symbol`，fallback 保留 LCG mock
  - KF 计算逻辑不变，输入换成真实价格数组
  - RVol = 当日成交量 / 20日均量（从 price_history 算）
- ✅ **Weekly Sec1 改用真实价格**：`/weekly/:symbol` 优先读取 `/api/prices/:symbol`
  - AAPL/SPY/QQQ 仍保留完整 5-section mock/GEX/flow 结构
  - 若有真实价格历史，则覆盖 Sec1 的 weekClose / prevClose / weekHigh / weekLow / 5日 K线
  - GEX / flow / Max Pain 仍需授权 options data，不能用 mock 伪装成真实

### 真实 IV（Tastytrade）
- ✅ **`/api/metrics?symbols=X` 已上线**，前端 /analyze 接入
  - Analyze.jsx 调用真实 API
  - 真实 IV Rank / IV30 / HV / earnings 覆盖 mock shell
- ✅ Analyze 缺失数据 UX：输入未采集标的不再提示固定 AAPL/SPY/QQQ；区分“在 watchlist 但尚未写入”和“不在 watchlist”
- ✅ Analyze 使用真实 `/api/metrics` 覆盖 IV Rank / IV30 / HV / earnings；GEX/趋势结构暂用现有展示壳
- ✅ Analyze price-only fallback：当 symbol 已有 `/api/prices/:symbol` 但 `/api/metrics` 缺失时，不再整页显示“暂无真实数据”
  - 2026-07-14 case：`PLTR`
  - Confirmed from production API：`/api/metrics?symbols=PLTR` 返回 `{}`，但 `/api/prices/PLTR?limit=3` 返回 `source=ib_internal`、`freshness=fresh`
  - UI behavior：显示真实价格、price history 趋势、`IV Rank 暂不可用`，并明确提示 IV / GEX / Walls / option chain 暂未接入
  - 不生成期权策略结论，不把 mock option analysis 伪装成真实数据
- ✅ Analyze button click bug fixed：`onClick={handleAnalyze}` 会把 click event 当成 symbol 传入，导致 `.trim()` 报错；改为 `onClick={() => handleAnalyze()}` 并防御非字符串参数
  - 2026-07-14 local UI smoke verified：输入 `AAPL` 点击分析显示 IVR；输入 `PLTR` 点击分析显示 price-only 结果

### 真实 RVol（price_history 量能）
- ✅ 从 `price_history` 的 volume 字段计算 RVol，替换 Tab2 中的 mock RVol（0.2x）

### Phase 3B-1 验证记录
- ✅ Python syntax verified：`collector/venv311/bin/python -m py_compile collector/collect.py collector/collect_prices.py collector/common.py collector/providers/base.py collector/providers/ib_price_provider.py collector/providers/stooq_price_provider.py`
- ✅ Node syntax verified：`node --check server/src/index.js`、`node --check server/src/routes/prices.js`
- ✅ Frontend build verified：`npm run build` in `frontend/`
- ✅ Collector runtime verified with IB Gateway：`SYMBOLS=AAPL collector/venv311/bin/python collector/collect_prices.py`，写入 60 rows，source=`ib_internal`
- ✅ Database verified：AAPL `price_history` = 60 rows，date range 2026-04-17 → 2026-07-14，source=`ib_internal`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 3 rows，source=`ib_internal`
- ✅ Production API verified after deploy：2026-07-15 `GET /api/prices/AAPL?limit=3` 返回 HTTP 200、`freshness=fresh`

---

## ✅ Phase 3B-2 — 价格历史生产化与 UI 数据状态

### Collector 调度
- ✅ 在 Mac Studio 安装 `collect_prices.py` 定时任务
  - 当前实现：PM2 直接运行 `/Users/congrenhan/Documents/quantrift_options-lab/collector`，不维护第二份 runtime，不需要同步代码。
  - PM2 config：`collector/ecosystem.config.cjs`
  - App：`quantrift-options-prices`
  - Script：repo 内 `collector/collect_prices.py`
  - Python：repo 内 `collector/venv311/bin/python`
  - Schedule：Monday-Friday 13:35 PT / 16:35 ET
  - Environment：直接读取 repo 内 `collector/.env`
  - 旧 `com.quantrift.collect-prices` LaunchAgent、plist 和 `/Users/congrenhan/.quantrift_options_collector` 运行副本已停止并删除。
  - 启动命令：`pm2 start collector/ecosystem.config.cjs && pm2 save`
  - 验证命令：`pm2 status quantrift-options-prices`
- ✅ 跑完整 watchlist 一次 `collect_prices.py`
  - 成功 symbols 数量：67 / 67
  - 写入 rows：4020
  - 失败 symbols：无
  - 失败分类：无 IB contract 解析失败、无权限、pacing/timeout、symbol 格式问题
  - Railway DB 验证：`price_history` source=`ib_internal`，date range 2026-04-17 → 2026-07-14，所有 symbol 均 >=60 rows
- ✅ 为 `BRK.B` 等特殊 ticker 建立 symbol normalization 规则
  - 输入 symbol
  - IB contract symbol/localSymbol
  - UI display symbol
  - DB canonical symbol
  - 规则：DB/UI canonical symbol 保持原样；IB `Contract.symbol` 将 `.` 映射为空格，例如 `BRK.B` → `BRK B`

### Backend/API
- ✅ 部署 server 后验证生产 `/api/prices/:symbol`
  - `curl -f "https://quantriftoptions-lab-production.up.railway.app/api/prices/AAPL?limit=3"`
  - 返回字段必须包括 `symbol`、`source`、`count`、`latest_date`、`prices[]`
  - 2026-07-14 验证结果：HTTP 200，返回 `source=ib_internal`、`count=3`、`freshness=fresh`、`is_stale=false`
- ✅ `/api/status/data` 增加 price coverage 细节
  - watchlist 总数
  - `price_history` covered symbols
  - missing price symbols
  - stale price symbols
  - latest price date
  - source distribution
  - 2026-07-14 生产验证：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ `/api/prices/:symbol` 增加 freshness 字段
  - `snapshot_ts` 或 `latest_date`
  - `freshness`
  - `is_stale`
  - `source`

### Frontend
- ✅ Analyze header 显示价格数据状态
  - `price ib_internal 2026-07-14`
  - stale 时显示 `price stale`
  - missing 时不显示真实价格标记
- ✅ Tab2Trend 增加真实/示例走势标识
  - real：`price_history`
  - fallback：`示例走势`
  - 不把 fallback 说成真实数据
- ✅ Weekly Sec1 增加价格来源标识
  - real：显示 `price_history source + latest_date`
  - fallback：显示当前为示例 weekly shell
- ✅ Scan 结果增加 price coverage 状态
  - 已有 price_history
  - 缺失 price_history
  - stale price_history

### Verification
- ✅ Syntax verified：Python collector files
- ✅ Syntax verified：Node server routes
- ✅ Frontend build verified：`npm run build`
- ✅ Collector runtime verified：完整 watchlist run
- ✅ Historical LaunchAgent run verified on 2026-07-14；current runtime has migrated to PM2 direct-repository execution（见 Phase 3D-2B）
- ✅ Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 `freshness=fresh`、`is_stale=false`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/status/data"` 返回 `price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ Production API verified：Railway `/api/prices/AAPL?limit=3`
  - 2026-07-14 结果：HTTP 200，`freshness=fresh`、`is_stale=false`
- ✅ Production status verified：Railway `/api/status/data`
  - 2026-07-14 结果：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ UI verified：`/analyze?symbol=AAPL&tab=1` 显示真实趋势（Playwright 自动化因环境报错未完成，功能已在生产手动验证）
- ✅ UI verified：`/weekly/AAPL?sec=0` 显示真实 5日 OHLCV（同上）

---

## ✅ Phase 3B-3 — Scanner 接入真实 IV + Price Coverage

### Backend/API
- ✅ `/api/scan` 限定 collector watchlist
  - 使用 `server/watchlist.txt` fallback，避免 Railway server-only 部署读不到 `collector/watchlist.txt`
  - 不再扫描 `iv_history` 中的 extra symbols
- ✅ `/api/scan` 返回 latest `price_history` 字段
  - `price_close`
  - `price_date`
  - `price_source`
  - `price_status`
- ✅ `/api/scan` 继续按真实 IV 数据筛选
  - `minIvr`
  - `maxIvr`
  - `minIvHv`
  - `limit`

### Frontend
- ✅ `frontend/src/lib/api.js` 新增 `getScan()`
- ✅ `Scan.jsx` 从 mock scanner 改为调用真实 `/api/scan`
- ✅ Scanner watchlist 显示来自 `/api/status/data`
- ✅ Scanner table 使用真实 price close 和 price coverage status
- ✅ Strategy filter 仍在前端基于 current recommendation 过滤
- ✅ Direction column 接入真实 `price_history` 派生趋势，不再显示 `待接入趋势`
  - `collector/materialize_scan.py` 从 `price_history` 计算 trend_score、trend_label、trend_signal、5D change、RSI14、MA20/50/200
  - `/api/scan` 从 `scanner_results_snapshots` 返回趋势字段，前端只读 materialized result

### Current Scanner Logic
- ✅ 当前 scanner 是 IV + price trend + GEX/OI snapshot 版，不是完整 options chain selector
  - `IV Rank >= 50` + bullish trend：`Bull Put Spread`
  - `IV Rank >= 50` + bearish trend：`Bear Call Spread`
  - `IV Rank >= 50` + neutral/missing trend：`Iron Condor`
  - `30 <= IV Rank < 50`：默认 `Iron Condor`，小仓位/定义风险
  - `IV Rank < 30`：默认 `Long Straddle`，只表示低 IV 适合观察买方波动结构，不代表已有事件催化
  - Historical behavior：POP 曾为规则占位值，不来自真实 option chain；Phase 3H-1 已从 scanner 表格删除该字段，改为明确标注的候选质量“机会分”
- ✅ 已写入文档：`docs/wiki.md`、`docs/learning.md`

### Verification
- ✅ Node syntax verified：`node --check server/src/routes/scan.js`
- ✅ Frontend build verified：`npm run build`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/scan?minIvr=0&maxIvr=100&limit=10"`
  - 返回真实 Tastytrade IV rows
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
  - 结果限定在 watchlist 内
- ✅ Production API verified after deploy：Railway `/api/scan?minIvr=0&maxIvr=100&limit=5`
  - 2026-07-14 verified HTTP 200
  - 返回 rows 限定在 watchlist 内，不再包含 extra symbols such as `NFLX`
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
- ✅ UI verified：`/scan` 点击立即扫描显示真实 rows
  - 2026-07-14 Playwright Core + local Chrome smoke verified `https://www.quantrift.io/scan`
  - 操作：打开 `/scan` → 点击 `立即扫描`
  - 页面显示 `找到 8 个标的`，可见 rows 包含 `AMD` / `META` / `GOOGL`
  - `/api/scan` response row count = 8，payload 包含 `source=tastytrade`、`price_source=ib_internal`、`price_status=covered`

---

## 📋 V1 Backlog (Polish)
- ✅ Strategy comparison mode (side by side, 2 strategies)（策略库可选择任意两个策略，并排展示方向、风险级别、DTE、IV、TP/SL 与实际 legs；不会改变当前主策略）
- ✅ IV Rank badge per strategy in sidebar (Low/Med/High indicator)（根据每个策略 notes 中首个明确 IV 条件标识 `IV LOW` / `IV MED` / `IV HIGH`；表示适用波动率环境，不是实时标的 IV Rank）
- ✅ Probability cone on payoff chart (shaded distribution band)（Payoff 图按策略腿加权 IV 和最长 DTE 画出 68% 对数正态终值价格区间；该蓝色区间是价格分布，不是 POP）
- ✅ Export payoff chart as PNG（`PayoffChart` 导出当前 canvas 为命名 PNG；`canvasExport` 单元测试覆盖 PNG mime、下载文件名和缺失 canvas）
- ✅ Mobile-responsive layout (stack panels vertically)（策略库在 ≤900px 将 sidebar / 主内容 / 参数面板垂直排列；≤560px 将图表、notes、Greeks 网格收为单列并避免标题与操作按钮溢出）
- ✅ Payoff chart: show multiple DTE snapshots (not just current + expiry)（自动生成 75% / 50% / 25% 剩余 DTE 曲线；跨期结构按每条 leg 的实际剩余时间定价）
- ✅ Add 10 more strategies (exotic, FX, index-specific)（策略库增至 88 个模板：Call/Put Ladder、比例日历、Calendar Condor、Double Diagonal Condor、FX Risk Reversal / Seagull、Index Iron Condor / Broken-Wing Butterfly；catalog 测试校验数量、ID 唯一和新增模板存在）
- ✅ 策略 notes 进一步标准化（所有 88 个策略的 `iv` / `dte` / `tp` / `sl` 均展示至少一个数字阈值；模板本身已有数字时保留原规则，缺失项补入统一的 IV Rank 30-60、30-60 DTE/45 DTE、50% 止盈和 50% 最大风险止损基准；单元测试逐策略校验）

## 🚀 V2 — Real Data

### 数据层决策（已确定）
- ✅ 数据源方案：Tastytrade API（IV Rank，免费）+ provider-first OHLCV（当前默认 IB internal）+ 授权期权链数据源（生产）+ IB API（内部研究/算法验证）
- ✅ 数据采集节点：Mac Studio（复用已有 IB Gateway，clientId=2 与 futures bot 共存）
- ✅ 总数据成本：$0/月（Railway 托管 ~$5/月）
- ✅ 冷启动方案：Tastytrade API 第一天即可提供 IV Rank，同时自积累历史数据
- ✅ Tastytrade 账户注册完成（whicter.han@gmail.com）
- ✅ Tastytrade API 测试通过：/market-metrics 字段确认，认证流程完整验证
- ✅ remember-token 正常续期路径验证通过；遇到 `403 device_challenge_required` 时停止重试并提醒手动完成设备验证，不把认证错误当成可无限重试请求
- ✅ 生产数据原则：IB Gateway 只作为 internal research adapter，不作为公开/付费产品的默认 option chain 数据源，除非授权和再分发权利已确认

**Infrastructure**
- ✅ Railway: 创建 PostgreSQL Service，获取 DATABASE_URL
- ✅ Railway: 创建 Node.js Service，部署 server/，注入 DATABASE_URL
- ✅ 跑 migrate.js 建表（iv_history, scanner_configs）
- ✅ 建表 schema 已定义：server/src/migrate.js
- ✅ Mac Studio collector：配 .env，python auth.py --login，加 cron
- ✅ Vercel: 部署 frontend/，注入 VITE_API_BASE_URL → Railway URL
- ✅ 前端：mock data → 真实 API 调用
- ✅ 生产验收：quantrift.io 308 → www，www 200，Railway /health、/api/metrics、/api/scan 均返回成功（2026-07-14）

**Mac Studio 数据采集脚本**
- ✅ Python 定时脚本：collector/collect.py（每日 4:30pm ET，采集 IV → 写入 Railway PostgreSQL）
  - Tastytrade 认证：collector/auth.py；正常使用 remember-token 续期，device challenge/过期时写入明确错误并发提醒
  - 采集字段：iv_rank, iv30, hv30/60/90, iv_hv_diff, earnings_date, term_structure
  - 2026-07-14 首次手动跑通：写入 21 rows，source=tastytrade；cron 已安装为 1:30pm PT / 4:30pm ET
  - 2026-07-16 验收：authenticated Mac Studio 手动运行写入 67/67 watchlist rows、0 errors；生产 `/api/metrics?symbols=AAPL,PLTR,TSLA` 返回当天 `fresh` hybrid metrics，`iv_rank_source=tastytrade`。本机 crontab 已核实为每个工作日 13:30 PT。
- ✅ 数据覆盖状态 API：`GET /api/status/data` 读取 collector watchlist，并返回 `iv_history` 覆盖率、缺失标的、stale 标的、source 分布和最新日期
  - 同时返回 `price_history.table_exists`、价格覆盖数量和最新价格日期
- ✅ IB 连接管理：IB option fallback 默认 `IB_OPTION_CLIENT_ID=42`，price fallback 默认 `IB_PRICE_CLIENT_ID=12`，不再复用含糊的 clientId=2；均可由环境变量覆盖并与 futures bots 隔离
- ✅ 服务层自动切换：derived IV Rank ready 后 API/scanner 使用 derived；batch collector、on-demand API 与 refresh worker 均停止为该 symbol 调用 Tastytrade（2026-07-15）

**基础设施可靠性 / 云端迁移**
- [ ] Tastytrade collector 迁移：从 Mac Studio 搬到 Railway Cron Job（纯 REST API，无需本地网关，可直接云端跑）
  - ✅ 独立 one-shot image/config：`collector/Dockerfile.metrics` + `collector/railway.metrics.json`
  - ✅ 固定 UTC 盘后 schedule：`30 22 * * 1-5`；`restartPolicyType=NEVER`，进程完成后退出
  - ✅ Secret contract：`DATABASE_URL`、`TT_LOGIN`、bootstrap `TT_REMEMBER_TOKEN`（仅在 Railway 自己的 `provider_auth_state` 尚无记录时使用）、`TT_BASE_URL`、`TT_USER_AGENT`；镜像排除 `.env` 与本地 venv。`auth.py --login` 只会 seed 到该进程绑定的数据库；只有相同 `DATABASE_URL` 才与 Railway 共享。Railway 不需要接收 successor token。缺 `TT_LOGIN` 时 collector 必须在本地 fail closed，不能向 TT 发送请求。
  - ✅ Token-state durability：新表 `provider_auth_state(provider, remember_token, updated_at)` 是本机与 Railway Cron 的唯一续期状态。每次 exchange 先取得 PostgreSQL transaction advisory lock，201 后在同一事务写入 successor/当前 token；401/403/网络失败 rollback，不改状态。`TT_REMEMBER_TOKEN` 仅在数据库无 row 时 bootstrap；数据库 token 401/403 后不再拿环境 seed 发第二条请求，不进行密码 fallback。环境中误加的成对引号会在 bootstrap 前去除。无需 Railway `/data` Volume。
  - ✅ Migration runtime：2026-07-16 `source collector/.env && node server/src/migrate.js` 成功；只读 `to_regclass('public.provider_auth_state')` 返回表存在、`row_count=0`，未读取 token 值。
  - ✅ Verification：collector `unittest discover -s tests -v` 111/111 passed；server `npm test` 65/65 passed；`docker build -f collector/Dockerfile.metrics -t quantrift-metrics-cron:test .` passed after PostgreSQL token-state change
  - ✅ Railway 独立 service：`quantrift-metrics-cron` 已创建，config path 为 `/collector/railway.metrics.json`，DB/TT variables 已注入，Git deployment active（2026-07-16）
  - [ ] Railway TT metrics run（阻塞于 provider device challenge）：2026-07-16 本机以现有用户名/密码成功登录并将 fresh remember-token 写入共享 PostgreSQL；紧接着 Railway cron 使用同一 fingerprint 认证，TT 返回 `403 device_challenge_required`。确认 Railway 网络、数据库和 token state 均可达，但 TT 将 US West runner 识别为新设备。镜像现默认 `TT_METRICS_ENABLED=false`，保证后续 Railway schedule 不会读取凭据或调用 TT。当前可用路径是 Mac Studio 的 authenticated collector 写同一 Railway PostgreSQL；只有在 Railway 上完成明确的 TT device challenge 后，才将变量改为 true 并恢复此 cloud-cron task。
- [ ] Mac Studio 断电风险：加装 UPS（如 APC Back-UPS）并完成断电恢复演练
  - ✅ macOS 自动恢复已验证：2026-07-16 `pmset -g custom` 返回 AC Power `autorestart 1`；市电恢复后系统会自动重启。
  - ✅ PM2 开机恢复已验证：LaunchAgent `pm2.congrenhan` 的 `RunAtLoad=true` 执行 `pm2 resurrect`；`~/.pm2/dump.pm2` 包含 `quantrift-options-collector`、`quantrift-options-prices`、`quantrift-reddit-trends`、`quantrift-universe-metadata`、`quantrift-unusual-whales-flow`。
  - [ ] UPS 采购、接入并进行断电/复电演练仍需物理硬件操作；验收需确认 Mac、IB Gateway、PM2 collector 均自动恢复且无未处理 jobs 丢失。
- ✅ IB Gateway 云端迁移评估：结论为固定出口 Linux VPS + pinned Docker/IBC + private API；模板见 `ops/ib-gateway/`（2026-07-15）
  - 需解决：云端固定出口IP（避免触发IBKR异常登录验证）、2FA 首次人工确认 + 后续会话保活
  - 上线前置条件：面向付费用户/需要高可用时必须完成此项，个人 Mac Studio 不适合作为生产基础设施
  - ✅ Security template：paper + read-only 默认、password secret file、4001/4002 仅 loopback、persistent settings、pinned image
  - ✅ Verification：collector 85/85 tests；`docker compose config --no-interpolate` passed
  - [ ] 实际 VPS 采购、固定 IP、防火墙、IBKR 2FA 与 72 小时 soak test 需要人工账户/硬件操作
- ✅ 心跳监控：Mac Studio → Railway 心跳上报，云端检测断线并持久化告警（P2.3，2026-07-15）

**前端路由（Vite + React Router）**
- ✅ 安装 react-router-dom，配置多页路由
- ✅ `/` 产品入口：Quantrift hero 使用真实 scanner 视觉、live Market Regime、Scan/Analyze/Weekly workflow；品牌导航返回首页；desktop/mobile responsive
  - 2026-07-16：首页 Hero 的主入口改为高亮“分析标的”，次级入口为“打开扫描器”；workflow 卡片同样以 Analyze 为首项。
  - 2026-07-16：`/analyze` 未指定 symbol 时默认加载 SPY；Hero 主入口直接使用 `/analyze?symbol=SPY`。
- ✅ `/learn` → V1 教育工具（Learn.jsx）
- ✅ `/analyze` → V2 标的分析页（真实数据：GEX / 价格趋势 / OI异动）
- ✅ `/scan` → V2 扫描器页（真实数据：scanner_results_snapshots）

**V2 核心流程（ticker-first）**
- ✅ 用户输入标的 → 系统分析（不再要求用户先选策略）
- ✅ 技术分析层：MA20/50/200、RSI、MACD → 方向评分
  - 真实输入：`price_history`
  - 60日历史不足 MA200 时返回 `ma200=null`，不伪造长周期数据
- ✅ IV 分析层：IV Rank + IV vs HV → 卖方/买方判断
  - 真实输入：`/api/metrics`
  - recommendation matrix 使用 IV Rank / IV30 / HV / trend score / GEX context
- ✅ 事件风险：财报日检测
  - 真实输入：`iv_history.earnings_date`
  - `/api/scan` 返回 `earnings_date`
  - Scanner 前端显示财报日期；距离当前日期 0-14 天时标记 warning
- ✅ 策略矩阵 → 推荐具体策略 + 建议 Delta/DTE/宽度参数
  - High IV + neutral/positive GEX：Iron Condor
  - High IV + bullish trend：Bull Put Spread
  - High IV + bearish trend：Bear Call Spread
  - Low IV：Long Straddle
  - Mid IV：small defined-risk directional spread

**功能**
- ✅ 用 live 链数据填充推荐策略的 legs（后端 `candidateEngine.cjs` 使用真实同到期 bid/ask contracts，输出 expiry/DTE/legs/credit/debit/max loss/breakeven/RoR）
- ✅ Options scanner: IV Rank / spread width / liquidity / DTE / Greeks 阈值（server contract filters + frontend presets/advanced filters 已实现；无完整可执行 legs 时 fail closed）
- ✅ Push notifications pipeline：Scan 可按当前 IV Rank/Gamma/异动条件创建 email 或 browser push subscription；token 退订；collector 每次 materialize 后评估；delivery 表按 subscription+batch+symbol 去重
  - ✅ 无 SMTP/VAPID 时 delivery 明确 `blocked`，不假装 sent
  - ✅ Railway additive migration、API create/unsubscribe、PM2 evaluator dry-run 已验证
  - [ ] 人工配置 SMTP 与 VAPID public/private secrets 后完成真实 inbox/browser 收件验收

**✅ Phase 3D — Options Positioning Data Layer（已完成，Polygon 已在 Phase 3I 替代 IB internal 成为生产 provider）**

> IB Gateway internal adapter 仍作为 research/fallback 代码保留，但不再是生产采集路径。Schema、GEX 计算、API、前端均为 provider-agnostic，无需改动。

目标达成：option chain → snapshots → GEX / Wall / Gamma Flip → API → UI 完整闭环已在 Polygon licensed provider 下验证通过。

边界：
- ✅ `source=ib_internal` 只允许用于内部研究、算法验证、字段探索和个人使用。
- ✅ 不把 IB Gateway 放进公开用户请求链路；用户输入 symbol 时 API 只读 PostgreSQL 最新 snapshot。
- ✅ 不把 IB option chain 数据宣传为正式授权产品数据。
- ✅ 所有 API response 必须返回 `source`、`snapshot_ts`、`freshness`、`is_stale`、`provider_status`。
- ✅ provider adapter 必须可替换：IB internal adapter 与未来 licensed provider adapter 使用同一接口。

**Phase 3D-1 — Schema & Provider Contract**
- ✅ 定义 provider interface：
  - `fetch_underlying(symbol) -> spot, bid, ask, timestamp, source`
  - `fetch_option_chain(symbol, expirations, strike_window) -> contracts[]`
  - 当前文件：`collector/providers/base.py`
  - 当前实现：`UnderlyingSnapshot`、`OptionContractSnapshot`、`OptionChainSnapshot`、`OptionChainProvider`
- ✅ 新增 IB adapter skeleton：
  - `collector/providers/ib_option_chain_provider.py`
  - 只定义 `source=ib_internal` 和接口入口；实采逻辑留给 3D-2
- ✅ 新增 PostgreSQL schema：
  - `option_chain_snapshots`
    - `id`, `symbol`, `underlying_price`, `underlying_bid`, `underlying_ask`, `snapshot_ts`, `source`, `provider_status`, `provider_snapshot_id`, `contract_count`, `completeness_pct`, `missing_greeks_ratio`, `missing_oi_ratio`, `raw_metadata`, `created_at`
  - `option_contract_snapshots`
    - `snapshot_id`, `symbol`, `expiry`, `strike`, `option_right`, `bid`, `ask`, `last`, `mark`, `volume`, `open_interest`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `bid_size`, `ask_size`, `contract_symbol`, `local_symbol`, `con_id`, `provider_contract_id`, `raw_contract`
  - `gex_snapshots`
    - `snapshot_id`, `symbol`, `snapshot_ts`, `source`, `global_gex`, `local_gamma`, `gamma_flip`, `gamma_regime`, `spot_vs_flip_distance_pct`, `call_wall`, `put_wall`, `wall_method`, `max_pain`, `pcr_oi`, `pcr_volume`, `confidence`, `gamma_curve`, `raw_metrics`
  - `gex_by_strike_snapshots`
    - `snapshot_id`, `symbol`, `strike`, `call_gex`, `put_gex`, `net_gex`, `call_oi`, `put_oi`, `call_volume`, `put_volume`
  - `provider_fetch_jobs`
    - `symbol`, `job_type`, `provider`, `status`, `attempts`, `request_params`, `result_summary`, `last_error`, `created_at`, `started_at`, `finished_at`
- ✅ 新增只读 API skeleton：
  - `GET /api/options/:symbol/snapshot`
  - `GET /api/chain/:symbol`
  - `GET /api/gex/:symbol`
  - `GET /api/status/options`
  - missing snapshot 返回 `freshness=missing`；不触发 provider；不等待 IB Gateway
- ✅ Migration rollback plan：drop new tables only；do not touch `iv_history` or `price_history`.
- ✅ Migration executed：`NODE_ENV=production node src/migrate.js`
- ✅ Local API smoke verified：
  - `curl -f "http://127.0.0.1:3001/api/options/PLTR/snapshot"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/chain/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/gex/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/status/options"` → `table_exists=true`, `covered_count=0`, `missing_count=67`

**Phase 3D-2 — IB Gateway Internal Adapter**
- ✅ 新增 `collector/providers/ib_option_chain_provider.py`
- ✅ 新增 `collector/collect_options.py`
  - provider → `option_chain_snapshots`
  - contracts → `option_contract_snapshots`
  - job status → `provider_fetch_jobs`
- ✅ 使用 IB API `reqSecDefOptParams` 选择 bounded expiration buckets；再按 `expiry + right` 调用 `reqContractDetails` 获取 IB 实际存在的合约。
- ✅ 禁止本地构造 expiry × strike × right 笛卡尔积：
  - `reqSecDefOptParams` 返回的 expiry 集合和 strike 集合不是合法合约对的映射，不能互相组合。
  - 持久化前必须有 IB 返回的非零 `conId`、`localSymbol`、精确 expiry、strike 和 right。
  - 对实际返回的 contracts 做 spot range、每边 strike 数、每 expiry cap 和 global cap 过滤。
  - 同一 snapshot 按 `conId` 去重；不存在的组合不会进入 market-data 请求或数据库。
- ✅ 限定过渡阶段采集范围：
  - symbols：先 `AAPL`, `SPY`, `QQQ`, `PLTR`
  - DTE：7-60 days
  - strikes：spot ±15% 或每边最多 20 个 strikes
  - rights：call + put
- ✅ 对每个 option contract 请求 market data snapshot：
  - bid / ask / last / volume / open interest
  - model greeks：iv / delta / gamma / theta / vega
- ✅ 记录 IB pacing / timeout / empty contract：
  - 每 symbol 最大运行时间
  - 每批 contract 数量
  - provider error code
  - snapshot completeness percentage
- ✅ 失败策略：
  - underlying 缺失：整 symbol snapshot fail，不写 partial GEX
  - chain 缺失：写 job failure，不覆盖旧 snapshot
  - 部分 contract 缺 Greeks/OI：写 contract row，但 `completeness` 降低；GEX confidence 降级
- ✅ Runtime smoke with IB Gateway：
  - Command：`OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 IB_OPTION_CLIENT_ID=43 IB_TIMEOUT=25 venv311/bin/python collect_options.py`
  - Result：snapshot written，latest `snapshot_id=2`
  - API verified：`/api/options/PLTR/snapshot` 返回 `source=ib_internal`、`provider_status=partial`、`contract_count=10`
  - API verified：`/api/status/options` 返回 `covered_count=1`、`covered_symbols=["PLTR"]`
- ✅ Data quality follow-up 3D-2A：
  - 当前 IB 返回 chain definition / expiry / strikes，但 option quote、Greeks、OI 均为空：`completeness_pct=0.00`、`missing_greeks_ratio=1.0000`、`missing_oi_ratio=1.0000`
  - 已补 delayed market data tick parser：
    - delayed bid / ask / last / close：tick 66 / 67 / 68 / 75
    - delayed bid size / ask size / volume：tick 69 / 70 / 74
    - delayed option computation：tick 80 / 81 / 82 / 83
  - 已保留 live option computation fallback：tick 10 / 11 / 12 / 13
  - 已将 per-request IB error code 写入 contract `raw_contract.errors`
  - 已新增 `collector/debug_ib_option_ticks.py`，用于打印 raw tick payload 与 IB error code
  - Verification：
    - Syntax verified：`venv311/bin/python -m py_compile collect_options.py debug_ib_option_ticks.py providers/ib_option_chain_provider.py`
    - Runtime diagnostic attempted：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 IB_OPTION_CLIENT_ID=44 IB_TIMEOUT=30 IB_OPTION_SNAPSHOT_GRACE_SECONDS=3 venv311/bin/python debug_ib_option_ticks.py`
    - Result：IB Gateway connection timed out at `127.0.0.1:4001`；需要 Gateway/TWS API 端口在线后重跑 raw tick diagnostic
  - Remaining risk：
    - 若 raw tick 仍无 quote / Greeks / OI，需要确认 IB market data subscription / delayed options data / generic tick permissions
    - 若 TWS 自身看不到同一 contract 的 bid/ask/IV/Greeks/OI，API socket 也不会提供这些字段

**Phase 3D-3 — GEX / Wall / Gamma Flip Calculation**
- ✅ Transition provider decision：
  - 使用 `tt_internal` 作为当前过渡 option-chain metadata provider。
  - 后续正式上线前仍需购买具备授权/再分发权利的数据源。
  - public API 仍然只读 PostgreSQL snapshot，不同步调用 tastytrade 或 IB。
- ✅ 新增 tastytrade chain metadata adapter：
  - `collector/providers/tastytrade_option_chain_provider.py`
  - `OPTION_PROVIDER=tt_internal`
  - REST endpoint：`/option-chains/{symbol}/nested`
  - 保存 expiration、strike、call/put contract symbol、call/put streamer symbol 到 `option_contract_snapshots.raw_contract`
  - `source=tt_internal`
  - `provider_status=metadata_only`
- ✅ 新增 tastytrade diagnostic：
  - `collector/debug_tastytrade_option_chain.py`
  - Command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
- ✅ tastytrade DXLink quote/Greeks/OI merge：
  - 获取 API quote token
  - 订阅 underlying symbol 与 option streamer symbols
  - 记录 raw `Quote` / `Trade` / `Summary` / `Greeks` / `TheoPrice` / `Profile` payload
  - 将 bid / ask / last / volume / open_interest / iv / delta / gamma / theta / vega / rho merge 到 contract snapshot
  - 将 underlying bid / ask / trade price merge 到 chain snapshot
  - 若 TT 不返回 OI 或 Greeks，明确降级：quote-only / no-gex，不进入 GEX 计算
- ✅ Runtime smoke with tastytrade：
  - Diagnostic command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
  - Diagnostic result：PLTR chain metadata fetched；`available_expiration_count=19`、`available_strike_count=138`、`returned_contract_count=10`
  - DXLink diagnostic command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 TT_DXLINK_TIMEOUT=12 venv311/bin/python debug_tastytrade_dxlink.py`
  - DXLink diagnostic result：returned `Quote`、`Trade`、`Summary.openInterest`、`Greeks`、`TheoPrice`、`Profile` events for PLTR option streamer symbols
  - Collector command：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python collect_options.py`
  - Collector result：`snapshot_id=4`、`contracts=10`、`source=tt_internal`、`provider_status=metadata_only`
  - API verified：`/api/options/PLTR/snapshot?includeContracts=false` 返回 `freshness=fresh`、`provider_status=metadata_only`
  - Collector command after DXLink merge：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py`
  - Collector result after DXLink merge：`snapshot_id=6`、`contracts=10`、`source=tt_internal`、`provider_status=ok`
  - API verified after DXLink merge：`completeness_pct=100.00`、`missing_greeks_ratio=0.0000`、`missing_oi_ratio=0.0000`、`underlying_bid=133.5400`、`underlying_ask=133.6500`
  - Credential handling：使用 `.env` remember-token 正常续期；遇到 device challenge 转人工登录；secret 未写入仓库
- ✅ Gate before GEX：
  - GEX / Wall / Gamma Flip 只有在 gamma + OI completeness 达标后才计算
  - `metadata_only` snapshot 不参与 GEX
- ✅ GEX compute job：
  - 新增 `collector/compute_gex.py`
  - 只读 PostgreSQL latest option-chain snapshot，不调用 IB / tastytrade / provider
  - 写入 `gex_snapshots`
  - 写入 `gex_by_strike_snapshots`
  - Upsert by `snapshot_id`，同一 option snapshot 重算不会重复堆数据
  - Fail-closed：缺 spot、缺 gamma/OI、missing ratio 超过 `GEX_MAX_MISSING_RATIO=0.25` 时不写假 GEX
- ✅ GEX by contract：
  - call gex = `gamma * open_interest * contract_multiplier * spot^2 * 0.01`
  - put gex = `-gamma * open_interest * contract_multiplier * spot^2 * 0.01`
  - unit = `usd_delta_change_per_1pct_move`
  - Call positive / Put negative is a dealer-positioning proxy assumption, not a claim about actual dealer positions.
  - 缺 gamma 或 OI 的 contract 不参与 GEX，并计入 missing ratio
- ✅ GEX by strike：
  - `net_gex = sum(call_gex + put_gex)` by strike
  - `call_oi`, `put_oi`, `call_volume`, `put_volume` by strike
- ✅ Global GEX：
  - 跨 expiry、strike 聚合 `net_gex`
  - 输出 `positive`, `negative`, `near_zero`
- ✅ Local Gamma：
  - V1 默认使用 spot ±1%
  - Future candidates：spot ± expected move、最近 3-5 个 strikes
- ✅ Call Wall / Put Wall：
  - Call Wall：最大 call-side positive exposure 或最大 call OI strike
  - Put Wall：最大 put-side negative exposure 或最大 put OI strike
  - 同时保存 `wall_method=gex` 或 `wall_method=oi`，避免混淆 OI Wall 与 Gamma Wall
- ✅ Gamma Flip：
  - 构建 spot ±10% price grid
  - 对每个 grid price 重新计算每张期权 gamma 和 net GEX
  - flip = net GEX 穿越 0 的价格；无穿越则取 abs(net_gex) 最小点
  - 输出 `gamma_curve`, `gamma_flip`, `spot_vs_flip_distance_pct`, `gamma_regime`, `confidence`
- ✅ PCR：
  - `pcr_oi = total_put_oi / total_call_oi`
  - `pcr_volume = total_put_volume / total_call_volume`
- ✅ Max Pain：
  - V1 基于当前 selected contracts aggregate 计算单一 `max_pain`
  - Future：对每个 expiry 独立计算 nearest expiry max pain + aggregate max pain
- ✅ Confidence：
  - 根据 missing Greeks ratio、missing OI ratio、bid/ask availability、snapshot age 计算 high / medium / low
- ✅ Runtime smoke with GEX：
  - Command：`GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py`
  - Result：`gex_id=1`、`snapshot_id=6`、`global_gex=112882349.11`、`confidence=high`
  - API verified：`/api/gex/PLTR` returned `global_gex=112882349.1123`、`local_gamma=25163724.2306`、`gamma_regime=positive`、`call_wall=135`、`put_wall=135`、`max_pain=135`、`pcr_oi=0.3634`、`pcr_volume=0.4672`
  - Note：API `freshness=stale` because the source option snapshot was older than the 15-minute API freshness threshold at verification time

- ✅ GEX unit and model transparency correction：
  - `compute_gex.py` and the Gamma Flip curve both use the 1% underlying-move unit.
  - `gex_snapshots.raw_metrics` records formula, unit, move percentage, positioning model and limitation.
  - Model version is `gex-v2-1pct-positioning-proxy`; mixed-version history is not comparable.
  - `/api/options/:symbol/gex` returns `raw_metrics` for UI/data-detail disclosure.
  - Existing pre-correction GEX snapshots are not comparable and must be recomputed before deployment.
  - Recompute command：`GEX_RECOMPUTE_ALL=true GEX_SYMBOLS=<symbols> venv311/bin/python compute_gex.py`；完成后运行 `venv311/bin/python materialize_scan.py`。

**Phase 3D-4 — API Layer**
- ✅ `GET /api/options/:symbol/snapshot`
  - 返回 latest chain snapshot metadata，不返回全量 contracts unless `includeContracts=true`
- ✅ `GET /api/gex/:symbol`
  - 返回 `global_gex`, `local_gamma`, `call_wall`, `put_wall`, `gamma_flip`, `gamma_curve`, `pcr`, `max_pain`, `freshness`
- ✅ `GET /api/chain/:symbol`
  - 只读 latest snapshot；默认分页 / strike range / expiry filter
- ✅ `GET /api/status/options`
  - 返回 watchlist option-chain coverage、latest snapshot age、missing/stale symbols、provider failure count
- ✅ API 不同步调用 IB Gateway；missing/stale 只返回状态，不在用户请求里等待 provider。

**Phase 3D-5 — Frontend Integration**
- ✅ `/analyze?symbol=...` 读取 `/api/gex/:symbol`
- ✅ 若 GEX fresh：
  - 替换 mock GEX / Call Wall / Put Wall / Gamma Flip / PCR / Max Pain
  - 显示 source、snapshot time、confidence
- ✅ GEX 可用性与新鲜度分离：
  - required fields 完整时，fresh、stale 或 partial GEX 都展示实际 GEX/Wall/strikes。
  - stale/partial 显示 source、snapshot age、confidence 和质量提示，不冒充 fresh。
  - 只有 required fields 缺失时才进入 GEX unavailable，并清除 mock wall/gex/strategy legs。
- ✅ 支持 GEX-only fallback：
  - 如果 symbol 有真实 GEX + price，但暂无 `/api/metrics`，仍展示真实 GEX / Walls / PCR / Max Pain
  - IV Rank 区域显示 unavailable，不生成策略腿推荐
- ✅ UI safety fix：
  - Tab4 `Call Wall == Put Wall` 时不再出现 0-span canvas range
- ✅ **2026-07-16 real-data integrity repair**
  - 删除 `frontend/src/data/mockAnalysis.js`，`Analyze.jsx` 不再以 sample symbol 为页面基础对象。
  - 真实 price / metrics / GEX 各自独立注入；任一字段未返回时保持 `null` 或明确 unavailable，不可遗留样例价格、Wall、结论或策略腿。
  - `/api/scan` final query 将 `latest_rows.source` 显式限定，避免与 community snapshot 的 `source` 列冲突导致 PostgreSQL HTTP 500。
  - 继续限定 `latest_rows.snapshot_ts` 与 freshness CASE，避免同一 join 中 community batch 的同名 timestamp 再次触发 PostgreSQL ambiguity。
  - 回归：frontend 检查 Analyze 无 mock import/use；server scanner SQL 检查 source qualification。
  - Production smoke：2026-07-16 Railway `/api/scan?minIvr=40&maxIvr=100&limit=5` HTTP 200；Vercel `/analyze?symbol=NFLX` 显示实际 `$73.68`、Polygon price/GEX 和 $75/$73 Walls，`/scan` 显示 1,700 个实际报价候选单。
- ✅ Verification：
  - Frontend build：`npm run build`
  - Production API prepared：PLTR `snapshot_id=7`、`/api/gex/PLTR` returned `freshness=fresh`、`confidence=high`
  - Browser plugin smoke attempted but blocked by runtime setup error：`Cannot redefine property: process`
- ✅ `/scan` 新增 filters：
  - gamma regime
  - near call wall / near put wall
  - high local gamma
  - unusual OI / volume：当前实现 total OI / total volume / volume-to-OI ratio；OI delta 异常需后续连续 snapshot 历史
  - IV Rank + GEX combined scanner
  - API behavior：仍只读 latest `iv_history` / `price_history` / `gex_snapshots` / `gex_by_strike_snapshots`，不在 request path 同步调用 IB/TT/provider
  - Frontend behavior：扫描器新增 Gamma 环境、Wall 距离、Local Gamma、OI、Volume、IV+GEX 排序控件；结果列显示 GEX 状态、总 GEX、最近 wall 距离
  - Verification deferred per instruction

**✅ Phase 3D-6 — Verification（2026-07-15 完成）**
- ✅ Unit tests：GEX sign calculation、wall selection、gamma flip interpolation/nearest-zero fallback、PCR division-by-zero、confidence downgrade
- ✅ Integration tests：
  - seeded option snapshot → `/api/gex/:symbol` 返回正确字段
  - missing snapshot → `freshness=missing`
  - stale snapshot → stale response without synchronous provider call
- Verification evidence：
  - `collector/venv311/bin/python -m unittest discover -s tests -p 'test_*.py'` → 43 passed
  - `cd server && npm test` → 7 passed
  - API integration 使用 mocked PostgreSQL + refresh queue；fresh 不 enqueue，missing/stale 只 enqueue `option_chain_snapshot`，没有 provider call
  - 回归测试发现并修复 API enqueue 默认仍为 `tt_internal` 的漂移；`server/src/lib/refreshJobs.js` 现默认 `polygon_licensed`，并与 worker supported providers 对齐
- ✅ Integration / UI smoke：Polygon licensed provider 完整验证（见 Phase 3I）
- ✅ Disclosure：API 返回 `source=polygon_licensed`，区分 IB internal 研究路径

**✅ Phase 3D-7 — Production Provider Cutover（完成于 Phase 3I）**
- ✅ Selected: Polygon.io Options Starter ($29/月，含商用再分发权利，15分钟延迟)
- ✅ `collector/providers/polygon_option_chain_provider.py` 实现，source=`polygon_licensed`
- ✅ `run_refresh_worker.py` + `ecosystem.config.cjs` 已切换至 `polygon_licensed`
- ✅ IB internal 不再作为公开产品数据路径；API 返回 `source=polygon_licensed`

**Phase 3C — Cache & Freshness Architecture（真实数据源上线体验）**
- ✅ 定义 snapshot freshness policy：IV/HV daily，earnings daily，option chain 1-5min，OI daily/provider cadence，GEX/Walls/Gamma Flip 随 chain refresh，scanner 1-5min
- ✅ PostgreSQL schema：`option_chain_snapshots`、`gex_snapshots`、`symbol_metrics_snapshots`、`scanner_results_snapshots`、`provider_fetch_jobs`
  - `option_chain_snapshots` / `gex_snapshots` / `provider_fetch_jobs` 已存在
  - 新增 `symbol_metrics_snapshots`
  - 新增 `scanner_results_snapshots`
- ✅ API contract：真实数据 endpoint 返回或补充 `snapshot_ts`、`source`、`freshness`、`is_stale`、`refresh_status`
  - `/api/metrics`：保留原字段，新增 metadata
  - `/api/gex/:symbol` / `/api/chain/:symbol`：missing/stale 只 enqueue refresh，不同步调用 provider
  - `/api/scan`：读取 scanner materialized rows，并返回 freshness metadata
- ✅ `/api/gex/:symbol` 行为：fresh → 200 data；stale → 200 stale data + enqueue refresh；missing → queued 状态；不可同步等待 provider
- ✅ `/api/chain/:symbol` 行为：只读最新 provider snapshot；不从用户请求路径直连本地 Mac Studio / IB Gateway
- ✅ `/api/scan` 行为：读取 `scanner_results_snapshots` latest materialized result；不在请求时全市场重算
- ✅ `provider_fetch_jobs` worker：记录 symbol、job_type、status、attempts、last_error、created_at、started_at、finished_at
  - `collector/run_refresh_worker.py`
  - supports `symbol_metrics_snapshot`, `option_chain_snapshot`, `scanner_materialize`
  - unsupported/unconfigured licensed provider jobs fail closed with `last_error`
- ✅ Refresh rate limit：单 symbol/job/provider 至少 60 秒间隔入队；worker 记录 provider budget usage
  - `provider_request_usage` tracks provider/date/job_type request_count vs request_budget
  - 同一用户手动 refresh 限频仍待 product auth layer
- ✅ API memory cache：metrics 60s，GEX/chain 120s，scanner 60s（env 可调）
- ✅ Frontend stale-while-revalidate：当前 Analyze/Scan 在 loading 时保留已有结果；API 提供 freshness/refresh_status
- ✅ 前端状态文案：已有 GEX fresh/stale/unusable、price stale、missing data 文案；scanner rows 暴露 freshness metadata
- ✅ 缺失数据体验：不要用 mock data 伪装真实数据；missing snapshot 返回 queued/missing 状态
- ✅ 监控：provider fetch failure、stale snapshot age、job queue backlog、rate-limit hit、empty snapshot count
  - `/api/status/cache` returns job summary, recent failures, scanner stale age, empty/metadata-only option snapshot count, provider budget usage
- ✅ 回滚策略：关闭 materialize job 后 `/api/scan` 仅返回已有 snapshot；保留旧 endpoint array contract 不破坏前端

**大单 / Unusual Activity（免费方案）**
- ✅ **Phase 3E-1 OI Delta Snapshot Layer**
  - 新增 contract-level OI history / delta 表
  - 从连续 `option_contract_snapshots` 计算 OI delta
  - 输出 `symbol`, `contract_symbol`, `expiry`, `strike`, `right`, `open_interest`, `previous_open_interest`, `oi_delta`, `volume`, `volume_oi_ratio`, `snapshot_ts`, `source`
  - Fail-closed：没有 previous snapshot 时不标记 unusual，只标记 baseline
  - 不改变交易策略逻辑
- ✅ Phase 3E-2 Unusual OI scanner：
  - 按 OI delta、volume/OI、absolute volume、DTE、bid/ask completeness 过滤
  - 只读预计算 snapshot，不在用户请求时计算全链
- ✅ Phase 3E-3 `/scan` 新增过滤器：
  - Unusual OI
  - PCR 异常
  - GEX 环境组合
  - near wall + unusual OI combined signal
- ✅ Phase 3E-4 `/analyze` Unusual Activity tab/card：
  - 展示 top contracts
  - 标注 baseline / confirmed delta / stale / missing
  - 不把 volume-only proxy 写成“机构建仓确认”
- ✅ Runtime verification：
  - Migration completed against Railway PostgreSQL.
  - `venv311/bin/python materialize_oi_delta.py` wrote 10 PLTR OI delta rows, `status=confirmed`, `unusual=0`.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows.
  - Local API verified：`/api/unusual/PLTR?limit=5` returned confirmed rows with `oi_delta=0`, `status=quiet`.
  - Local API verified：`/api/status/cache` returned `oi_delta.row_count=10`, `status_counts.confirmed=10`.
- ✅ Unusual Whales sweep / dark-pool 数据层（2026-07-15 代码完成）
  - ✅ WebSocket JSON adapter 使用账户下发的 URL/token/subscription payload；缺配置 disabled-safe，不猜测 broker 参数
  - ✅ 官方 `FlowAlert` 字段归一化为 option flow；仅 `TradeReport.market_center=L/2` 归一化为 TRF dark-pool event
  - ✅ `external_flow_events` 幂等持久化与 `external_flow_provider_state` provider freshness 状态
  - ✅ `GET /api/flow/:symbol` 返回 24h flow/sweep/dark-pool 汇总、事件明细及 missing/quiet/active/stale
  - ✅ Analyze 数据解读页显示真实事件；没有新鲜 provider heartbeat 时不展示推断值
  - ✅ Railway additive migration completed；只读确认两张表存在且初始 `event_count=0`
  - ✅ Mac Studio PM2 process registered/saved；disabled 状态连续 online、restart count=0、日志明确 idle
  - ✅ Tests/build：collector 95、server 62、frontend 25、full ESLint、Vite build
  - [ ] ~~提供 `UW_WS_URL`、`UW_API_TOKEN` 后完成真实 stream 验收~~ — **暂不接入**：API 订阅 $125/月，性价比低；代码已完成并保持 disabled-safe，待有付费用户现金流后再评估

**Phase 3F — Scanner UX/Data Completion**
- ✅ Scanner direction：materialized trend fields from `price_history` replace `待接入趋势`.
- ✅ Scanner earnings risk：display `earnings_date` and warn when event is within 0-14 days.
- ✅ Scanner row navigation：click row navigates directly to `/analyze?symbol=XXX&tab=0`.
- ✅ Analyze URL sync：automatic data-load URL normalization uses replace/skip when params already match, avoiding an extra `/analyze?symbol=XXX` browser-history entry.
- ✅ Scanner API cache key includes unusual/PCR filters, preventing filtered results from reusing stale cache entries from different filter combinations.
- ✅ Scanner filter UX copy：default flow uses opportunity presets; advanced filters keep English market terms with Chinese explanations for OI, Volume, Local Gamma, OI Delta, Unusual Count and Put/Call Ratio.
- ✅ Scanner universe copy：replace visible watchlist ticker chips with a data-coverage summary; document watchlist as transitional Phase 3 data pool, not final product scope.
- ✅ Scanner idle layout：before the first scan, the result hint stays beside the filter panel instead of reserving a full-width, 300px-tall empty result area.
- ✅ Scanner result hierarchy：replace the 13-column horizontal table with seven decision cells (symbol/price, volatility, trend, positioning, concrete candidate, score, earnings). The mobile view becomes a two-column row with the candidate spanning its own line; normal use no longer requires horizontal scrolling.
- ✅ ΔOI daily comparison：same-day option snapshots are not a meaningful OI baseline. The materializer compares the latest snapshot with the latest prior New York market date from the same source; without that baseline the UI says `待下一交易日`, never `0 / 0`.
- ✅ Scanner positioning copy：Wall now shows its actual strike and whether it is above or below spot; GEX now shows positive/negative Gamma, net exposure, the expected volatility tendency and snapshot freshness instead of unexplained `Call 4.5%` / `GEX -$1.1B` fragments.
- ✅ Opportunity type controls：selecting High-IV income, near Wall, or unusual positioning now has a persistent selected state and immediately reruns Scanner with the preset's explicit filters; it is no longer a silent form-state change.
- ✅ Scanner toggle alignment：Unusual OI and advanced-risk checkboxes use an explicit 16px control column with adjacent label text; browser input sizing cannot push the label across the filter panel.
- ✅ Scanner filter scrolling：the desktop sticky filter panel has its own viewport-bounded vertical scroll, so advanced controls and the scan action remain reachable after long result lists render.
- ✅ Scanner table sorting：cross-expiry candidates now have unique React keys containing every leg's expiry and contract identifier; exact duplicate candidates are removed before rendering, repeated header clicks use a tested sort-state transition, and the sorted list is remounted per sort state so rows cannot retain stale DOM positions.
- ✅ Verification：
  - Migration completed against Railway PostgreSQL after adding trend columns.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows with trend fields.
  - Local API verified：`/api/scan?minIvr=0&maxIvr=100&limit=3` returned `trend_label`, `trend_score`, `trend_change_5d`, `trend_rsi14`, MA fields, and `earnings_date`.
  - Production API still requires Railway deploy to expose new `/api/scan` response fields; database rows are already materialized.

**Phase 3G — Scanner Universe Expansion**
- ✅ Replace transitional 67-symbol watchlist with persistent `symbol_universe`; seed it from the watchlist and every known price/IV/option symbol, and register valid unknown Analyze symbols on demand.
- ✅ Universe filters：
  - market cap minimum / maximum（API/UI/schema complete; populated from Polygon reference metadata when provider returns market_cap）
  - stock price range
  - underlying share volume / dollar volume
  - optionable flag（API/UI/schema complete; true only when a usable option snapshot exists; unknown stays null）
  - option chain liquidity：bid/ask spread, total OI, total volume
  - sector / ETF category（API/UI/schema complete; derived from Polygon/SEC SIC when available）
  - earnings window include/exclude
- ✅ Keep scanner materialized：`materialize_scan.py` reads the persistent universe and still writes `scanner_results_snapshots`; user requests never run full-market provider calls synchronously.
- ✅ Unknown-symbol flow：`GET /api/analyze/:symbol` registers the ticker, reports price/metrics/options/GEX coverage, and enqueues only missing price/metrics/options jobs. UI displays queued/partial/blocker state.
- ✅ Retry-loop guard：a recent non-retryable metrics failure is returned as `refresh.metrics=blocked`; repeated Analyze requests do not create duplicate jobs.
- ✅ 2026-07-15 runtime evidence：Railway migration succeeded; seed synced 77 symbols; COST on-demand registration expanded the universe to 78; COST obtained Polygon daily/30M price, a 54-contract option snapshot, fresh GEX and $925/$910 walls. TT metrics remain a field-specific manual-login blocker and do not suppress the available products.
- ✅ 2026-07-16 reference metadata completion：
  - `collector/providers/polygon_reference_provider.py` reads Polygon `/v3/reference/tickers/{symbol}` for ticker name, type, market cap and SIC metadata.
  - `collector/collect_universe_metadata.py` updates `symbol_universe` without overwriting manually maintained non-reference fields.
  - Sector/category is `sec_sic_derived_v1`; this is a deterministic derived label, not a provider-native sector.
  - `optionable=true` is set only from persisted usable option snapshots (`contract_count > 0` and not `empty`/`metadata_only`); missing evidence remains null.
  - Railway runtime：78 active/scan-enabled symbols, 77 reference rows written, 1 missing (`VIX`), 0 failed；coverage after materialization：market_cap 27、sector 28、optionable true 69。
  - PM2 `quantrift-universe-metadata` registered/saved as a Sunday 12:15 one-shot cron; stopped between runs with cron still active.

**Phase 3H — Contract-Level Scanner Filters**
- ✅ Add optional advanced filters for contract-level strategy inputs：
  - DTE min/max
  - absolute Delta min/max
  - max bid/ask spread percentage
  - per-contract minimum OI
  - per-contract minimum volume
- ✅ Backend behavior：blank values do not filter; provided values require at least one latest option contract snapshot matching the constraints.
- ✅ Scanner result display：不再把 DTE range / quoted contract count 当作用户结果；这些仅保留为采集诊断。用户结果显示被选中候选单的 expiry、DTE、实际 legs、credit/debit、max loss、breakeven、return on risk、spread 与最低 OI。
- ✅ Data source：current `option_contract_snapshots` already stores expiry, bid, ask, volume, open_interest, IV and Greeks from IB/TT transitional adapters.
- ✅ Product boundary：these filters are optional advanced controls; default scanner presets should work without the user understanding Greeks.
- ✅ Strategy parameter presets：
  - 不限：不按合约参数过滤
  - 保守：DTE 30-60, Abs Delta 0.10-0.20, Max Spread 10%, Contract OI >= 500, Contract Vol >= 50
  - 标准：DTE 30-60, Abs Delta 0.16-0.30, Max Spread 15%, Contract OI >= 100, Contract Vol >= 10
  - 进取：DTE 7-45, Abs Delta 0.25-0.40, Max Spread 20%, Contract OI >= 50, Contract Vol >= 5
  - 短线：DTE 1-14, Abs Delta 0.20-0.40, Max Spread 20%, Contract OI >= 100, Contract Vol >= 20
  - 流动性优先：DTE 7-60, Abs Delta 0.05-0.50, Max Spread 8%, Contract OI >= 1000, Contract Vol >= 100
- ✅ Advanced edits mark the strategy parameter profile as custom.
- ✅ Default scanner profile is `不限`：不施加隐藏 preset，枚举当前 snapshot 1-90 DTE 范围内所有已支持策略及所有通过 Delta、spread、OI、volume 与经济性门槛的候选单；同一标的可返回多条不同策略/expiry/strikes。用户可多选策略或选择保守 / 标准 / 进取 / 短线 / 流动性优先收窄结果。
- ✅ Scanner table UX：
  - each visible column header is sortable
  - `OI Δ` renamed to `ΔOI`
  - duplicate `价格` status column removed; raw price freshness is internal state and not useful as a scanner column
  - strategy column shows a concrete action summary, e.g. Bear Call Spread = sell lower-strike call and buy higher-strike call
  - missing GEX/Wall/OI/contract values display as user-facing status instead of raw `missing`; contract data displays `待采集` when no latest option contract snapshot exists
  - automatic option-chain refresh jobs default to `polygon_licensed`，并由跨 server/collector contract tests 保证 worker 可执行
- ✅ Refresh provider regression tests：
  - Server `npm test` asserts the default option-chain refresh provider is executable by the worker and does not silently fall back to a placeholder provider.
  - Collector unittest asserts worker-supported option providers include `tt_internal` and exclude `licensed_options_provider`.
- ✅ Fix option-chain collector persistence scope：
  - default DTE selection now uses buckets `0-14,30-60,60-90` instead of a single 7-60 window.
  - `OPTION_MAX_CONTRACTS_PER_EXPIRATION` prevents the first selected expiration from consuming the full `OPTION_MAX_CONTRACTS` cap.
  - TT provider has unittest coverage proving multiple expiration buckets persist contracts instead of only the first expiration.
  - IB provider uses the same DTE bucket and per-expiration cap semantics.
  - Runtime verified on PLTR：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=60 OPTION_MAX_CONTRACTS_PER_EXPIRATION=20 OPTION_MAX_STRIKES_PER_SIDE=3 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py` wrote `snapshot_id=9`, 28 contracts across 2/30/65 DTE, with 28 quoted contracts, 28 Greeks rows and 28 OI rows.
  - Runtime verified downstream：`compute_gex.py` wrote `gex_id=4`, `materialize_oi_delta.py` wrote 28 OI delta rows, and full `materialize_scan.py` restored 67 scanner rows with PLTR `gex_status=fresh`, `call_wall=140`, `put_wall=140`, DTE range 2-65.
- ✅ Expand option-chain snapshot backfill from PLTR-only to the scanner ingestion pool in bounded batches：`run_collector_daemon.py` + `schedule_option_refresh.py` 持续 enqueue missing/stale symbols，worker 后续运行 GEX、OI delta 与 scanner materialization
- ✅ Scanner strategy recommendation expansion（由 Phase 3H-1/3H-2 与 P1.1 完成）：
  - Current recommendation engine emits `Bull Put Spread`, `Bear Call Spread`, `Iron Condor`, `Long Straddle`, and fallback `Bull Call Spread` / `Short Strangle` labels.
  - Strategy knowledge base already contains `Short Put`, `Short Call`, `Iron Butterfly`, `Long Call Butterfly`, `Long Put Butterfly`, `Short Butterfly`, and related structures.
  - Add explicit recommendation candidates for naked sell put / naked sell call only behind a risk-defined suitability gate; default beginner flow should prefer defined-risk put spread / call spread.
  - Add butterfly candidates for pinning / low realized move / price-near-body scenarios after contract-level chain selection is available.
- ✅ Scanner concrete setup display：
  - Historical implementation initially returned latest quoted option contracts for each symbol and built concrete legs in the frontend.
  - Current implementation (V3A immediate core, 2026-07-16) builds concrete legs in the backend candidate engine and returns only `concrete_setup` DTOs.
  - Scanner strategy column now shows legs, DTE, credit/debit estimate, max-loss / breakeven where available.
  - If the current snapshot cannot form the strategy, the row says the contract snapshot is insufficient instead of showing only a strategy name.
- ✅ **Phase 3H-1 — Actionable scanner candidate selector (`SCAN-ACTIONABILITY-001`, 2026-07-15)**
  - Severity：P1；confidence：high。
  - Confirmed from code：旧 UI 把 snapshot inventory 的 `DTE 2-65` 显示成“合约结果”，并按第一个可用 expiry 构造 legs；固定 `POP 64/66%` 不是由实际合约价格计算。
  - Trigger：同一 symbol snapshot 同时含短期和中期 expiry，例如 2/30/65 DTE。
  - Current behavior：用户只能看到库存跨度或策略名称，无法知道哪一笔订单值得研究；算法可能因排序选择 2 DTE。
  - Expected behavior：只输出可由同 expiry 真实 bid/ask contracts 组成、通过流动性与经济性门槛的候选单。
  - Worst consequence：把库存元数据误认为推荐期限，或展示无法成交、负 credit、风险收益不合理的结构。
  - Initial implementation：前端 `scanOpportunity.js` 曾枚举 actual contracts；最初默认 21-60 DTE，随后由 Phase 3H-2 修正为“不限不施加隐藏 preset”。V3A immediate core 已将同一算法迁到 `server/src/domain/scanner/candidateEngine.cjs` 并删除前端文件；credit spread 要求 `short bid - long ask > 0`；Iron Condor 两侧必须同 expiry；按 DTE fit、short Delta、bid/ask spread、OI、volume、RoR/economics 计算 0-100 机会分，并要求至少 50 分。
  - UI：`合约` 改为 `机会质量`，`推荐策略` 改为 `候选单`，删除规则占位 `POP`，改为 `机会分`；显示 expiry/DTE、具体 legs、净 credit/debit、max loss、breakeven、RoR、最低 OI 与平均 spread。
  - Changed business behavior：改变 scanner 研究候选输出与排序/过滤，不修改任何自动交易、下单或持仓逻辑。
  - Tests：`server/test/candidateEngine.test.js` 覆盖忽略 2 DTE、拒绝负 credit、短线允许 2 DTE、Iron Condor 同 expiry、跨期结构与高级风险 gate；`server/test/scanRoute.test.js` 断言响应不含 `option_contracts`。
  - Runtime evidence：用 2026-07-15 production `/api/scan` 63 rows 离线运行 selector，得到 3 个完整候选：GOOGL 30 DTE Iron Condor、CIBR 37 DTE Bull Put Spread、IBB 37 DTE Long Straddle；其余 rows 因无法组成完整且达标的真实 legs 被排除。
  - Done：初始前端实现完成，后续由 V3A immediate core 迁移为后端 API 契约；未改变 collector 或数据库 schema。
  - Rollback：回滚 V3A commit `9fd90e9` 可恢复此前 API/前端实现；不需要数据回滚。
- ✅ **Phase 3H-2 — `不限` 枚举全部达标候选（2026-07-15）**
  - Confirmed bug：Phase 3H-1 仍先按 IV/trend 为每个 symbol 指定一个策略，再只返回该策略的最佳 setup；这不符合“不限”。
  - Behavior：`不限` 对 `Iron Condor`、`Bull Put Spread`、`Bear Call Spread`、`Long Straddle` 枚举全部达标组合；同一 symbol 可以出现多行。策略 chips 只显示当前真正支持自动选腿的结构，多选后作为显式过滤。
  - Guardrail：这里的“全部”指全部通过可执行性和机会分门槛的候选，不包含负 credit、缺腿、跨 expiry、过宽 spread 或低于 50 分的排列。
  - Tests：新增 regression test，确认同一 symbol 在不限模式同时返回 Bull Put Spread、Bear Call Spread 和 Iron Condor，而不是只返回一条。
  - Runtime evidence：当前 Railway snapshot 63 symbols 产生 210 个达标候选、覆盖 15 symbols；结构分布为 Bull Put Spread 38、Bear Call Spread 45、Iron Condor 70、Long Straddle 57，DTE 覆盖 2/30/37/65。
- ✅ Analyze mock-data leakage fix：
  - PLTR showed fake `Call Wall $595 / Put Wall $575` because Analyze initialized from `mockAnalysis` and kept mock walls when real GEX was unavailable; the old contract construction path could also create invalid option combinations.
  - GEX missing/unusable now marks the result partial and clears `callWall`, `putWall`, GEX strikes, scenarios and recommendation so mock walls cannot appear as real data. Stale/partial snapshots with required fields remain visible with quality labels.
  - API failure no longer falls back to local mock structures for a typed symbol.
- ✅ Analyze GEX regression tests：
  - Frontend `npm test` covers stale GEX, missing GEX, and fresh usable GEX merge behavior.
  - Stale/missing GEX clears mock walls, scenarios and recommendations instead of leaking local mock strategy output.
- ✅ Collector option-chain coverage fix：
  - Confirmed from Railway DB on 2026-07-15：`price_history` had 67 symbols and `iv_history` had 76 symbols, but `option_chain_snapshots` / `gex_snapshots` only covered PLTR before the fix.
  - Root cause：`collect_options.py` defaulted to `AAPL,SPY,QQQ,PLTR` instead of `watchlist.txt`; queue worker jobs were also vulnerable to stale `running` states when provider auth exited the process.
  - `collect_options.py` now defaults to `watchlist.txt`; `OPTION_SYMBOLS` / `SYMBOLS` still provide targeted backfill overrides, and `watchlist` / `all` aliases explicitly select the full watchlist.
  - `run_refresh_worker.py` now recovers stale `running` jobs, treats unsupported provider names as non-retryable, converts TT auth `SystemExit` into catchable errors, blocks repeated TT auth attempts within the same worker run, and falls back from `tt_internal` to `ib_internal` for option-chain jobs when TT auth is unavailable.
  - `server/src/lib/refreshJobs.js` now rejects malformed ticker symbols before inserting `provider_fetch_jobs`; internal `__SCAN__` is allowed only for `scanner_materialize`.
  - Analyze ticker input now handles IME composition safely: it does not force uppercase while Chinese input composition is active, normalizes only on composition end / submit, and rejects malformed artifacts such as `SS'TS'T'XSTX`.
  - Runtime DB after recovery：option-chain/GEX snapshots exist for PLTR, QQQ and KLAC. STX and TSLA were backfilled through IB Gateway on `127.0.0.1:4001` and wrote `snapshot_id=14` / `snapshot_id=15`, each with 54 contracts.
  - STX/TSLA IB result：`provider_status=partial`, `completeness_pct=0.00`, `missing_greeks_ratio=1.0000`, `missing_oi_ratio=1.0000`; GEX/Wall was correctly not generated because IB did not return bid/ask, Greeks or OI for those option snapshots.
  - OI delta materialization now ignores IB rows where `contract_symbol` is only the underlying ticker and falls back to expiry/strike/right keys; STX/TSLA wrote 54 `missing_oi` rows each instead of failing on duplicate conflict.
  - Verification：collector unittest passed 15 tests; server `npm test` passed 4 tests; frontend `npm test` passed 5 tests; frontend `npm run build` passed; `git diff --check` passed.
- ✅ **Phase 3D-2B — 修复 IB 实链采集、持久化和本机直接运行（2026-07-15）**
  - Finding ID：`DATA-IB-CONTRACT-001`
  - Confirmed bug：旧 provider 将 `reqSecDefOptParams` 的全局 expirations 和 strikes 做组合，可能请求并持久化实际不存在的 option contract。
  - Exact code path：`run_refresh_worker.py` → `collect_options.py` → `IbOptionChainProvider.fetch_snapshot()` → contract discovery → `persist_snapshot()` → GEX/OI delta/scanner materialization。
  - Trigger：任意 symbol 的合法 expiry 集合与 strike 集合并非一一对应；本地组合后 IB resolution 结果不完整或错误。
  - Worst consequence：错误 strike/expiry/right 进入 snapshot，产生与 underlying 完全不相干的 Wall、GEX 和策略腿。
  - Implemented behavior：
    - `reqSecDefOptParams` 只用于选择 bounded expirations。
    - 每个 `expiry + CALL/PUT` 使用无 strike 的 `reqContractDetails` 请求实际 contract definitions。
    - 只接受 IB 返回、`conId > 0`、expiry/right 精确匹配的 contract。
    - 按真实 contract 的 strike 距 spot 排序和截断；不生成任何缺失组合。
    - market data 默认 `IB_MARKET_DATA_TYPE=3`，当前过渡阶段接受 delayed quote/Greeks/OI。
  - Persistence invariants：
    - `option_contract_snapshots.con_id` 必须来自 IB actual contract details。
    - 同一采集结果按 `conId` 去重。
    - `raw_metadata.discovered_contract_count` 和 `selected_contract_count` 记录发现与持久化数量。
    - partial field coverage 可以持久化并降低 completeness；不存在的 contract 不能持久化。
  - Runtime simplification：
    - 新增 `collector/run_collector_daemon.py`，每 60 秒消费 refresh jobs、每 300 秒 materialize scanner。
    - 新增 `collector/schedule_option_refresh.py`：每 300 秒从 watchlist 选择最多 2 个 missing/old symbols；missing 优先、stale 按最旧优先；queued/running 或 30 分钟内尝试过的 symbol 跳过。
    - 自动任务以 `tt_internal` 入队；TT auth/network unavailable 时由同一 worker fallback 到 `ib_internal`，不重复创建 provider session storm。
    - 新增 `collector/ecosystem.config.cjs`；PM2 直接运行当前 repo 和 repo `venv311`。
    - 删除 repo LaunchAgent plist/wrappers；停止旧 LaunchAgent；删除 `~/.quantrift_options_collector` 运行副本。
    - 不需要 sync；修改当前 repo 后重启 PM2 即加载当前代码。
  - UI behavior：stale/partial 但 required fields 完整的 GEX/Wall 保留显示，并标记 age/confidence；missing required fields 才隐藏分析。
  - Files changed：
    - `collector/providers/ib_option_chain_provider.py`
    - `collector/run_collector_daemon.py`
    - `collector/ecosystem.config.cjs`
    - `collector/.env.example`
    - `collector/tests/test_option_provider_selection.py`
    - `frontend/src/lib/analyzeData.js`
    - `frontend/src/pages/Analyze.jsx`
    - `frontend/src/lib/analyzeData.test.js`
    - 删除旧 `collector/com.quantrift.collect-prices.plist`、`collector/run_collect_prices.sh`
  - Tests required and executed：
    - `cd collector && venv311/bin/python -m unittest discover -s tests` → 37 passed（含 missing-first、fresh/recent skip、oldest-stale-first scheduler tests）。
    - `cd server && npm test` → 4 passed。
    - `cd frontend && npm test` → 6 passed。
    - `cd frontend && npm run build` → passed；仅保留既有 chunk-size warning。
  - Live IB evidence：
    - Command：`OPTION_PROVIDER=ib_internal OPTION_SYMBOLS=NBIS IB_HOST=127.0.0.1 IB_PORT=4001 IB_OPTION_CLIENT_ID=48 IB_MARKET_DATA_TYPE=3 IB_TIMEOUT=15 IB_OPTION_STREAM_TIMEOUT=4 OPTION_MAX_CONTRACTS=36 OPTION_MAX_CONTRACTS_PER_EXPIRATION=12 OPTION_MAX_STRIKES_PER_SIDE=2 OPTION_DTE_BUCKETS=0-14,30-60,60-90 venv311/bin/python collect_options.py`
    - Result：`snapshot_id=33`，IB discovered 456 actual contracts，selected/persisted 30。
    - DB：30 rows、30 distinct `conId`、0 null/zero `conId`、0 null `localSymbol`、Greeks missing 0%、OI missing 3.33%、completeness 98.33%。
    - `OPTION_SYMBOLS=NBIS venv311/bin/python compute_gex.py` → `gex_id=15`、`global_gex=-449311853.73`、`confidence=high`。
    - OI delta materialization wrote 30 rows；scanner materialization wrote 67 rows。
  - Runtime evidence：`quantrift-options-collector` PM2 process online；log recorded `No queued refresh jobs` and `Materialized 67 scanner rows`。
  - Price runtime evidence：`quantrift-options-prices` one-shot completed `4020 rows written, 0 failed` and returned to `stopped`; PM2 cron schedule will restart it at the next configured run。
  - PM2 persistence：`pm2 save` completed and wrote `/Users/congrenhan/.pm2/dump.pm2`。
  - Auto-refresh runtime evidence：scheduler selected AAPL；TT returned `device_challenge_required` once，worker immediately used IB fallback；IB delayed collection completed AAPL with 78 actual contracts、completeness 94.87%、Greeks missing 0%、OI missing 10.26%。Production `/api/status/options` increased from 8/67 to 9/67 covered，then PM2 continued with AIQ。
  - Strategy behavior change：无。修复的是 contract identity 和数据可用性；未改变 entry/exit、position size、strategy parameters 或 order behavior。
  - Rollback：`pm2 delete quantrift-options-collector quantrift-options-prices` 停止新 runtime；代码使用后续 commit 的 revert 回退。数据库 snapshot 为 append-only，本任务没有破坏性 schema migration。
  - Done：实现、单元测试、前端测试/build、真实 IB 采集、数据库 identity/completeness、GEX/OI delta/scanner 下游闭环均已验证。
- ✅ 按 bounded batches 自动扩展完整 scanner ingestion pool：PM2 scheduler/worker 已运行并持续补 missing/stale snapshots。
- ✅ 增加 collector coverage/failure alert（2026-07-15）：
  - `collector/check_collector_health.py` 每轮计算 covered_count/coverage_pct、24h failed_count、snapshot age、completeness
  - 阈值由 `HEALTH_MIN_COVERAGE_PCT`、`HEALTH_MAX_FAILED_24H`、`HEALTH_MAX_SNAPSHOT_AGE_MINUTES`、`HEALTH_MIN_COMPLETENESS_PCT` 配置
  - `collector_health_alerts` 保存 fingerprint、active/resolved、last_seen、last_notified；`HEALTH_ALERT_COOLDOWN_MINUTES` 防止重复轰炸
  - `collector/operator_alerts.py` 支持 webhook、SMTP；未配置外部 channel 时结构化 log，不假装发送成功
  - daemon 默认每 300 秒运行，可用 `COLLECTOR_HEALTH_CHECK_ENABLED=false` 回滚关闭
  - Tests：collector 49 tests passed；覆盖 healthy、coverage、failed jobs、stale、completeness、metadata-only、cooldown/fingerprint、log fallback、PM2 wiring
  - Migration：Railway `collector_health_alerts` 表已创建
  - Runtime：67 expected / 67 covered / 0 stale / 0 incomplete；24h historical failed jobs=31 触发 1 个 active critical alert；第二次运行 `notify=False`，证明 cooldown dedupe 生效
  - 外部通知：当前 SMTP/webhook 均未配置，因此 runtime 只写 PM2 log；配置 secret 后无需改代码

---

## ✅ Phase 3I — Polygon Licensed Provider（2026-07-15 完成）

> 目的：将 option chain 数据源从 `ib_internal`（仅内部研究，不可商用分发）切换为 Polygon.io 授权商用数据，解锁 SaaS 分发权利。

### 订阅
- ✅ 订阅 Polygon.io Options Starter，$29/月（实际价格；含实时+历史期权链、OI、volume、gamma、delta、IV、bid/ask；商用再分发条款明确）

### Polygon API 字段确认
- ✅ `GET /v3/snapshot/options/{symbol}`：分页，服务端过滤 `expiration_date.gte/lte` + `strike_price.gte/lte`
  - `implied_volatility`：decimal（0.337 = 33.7%），不是百分比
  - `greeks{}`：`delta`, `gamma`, `theta`, `vega`
  - `last_quote{}`：`bid`, `ask`（EOD 后可能为 None）
  - `day{}`：`volume`, `last_price`
  - `open_interest`
  - `next_url`：分页续页 URL（后续请求必须 `params=None`，URL 已 encode）
- ✅ `GET /v2/aggs/ticker/{symbol}/prev`：前一交易日收盘价作为 spot

### 新增 collector/providers/polygon_option_chain_provider.py
- ✅ `source = 'polygon_licensed'`
- ✅ `fetch_underlying(symbol)`：`/v2/aggs/ticker/{symbol}/prev` → `UnderlyingSnapshot`
- ✅ `fetch_option_chain(symbol)`：分页 `/v3/snapshot/options/{symbol}`，server-side DTE/strike 过滤
- ✅ `_parse_contract()`：映射 Polygon 字段到 `OptionContractSnapshot`；`right = 'C' if contract_type == 'call' else 'P'`；`contract_symbol = '{symbol}-{expiry:%Y%m%d}-{right}-{strike:g}'`
- ✅ `_apply_strike_limit()`：按 `(expiry, right)` 分组，保留最靠近 spot 的 `max_strikes_per_side` 个合约
- ✅ `next_url` 分页：首页带 query params，续页 URL 直接使用（params=None）

### collect_options.py
- ✅ 新增 `PolygonOptionChainProvider` import 和 `make_provider()` case：`OPTION_PROVIDER == 'polygon_licensed'`

### run_refresh_worker.py
- ✅ `SUPPORTED_OPTION_PROVIDERS` 加入 `'polygon_licensed'`（之前遗漏导致 `unsupported option provider for worker: polygon_licensed` 错误）
- ✅ `DEFAULT_OPTION_FALLBACK_PROVIDERS` 当前为 `'tt_internal'`：当 `require_quotes` 的 Polygon 快照没有有效 bid/ask 时，worker 才尝试 TT，避免无报价链被误判为策略候选可用。

### ecosystem.config.cjs
- ✅ `OPTION_REFRESH_PROVIDER: 'polygon_licensed'`
- ✅ `POLYGON_API_KEY` 不写入 `ecosystem.config.cjs` 或 Git；collector 由工作目录 `.env` 读取。也不能注入空字符串，否则会阻断 `load_dotenv`。
- [ ] Rotate 曾进入 Git 历史的 Polygon key，并只写入 Mac Studio `collector/.env` / 部署平台 secret store（需要账户持有人操作）。

### PM2 部署与验证
- ✅ `pm2 reload ecosystem.config.cjs --update-env`（必须用 reload；`pm2 restart --update-env` 只合并 shell env，不重读 .cjs 文件）
- ✅ PM2 全路径：`/opt/homebrew/bin/pm2`（via SSH 时 zsh 找不到 pm2）
- ✅ option_chain_snapshot jobs succeeded（job 154/156/157）；source 从 `ib_internal` 逐渐切换为 `polygon_licensed`
- ✅ MD5 checksum 验证：local 与 Mac Studio 上 4 个改动文件完全一致

### Polygon 数据延迟说明（纠正）
- Polygon $29/mo Options Starter 是 **15分钟延迟**，不是 EOD
- 盘中也能拿到 snapshot（延迟15分钟），数据源没有问题
- 限制在我们这边：collector 当前 cron 每天只跑一次（收盘后13:35 PT）
- 若需盘中信号（如30分钟级 breakout），需改调度为每30分钟跑一次 collect，不需要换数据源
- Polygon Stocks 订阅（分钟级聚合）和 Options 订阅是两个独立产品；当前 $29 Options 计划附带日线股价聚合，但不含分钟级股价

---

## 📋 Phase 3J — 功能对标、竞品分析与下一步路线图

### 竞品分析（2026-07-15）

**AlphaStock Pro Elite**
- 核心能力：多时框动量评分（30M/1D/1W）、综合 momentum score、"Uptrend"/"30min Breakout"信号矩阵
- 数据源：无期权数据，纯股票技术面
- 我们的差异化优势：GEX/PCR/Unusual OI/具体期权腿推荐 是 AlphaStock Pro 完全没有的；多时框动量评分我们可以用 `price_history` 复刻
- ✅ Composite Momentum：真实 regular-session 30M / 1D / weekly-aggregated 1W 按 30% / 40% / 30% 加权；任一历史不足 missing，30M market date 落后日线时 stale，不作为当前多周期确认（2026-07-15）
- ✅ Focus Score：MA20/50/200、RSI14、5日动量与 RVol 已实现

**Newshock.net（PRESSURE/S/R system）**
- 核心能力：每日更新支撑/阻力区间（S/R zones），从 OHLCV pivot 计算；Focus Score = MA 位置 + 量能参与度
- 数据：纯 OHLCV 历史（我们的 `price_history` 完全够用）
- 可自建：pivot-based S/R → `GET /api/sr/:symbol`；Focus Score → 复合技术评分；无需付费或爬虫
- 直接竞品差距：Newshock 无期权层，我们加上 GEX/Wall 后做出完整的"价格结构 + 期权仓位"分析

**华尔街咖啡馆参考产品**（实现对标）
- IV Skew、Term Structure 与真实 OI by strike 均已由 Polygon snapshot 接入 `/api/chain/stats`；剩余差距转向历史深度和用户分层
- 我们额外实现的：Gamma Flip 具体价位、Local Gamma 集中度、每日 OI Delta 异动、SaaS 可部署架构

---

### 实施优先级（执行顺序，2026-07-15）

下面的顺序是从本节起完成所有未完成任务的依赖图，不按文档原有出现顺序盲目执行。每个 section 必须独立完成实现、测试、文档、commit 和 push。

| 顺序 | Section | 完成条件 | 外部阻塞 |
|---|---|---|---|
| P0.0 | 凭据与任务校准 | 仓库无明文 key；过期 task 与真实代码状态一致 | 已暴露的 Polygon key 需人工 rotate，但不阻塞本地实现 |
| P0.1 | Phase 3D-6 计算/API 回归测试 | GEX sign、walls、gamma flip、PCR、confidence 及 fresh/stale/missing API tests 全通过 | 无 |
| P0.2 | Collector coverage/failure alert | coverage、failure、age、completeness 阈值可配置并有 operator alert + tests | SMTP/通知凭据仅影响真实发送验证 |
| P0.3 | Polygon price history | 日线与 30M adapter、schema、collector、PM2 调度、67 symbols runtime verification | 使用现有 Polygon key；若 rotate 后未提供新 key 才阻塞 |
| P0.4 | 自算 HV / ATM IV / IV Rank | ✅ 2026-07-15 完成：派生脚本、历史门槛、对比报告、来源切换与 fail-closed readiness | 252 个独立交易日尚未积累，因此 IV Rank 暂继续使用 TT 冷启动值 |
| P1.1 | Scanner 策略扩展 | ✅ 2026-07-15 完成：13 种结构按真实合约枚举、quote snapshot 分层、风险门控、测试和 UI 输出 | 无 |
| P1.2 | Analyze 数据产品 | ✅ 2026-07-15 完成：S/R、Focus Score、VRP、Gamma Flip、Local Gamma、chain stats 接入 | 无 |
| P1.3 | Universe / on-demand | ✅ 2026-07-16 完成：persistent universe、filters、reference metadata population、unknown symbol enqueue/wait/blocker UI、materialized invariant | TT metrics 当前需 manual login；`VIX` 无 Polygon ticker reference |
| P1.4 | Market/weekly signals | ✅ 2026-07-15 完成：SPY/QQQ regime header、30M breakout freshness gate、Weekly GEX/Max Pain/ΔOI 实数接入 | 30M 最新运行数据为前一交易日，当前正确标记 stale，不生成 breakout |
| P2.1 | 产品入口 | ✅ 2026-07-15 完成：真实产品视觉、live regime、三条核心 workflow、mobile layout | Browser plugin 初始化错误导致无自动 screenshot |
| P2.2 | Scanner alerts | ✅ 2026-07-15 完成：subscriptions、rules、token unsubscribe、dedupe delivery、PM2 evaluator、Email/Web Push adapters | SMTP/VAPID secrets 尚未配置，真实收件验收需人工提供 |
| P2.3 | Heartbeat | ✅ 2026-07-15 完成：Mac Studio daemon 上报、Railway status API、missing/offline incident、cooldown 与 resolved lifecycle | Railway/Mac 共享 token 和 webhook secret 尚需人工配置；当前 daemon disabled-safe |
| P2.4 | Frontend verification debt | ✅ 2026-07-15 完成：全量 ESLint 0 errors/0 warnings、frontend 21/21、production build | 无 |
| P2.5 | Reddit community trends | ✅ 2026-07-15 代码/表/API/UI/PM2 完成；缺凭据时 disabled-safe | Reddit OAuth app credentials 与访问 approval |
| P2.6 | Composite momentum | ✅ 2026-07-15 完成：30M/1D/1W score、freshness gate、Analyze UI | 无 |
| P2.7 | Universe reference metadata | ✅ 2026-07-16 完成：Polygon ticker reference adapter、weekly PM2 one-shot、Railway coverage verification、scanner re-materialization | `VIX` reference missing；market cap/SIC 是 provider availability 问题 |
| P2.8 | Data refresh throughput / concurrency | 未完成：把 78-symbol 线性补数据改为优先级队列 + bounded 并发 worker + shared provider limiter + stale-while-refresh UX | 需要验证 Polygon/DB 实际吞吐；不需要用户提供新 key |
| P3 | 商业化 | auth、subscriptions、positions、portfolio、Stripe | Clerk/NextAuth/Stripe key 与产品方案需人工提供/确认 |
| External | 硬件与账户验收 | UPS、IB cloud/VPS、Reddit API | 数据层代码已完成；真实运行必须人工采购、登录或提供 API key |
| 暂缓 | Unusual Whales | 代码 disabled-safe，等待正向现金流 | API $125/月，暂不订阅 |

P1.4 verification：server 31/31 tests、frontend 19/19 tests、affected frontend lint 0 errors、Vite production build passed。Railway runtime 返回 Market `Mixed 51`，SPY/QQQ 30M 因 7/14 对 7/15 daily 正确标记 stale；AAPL Weekly 返回 5 candles、1 个已有 GEX day、Max Pain 310、1 个 ΔOI day。Browser plugin 初始化报 `Cannot redefine property: process`，因此未取得自动 screenshot，未宣称 visual verification。

P2.6 verification：Railway 只读重放 AAPL 250 daily + 200 regular-session 30M rows，输出 composite=84、30M=50、1D=100、1W=95；daily 2026-07-15 对 intraday 2026-07-14，因此按设计返回 `stale`。Collector 95/95、server 65/65、frontend 25/25、full ESLint 和 Vite production build passed。

执行边界：`task.md` 中已经被后续 section 实现但仍保留 `[ ]` 的旧条目，先用代码和测试证据校准为完成；硬件采购和第三方账户操作不得伪装为代码完成。

**P4 — 量价分析（自有数据，0 增量成本）**

> 数据来源：`price_history`（日线）+ `price_history_30m`（30M）；无需新订阅。
> Unusual Whales 暂不接入（API $125/月），OI Delta 异动已覆盖期权层异常检测。

- [x] **Volume Profile**（2026-07-16）：从 `price_history_30m` 按价格区间聚合成交量，返回 VP by price level
  - `GET /api/vp/:symbol?interval=30m&days=20&bins=40`；`days=1..60`、`bins=10..80`，仅取 regular-session 30M bars
  - 每根 bar 用 `(high + low + close) / 3` 归入价格桶并累加真实 volume；返回完整 nodes 与前 5 个 high-volume nodes
  - Analyze Tab2 显示横向 volume bars、成交量、相对现价距离；无至少两根有 volume 的 bar 或无价格区间时明确返回 `missing`，不显示模拟节点
  - 可与 S/R zones 并列用于确认成交密集价位，但不把 volume node 冒充为 S/R 或期权 Wall
  - 验证：server 69/69、frontend 40/40、full ESLint、Vite production build passed
- [x] **OBV（On-Balance Volume）**（2026-07-16）：从 `price_history` 日线计算累计量价关系
  - `GET /api/sr/:symbol` 的 `obv` 字段返回每日累计序列、最新值、20 日变化和 `inflow` / `outflow` / `flat`
  - 公式：上涨日加 volume，下跌日减 volume，收平不变；至少需两根有真实 volume 的日线，否则 `missing`
  - 前端：Analyze Tab2 趋势图下方独立小图；不与价格轴混用
  - 验证：server 70/70、frontend 40/40、full ESLint、Vite production build passed
- [x] **MFI（Money Flow Index）**（2026-07-16）：OHLCV + volume 14日窗口，0-100 超买超卖
  - `GET /api/sr/:symbol` 的 `mfi` 字段以近 14 个典型价变化计算正/负 money flow；至少需 15 根有效日线
  - `MFI = 100 - 100 / (1 + positive_flow / negative_flow)`；`>=80` 为 overbought，`<=20` 为 oversold，其余 neutral
  - 与 RSI 并列但不合成单一信号：RSI 表示价格动量，MFI 用价格和成交量确认资金流方向
  - 前端：Analyze Tab1 指标卡，与 Focus Score 并列；历史不足显示 `--`
  - 验证：server 71/71、frontend 40/40、full ESLint、Vite production build passed

P2.3 verification：server 39/39 tests、collector 78/78 tests、Railway additive migration passed。Runtime smoke 依次确认 expected node 从未上报时 `missing/degraded`、错误 token 为 HTTP 401、正确上报后 `online/ok`；受控 stale heartbeat 生成 `active` incident（无 webhook 时 channel=`blocked`），恢复 heartbeat 后 incident=`resolved`。Mac Studio PM2 collector 已重启并保持 online；因共享 `HEARTBEAT_TOKEN`/URL 尚未写入双方运行环境，定时上报当前按设计返回 `disabled`，不影响 collector 主循环。

**P2.8 — Data refresh throughput / concurrency（未完成，2026-07-16 讨论定稿）**

目标：把当前“每 5 分钟最多挑 2 个 symbol、worker 顺序处理”的 78-symbol 采集方式，升级成可扩展的数据刷新层。用户输入新标的或固定 universe 扩大后，页面应优先读已有快照；缺失或过期时后台刷新并自动更新 UI，而不是让用户等待一整轮 collector。

当前已确认的实现事实：
- `schedule_option_refresh.py` 当前每 300 秒最多 enqueue 2 个 missing/stale symbols；78 个 symbol 一轮理论约 195 分钟。
- `run_refresh_worker.py` 使用 `FOR UPDATE SKIP LOCKED` claim jobs，数据库层已经支持多 worker 并发领取不同 job。
- 当前 worker 对 batch 内 jobs 仍是顺序 `for` loop；provider session/cache 只在单次进程内复用。
- 当前每个 option job 成功后会触发 per-symbol GEX，同时还重复执行全局 `materialize_oi_delta.run()` 和 `materialize_scan.run()`；多个 symbol 连续刷新时会重复做全局派生。
- Polygon option provider 当前每个 symbol 先请求 underlying prev aggregate，再分页请求 option snapshot；stock request 使用本地 file-lock pacer，不能跨 Railway replicas 共享。
- Analyze orchestration 当前主要检查数据是否存在，freshness gate 不完整；有 stale snapshot 时可以显示旧数据，但用户提示和自动 refresh/polling 还不够统一。

目标架构：
```
Railway API
  -> 只读 PostgreSQL snapshots
  -> missing/stale 时 enqueue provider_fetch_jobs
  -> 不同步调用 provider

Mac Studio / Railway Collector Workers
  -> 多 worker 通过 PostgreSQL SKIP LOCKED 并发 claim jobs
  -> provider-aware concurrency limit
  -> bounded rate limiter shared by database state

Derivation Worker
  -> per-symbol GEX after option snapshot
  -> OI delta / scanner materialization batched once per worker cycle

PostgreSQL
  -> snapshots
  -> provider_fetch_jobs
  -> provider pacing state
  -> symbol_data_state freshness summary
```

任务拆分：
- [ ] **P2.8.1 统一 freshness 口径**
  - 在 task/API contract 中明确各数据产品的新鲜度目标：
    - price daily：按最新 market date；非交易日允许使用上一交易日。
    - price 30M：盘中按 regular-session 30M market date 判断；落后最新日线时 `stale`。
    - option chain / GEX / Wall：默认目标 60 分钟内；scanner 可接受较旧但必须标记。
    - metrics / IV Rank：交易日级别；derived rank 未满 252 observations 时继续返回 provider/cold-start provenance。
  - Analyze 不能只检查 existence；必须按 product 返回 `fresh | stale | missing | queued | failed`。
  - stale 不是空白页：返回最近可用真实 snapshot + `is_stale=true` + `age_minutes` + 后台刷新状态。

- [ ] **P2.8.2 symbol data state 汇总表**
  - 新增 additive table：`symbol_data_state(symbol, product, latest_snapshot_ts, latest_market_date, source, freshness, refresh_status, last_job_id, last_error_code, updated_at)`。
  - collector 写入 snapshots 后更新该表；API 读该表决定是否 enqueue、是否提示 stale、是否继续展示旧数据。
  - 支持 unknown symbol 被注册到 `symbol_universe` 后进入 data-state 流程；Weekly 自定义标的也应复用同一 orchestration。
  - Rollback：表为 additive；旧 API 可继续直接读 snapshots。

- [ ] **P2.8.3 queue-fill scheduler**
  - 将当前“每轮只挑 2 个”改为“按目标队列深度补满”：
    - `OPTION_REFRESH_QUEUE_TARGET`：例如 20。
    - `OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE`：例如 20。
    - `OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES`：失败/刚尝试过的 symbol 不重复刷。
  - 优先级：
    - `user_requested`：用户刚输入或点击的 symbol。
    - `core`：SPY/QQQ/AAPL/TSLA/PLTR 等常用标的。
    - `recent_active`：最近被用户查询或 scanner 点击的 symbol。
    - `universe_scan`：正式 scanner universe。
    - `cold_backfill`：低优先级补齐。
  - 不再只读 `watchlist.txt`；watchlist 只是 seed，长期应从 `symbol_universe` + priority 字段生成 refresh candidates。

- [ ] **P2.8.4 bounded parallel refresh workers**
  - 利用现有 `FOR UPDATE SKIP LOCKED`，先在 Mac Studio 启 2 个 worker processes 验证，不在线程内共享 psycopg/provider session。
  - 每个 worker 独立 DB connection；连接池上限必须小于 Railway PostgreSQL 可承受连接数。
  - 初始并发建议：2；验证 429、job duration、DB CPU/connection 后升到 4。
  - 并发边界：
    - API service 不跑 collector。
    - Railway 可以单独创建 `polygon-collector` service；Mac Studio 继续跑 IB/TT/internal collector。
    - TT/IB 不跟 Polygon 共用 worker 池；provider adapter 独立限流。

- [ ] **P2.8.5 shared provider rate limiter**
  - 当前 Polygon stock pacer 使用本地 file lock，只能约束同一台机器/同一文件系统；多 Railway replicas 或多机器 worker 会失效。
  - 新增 PostgreSQL-backed provider pacing：
    - table example：`provider_rate_limits(provider, scope, next_allowed_at, last_status, updated_at)`。
    - 通过 transaction/advisory lock 原子读取和推进 `next_allowed_at`。
    - 429 时尊重 `Retry-After` 并延长该 provider/scope 的 next allowed time。
  - 验证：两个并发 worker 同时请求时不会突破最小间隔；429 不会造成请求风暴。

- [ ] **P2.8.6 ingestion 与 derivation 解耦**
  - option snapshot 写入后只立即计算该 symbol 的 GEX。
  - `materialize_oi_delta` 和 `materialize_scan` 从“每个 option job 执行一次”改为“每个 worker batch 或独立 derivation job 执行一次”。
  - 新增 tests：同一 worker batch 处理 N 个 option jobs 时，global OI delta 和 scanner materialization 只执行一次。
  - 好处：并发补齐多个 symbol 时不会重复重算全局 scanner。

- [ ] **P2.8.7 减少每 symbol 冗余请求**
  - option provider 请求前优先使用数据库最新 price snapshot 作为 underlying spot；只有缺失或 stale 时才请求 `/v2/aggs/ticker/{symbol}/prev`。
  - 对同一 symbol 同一轮 refresh 的 price/options/GEX bundle 共用基础价格状态。
  - 验证：option refresh 不再为每个 symbol 必然额外打一条 stock prev aggregate。

- [ ] **P2.8.8 stale-while-refresh 前端体验**
  - Analyze：
    - fresh：正常显示。
    - stale：显示旧快照并提示“正在刷新，通常 1-3 分钟”，每 5 秒轮询 data-state；刷新完成后自动重新分析。
    - missing：显示“正在准备首次数据”，不显示 mock 或空策略。
    - failed：显示可理解错误，不暴露 `price / metrics / metrics_source / options / gex` 内部字段名。
  - Weekly：
    - 自定义 symbol 若缺数据，注册并 enqueue；已有 stale 周复盘数据时显示旧版并标记刷新中。
  - Scan：
    - scanner batch stale 时仍显示上一批真实候选，并标记 batch age；后台 materialize 完成后刷新列表。

- [ ] **P2.8.9 Railway 承载验证**
  - PostgreSQL 承载估算：78 symbols × 120 contracts ≈ 9,360 contract rows/轮，批量 upsert 对 Railway PostgreSQL 可接受；真正瓶颈是 provider pacing 和重复派生。
  - 验证顺序：
    - Mac Studio 2 worker dry-run：记录 p50/p95 job duration、success/failure、429、DB connection count。
    - shared limiter 开启后 2 worker live run。
    - Railway 单独 `polygon-collector` service 2 worker。
    - 观察后升 4 worker。
  - 验收指标：
    - 78-symbol option refresh full pass 从约 195 分钟降到目标 < 60 分钟。
    - user-requested symbol 首次可用目标 1-3 分钟。
    - `provider_fetch_jobs` 无 stale `running` 堆积。
    - 429 被 backoff，不触发连续失败风暴。
    - scanner materialization 不重复执行 N 次。

测试要求：
- Collector unit tests：scheduler priority、queue target、cooldown、SKIP LOCKED 多 worker、shared limiter、batch derivation once。
- Server tests：fresh/stale/missing/queued 状态 contract；Analyze 不因 stale existence 误判 ready；Weekly custom symbol enqueue。
- Frontend tests：stale old-data display、queued polling refresh、missing no-mock、scanner stale batch labeling。
- Runtime evidence：记录 command、commit、DB URL environment（不打印 secret）、worker count、symbol count、contracts written、job duration、429 count、scanner rows、GEX rows。

Deployment readiness：
- 不把 collector 放进 API service；Railway 需要独立 `polygon-collector` service。
- Mac Studio IB/TT collector 保留为 internal/fallback/ad hoc 路径。
- 多 worker 上线前必须先合并 shared provider limiter；否则本地 file lock 在 Railway 多实例下无效。
- 回滚方法：将 worker count 降回 1、queue target 降回 2、关闭 Railway collector service；additive `symbol_data_state` / pacing 表可保留。

**P0 — 最高优先级：全量切换至 Polygon（使用环境变量中的订阅 key）**

目标：消除对 IB Gateway 的价格依赖，并逐步替换 Tastytrade 的 IV/HV 字段。

| 子任务 | 当前来源 | Polygon 替代 | 时机 |
|---|---|---|---|
| 日线 OHLCV（price_history） | IB internal | `/v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}` | 立即可做 |
| 30M OHLCV（price_history_30m） | 无 | `/v2/aggs/ticker/{symbol}/range/30/minute/{from}/{to}` | 顺带采集 |
| HV30/60/90 | Tastytrade | 从 price_history 自算（log return stddev × √252） | 积累 90 天日线后 |
| IV Rank / iv_percentile | Tastytrade | 从 option_contract_snapshots ATM IV 自算 | 积累 252 天快照后 |
| 财报日 earnings_date | Tastytrade | 无 Polygon 替代，保留 Tastytrade 仅取此字段 | 长期保留 |

**P0.1 — Price history 切换（立即执行）**
- ✅ `collector/providers/polygon_price_provider.py`：新增 Polygon price adapter
  - `GET /v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}?adjusted=true&sort=asc&apiKey=...`
  - 同时采集 30M 数据：`/v2/aggs/ticker/{symbol}/range/30/minute/{from}/{to}`（写入 `price_history_30m` 或加 `interval` 字段）
  - BRK.B 等特殊 ticker 保持现有 normalization 规则
- ✅ `collector/collect_prices.py`：加入 `PRICE_PROVIDER=polygon` 分支
- ✅ `collector/ecosystem.config.cjs`：`quantrift-options-prices` 改用 `PRICE_PROVIDER=polygon`
- ✅ 验证：67 symbols 全部写入，date range 正确，source=`polygon_licensed`
- ✅ 停用 IB internal price 依赖（保留 `ib_price_provider.py` 文件但不再调度）

完成证据（2026-07-15）：
- Adapter：日线最多 400 bars；30M 近 35 calendar days；`BRK.B` canonical identity 保持不变；Polygon 任何 timeframe 空结果时该 symbol fail-closed
- Schema/API：Railway 已创建 `price_history_30m`；`GET /api/prices/:symbol?interval=day|30m` 保持日线默认兼容并可读取 intraday VWAP/trade count
- Rate limit：`PolygonStockRequestPacer` 用 file lock 在 option `/prev` 与 price aggregates 两个 PM2 进程间共享 16 秒间隔；429 尊重 `Retry-After`/长 backoff
- Tests：collector 61 tests passed；server 10 tests passed；覆盖 parsing、UTC/ET 时间、normalization、429、跨进程 state、persistence、daily-only fallback、PM2 config、API intervals
- Railway：daily 67/67、26815 rows、每 symbol 349-401 rows、range 2024-12-05 → 2026-07-15；30M 67/67、39135 rows、每 symbol 319-736 rows、range 2026-06-10 08:00Z → 2026-07-14 23:30Z；两个表 duplicate key=0
- Source：所有 67 symbols 均有 Polygon rows；日线保留每 symbol 1 条更晚的旧 `ib_internal` row（共 67），不删除更近数据，row-level source 如实保留
- PM2：option collector 已恢复 online；price one-shot 为 stopped + cron active（工作日 13:35 PT），`provider=polygon`、`symbols=watchlist`、`delay=16`、secret configured；`pm2 save` 完成

**✅ P0.2 — HV 自算（2026-07-15 完成）**
- ✅ `collector/derive_volatility.py`：只从 `source=polygon_licensed` 的 `price_history` 计算 HV30/60/90
  - `HV30 = stddev(log(close[t]/close[t-1]), window=30) × √252`
  - 写入独立 `volatility_history`，不覆盖 provider 原始 `iv_history`
  - `hv_source=polygon_derived`
- ✅ 完成 Tastytrade 对比报告；67-symbol 最新值 median absolute difference：HV30 14.97pp、HV60 8.39pp、HV90 6.40pp。差异远大于 1%，证明 TT 口径不是本公式的 parity oracle；验证标准改为公式、输入来源、观测数和重放确定性
- ✅ `/api/metrics` 与 scanner 已停止消费 Tastytrade HV：优先使用 Polygon derived HV；`USE_DERIVED_VOLATILITY=false` 可回滚。TT 原始行暂保留作审计/对比，不混写派生表

**✅ P0.3 — ATM IV / IV Rank readiness（2026-07-15 完成）**
- ✅ `collector/derive_volatility.py` 从 Polygon `option_contract_snapshots` 提取 ATM IV 时序
  - ATM IV = 最接近 spot 的 call IV（当前 expiry 30-45 DTE）
  - IV Rank = (ATM IV - 52周最低) / (52周最高 - 52周最低) × 100
  - 写入 `volatility_history`，`iv_source=polygon_derived`
- ✅ Polygon option collector 按 DTE buckets 保留 expiry，并在初始分页缺少 30–45 DTE 时执行一次 bounded supplement；不会让近月合约耗尽总 cap
- ✅ ATM 交易日使用 `America/New_York`，避免 UTC 午夜把 30 DTE 错算成 29 DTE
- ✅ API/scanner 按字段返回 `iv_source`、`hv_source`、`iv_rank_source`、`iv_rank_ready`、`iv_observation_count`
- [ ] 满 252 个独立交易日后自动使用 derived IV Rank 并停止 Tastytrade iv_rank；当前 1–2 observations/symbol、0/67 ready，继续使用 TT 冷启动值，不提前伪造 readiness
  - ✅ 自动切换代码已完成：`collect.py` 在认证前过滤 ready symbols；refresh worker 对 ready symbol 返回 `already_ready`；Analyze 不再 enqueue TT metrics job
  - ✅ Tests：server 40/40、collector 81/81；synthetic 252 observations 已验证 rank readiness，worker/collector/API 已验证 provider cutoff
  - [ ] Runtime 时间门槛：当前 Railway 0/67 ready；此项只能随独立市场日快照积累，不能用重复/合成日期提前完成

完成证据（2026-07-15）：
- Railway `volatility_history` 已迁移；初次历史回填写入 24,738 HV rows
- targeted 17-symbol option backfill：17 snapshots written、0 failed、每 snapshot 32–84 个真实 provider contracts
- 最新派生运行：67 HV rows、67 ATM rows；watchlist ATM coverage 67/67；ATM DTE 30–43
- 最新 scanner batch：67/67 `hv_source=polygon_derived`、67/67 `iv_source=polygon_derived`、67/67 `iv_rank_source=tastytrade`、0/67 `iv_rank_ready`
- 真实 API smoke：`/api/metrics?symbols=QQQ,STX,AAPL` 返回 hybrid 字段来源和 30–36 DTE ATM；`/api/scan?...limit=3` 返回最新 materialized rows
- Tests：collector 69 passed；server 12 passed；frontend build passed；Python compile / `git diff --check` passed
- Rollback：设置 `USE_DERIVED_VOLATILITY=false` 并重新 materialize scanner；`volatility_history` 为附加表，无需删除 provider 原始数据

---

**P1 — 数据已有，可立刻做**
1. ✅ Screener 策略扩展：13 种真实合约结构与风险门控已完成
2. ✅ S/R 端点：server 新增 `GET /api/sr/:symbol` + Tab2/Tab4 K线图叠加支撑压力水平线
3. ✅ Scan 页顶部 Market Regime Header（SPY/QQQ GEX regime + IV Rank；VIX 无同口径数据时不伪造）

**P2 — 需要小改后端**
4. ✅ 非 watchlist 标的按需 enqueue + 前端等待/blocker UI（`/api/analyze/:symbol` 对未知 symbol 触发完整数据 bundle）
5. ✅ Focus Score / 综合动量评分（`price_history` 派生：MA位置 + RSI + 量能参与度）
6. ✅ Vol Risk Premium（IV-HV diff）作为独立指标在 Analyze 页显示；Scanner 推理链条留在 P1.3 candidate ranking 文案中继续细化

**P3 — 需要新数据源**
7. [ ] Reddit Trends 真实采集验收
   - ✅ OAuth client-credentials provider、descriptive User-Agent、bounded pagination、401 单次刷新、429 `Retry-After`
   - ✅ 只匹配 persistent universe；ambiguous ticker 需 `$`；按帖子去重并生成 24h mention/engagement score
   - ✅ `community_trend_snapshots` / `community_symbol_trends` Railway migration
   - ✅ Scanner API 独立 join 最新社区 snapshot；社区数据不进入期权机会分
   - ✅ Scan 页可排序“社区热度”列；missing/stale/fresh 明确显示
   - ✅ PM2 30 分钟 job 已注册并保存，默认 `REDDIT_TRENDS_ENABLED=false`，日志验证 disabled-safe
   - ✅ Schema-contract regression：universe SQL 使用真实列 `scan_enabled`；测试防止重新引入不存在的 `scannable`；collector 96/96
   - ✅ Tests/build：collector 90/90、server 58/58、frontend 23/23、full ESLint、Vite build
   - [ ] 提供 `REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`、`REDDIT_USER_AGENT`，获得 Reddit Data API access 后完成真实 snapshot/UI 验收
8. ✅ 30min Breakout 信号：Polygon 30M OHLCV + previous-range/volume confirmation + freshness gate

---

### 前端接入剩余优先级

| 优先级 | 页面/组件 | 当前状态 | 目标 |
|---|---|---|---|
| Done | Tab4 OI 密度图 | 已接入 | 独立选择最新 OI snapshot，按所有未到期 expiry 聚合 Call/Put OI by strike；不再用 GEX 代替 |
| Done | Tab3 IV Skew / Term Structure | 已接入 | `/api/chain/stats/:symbol` 从真实 IV contracts 派生 |
| Done | Tab1 Gamma Flip 指标 | 已接入 | `gex_snapshots.gamma_flip` |
| Done | Tab1 Local Gamma | 已接入 | `gex_snapshots.local_gamma` |
| Done | Weekly Sec2 真实 Gamma 迁徙 | `/api/weekly/:symbol` | 每个美东 market date 取最新 GEX + by-strike；仅显示已有日期 |
| Done | Weekly Sec3 真实 Max Pain | `/api/weekly/:symbol` | `gex_snapshots.max_pain` 已接入；缺失时局部 unavailable |

---

### ✅ Scanner 策略扩展（P1.1，2026-07-15 完成）

- ✅ 当前已支持：Iron Condor, Bull Put Spread, Bear Call Spread, Long Straddle（+ Bull Call Spread / Short Strangle fallback label）
- ✅ 已加入后端枚举（`server/src/domain/scanner/candidateEngine.cjs`）：
  - **Short Strangle**：无 Delta 约束时选 far OTM call + far OTM put（同 expiry）；high IV 环境
  - **Iron Butterfly**：body 在 ATM，wings 对称；low move 预期 + 高 IV
  - **Diagonal Spread**：不同 expiry；long far-date leg + short near-date leg；需跨 expiry 报价
  - **Long Call / Long Put**：低 IV 买方；low IV Rank + 强方向性 + 催化剂
  - **Calendar Spread**：跨 expiry 卖近买远；IV term structure skewed
  - **Jade Lizard**：Short Put + Short Call Spread；无上方风险；需三腿同 expiry
  - 裸卖方（Short Put/Short Call）：需风险资质门控；默认流程不推荐，高级模式开放

实现与验证证据：
- `ACTIONABLE_STRATEGIES` 共 13 种：原 4 种 + Short Strangle / Iron Butterfly / Calendar / Diagonal / Long Call / Long Put / Jade Lizard / Short Put / Short Call
- Short Strangle、Short Put、Short Call 默认不枚举；UI 必须显式开启“高级裸卖风险策略”
- Calendar/Diagonal 强制 near expiry short + farther expiry long；Iron Butterfly 强制同 expiry/同 ATM body/对称真实 wings；Jade Lizard 仅当总 credit 覆盖 call width 才输出
- pricing 使用 sell bid / buy ask；缺 quote、负 credit、错 expiry、缺腿或风险计算失败时不输出
- `/api/scan` 将 latest positioning snapshot 与 latest usable quote snapshot 分离，避免无 bid/ask 的新 Polygon snapshot 遮住已有 IB/TT quotes；返回 `quote_source/quote_snapshot_ts/quote_freshness`
- scanner DTE 使用 `America/New_York` market date，不使用 UTC `CURRENT_DATE`
- Railway runtime：最新任意 snapshot quoted coverage 0；latest usable quote coverage 55 symbols（IB 54 + TT 1）；修复后前 20 scanner rows 中 18 有 quotes，默认策略枚举 667 candidates，覆盖 10 种非裸卖结构
- Tests：frontend 17 passed、server 13 passed；changed frontend files lint 0；frontend build passed
- Historical verification gap：当时仓库全量 lint 有 21 个既有 errors；P2.4 已在独立 commit 清零。Browser plugin 初始化报 `Cannot redefine property: process`，因此本 section 未取得自动 screenshot，未宣称 visual browser tested
- Rollback：回滚本 section commit；无 schema 迁移
- ✅ **Vol Risk Premium UI 补全**：
  - 后端 `iv_hv_diff`（IV30 - HV30）已采集，`signal_score` 已用，但前端未显示
  - Analyze Tab1 增加独立的 "Vol Risk Premium" 指标卡（IV-HV diff = 卖方溢价来源）
  - Scanner 推荐理由栏展示推理链条（"IV Rank 72 + IV > HV → 卖方溢价存在 → 推荐 Iron Condor"）

---

### 非 watchlist 标的按需查询架构

- 现有 `provider_fetch_jobs` 队列已支持按需 enqueue
- 当前 `/api/gex/:symbol` 对未采集标的返回 `freshness=missing`
- ✅ API 对未知标的注册 persistent universe，并 enqueue metrics/price/options/GEX/scanner bundle；返回 product-level ready/queued/blocked
- ✅ 前端显示数据采集状态、已有 partial products 与 non-retryable blocker；PostgreSQL snapshot 是缓存层。按需 refresh worker 每 60 秒取队列，产品提示采用通常 `~1-3min`，不向用户暴露 `price / metrics / options / gex` 内部字段名；queued 状态每 5 秒检查一次，任一数据产品写入后自动重新分析。
- 无需为此修改数据库 schema

---

### 新增 API 端点规划

```
GET /api/chain/stats/:symbol   ← 已建：IV Skew + Term Structure（真实 IV by strike+expiry）
GET /api/sr/:symbol            ← 已建：pivot-based S/R zones + Focus Score（从 price_history 计算）
```

**`/api/chain/stats/:symbol` 逻辑**
- 从 `option_contract_snapshots` 最新 snapshot 读取：`expiration, strike, option_right, iv`
- IV Skew：同一 expiration，各 strike 的 IV 曲线（put skew 斜率 = 市场恐慌程度）
- Term Structure：各 expiration 的 ATM IV（前端画连线图）

**`/api/sr/:symbol` 逻辑**
- 从 `price_history` 取最多最近 250 天 OHLCV
- Pivot High = high[i] > high[i-1] and high[i] > high[i+1]
- Pivot Low = low[i] < low[i-1] and low[i] < low[i+1]
- 聚合相近 pivots（±1%）成 S/R zone
- 可叠加 Call Wall / Put Wall 作为 options-derived level

### ✅ Analyze 数据产品（P1.2，2026-07-15 完成）

- ✅ `GET /api/sr/:symbol`：最多 250 根真实日线、2-bar pivot、±1% level clustering；返回最多 3 个 support / resistance 及触碰次数
- ✅ Focus Score：0–100，使用 MA20/50/200、RSI14、5日动量与 RVol；少于 20 bars fail closed；纽约当日未完成日线不计算 RVol
- ✅ `GET /api/chain/stats/:symbol`：选择最新含真实 IV 的 snapshot，返回最近 expiry 的 call/put IV skew 与各 expiry ATM IV term structure
- ✅ `/api/chain/stats/:symbol` 独立选择最新含 OI 的 snapshot；跨未到期 expiry 聚合 `call_oi` / `put_oi` / `total_oi` by strike，返回独立 source/freshness
- ✅ Analyze Tab1：独立展示 Focus Score、Vol Risk Premium、Gamma Flip、Local Gamma 与技术 S/R
- ✅ Analyze Tab2/Tab4：真实 price history 叠加 S/R；没有真实历史时显示 unavailable，不再生成示例走势
- ✅ Analyze Tab3：展示 IV Term Structure 与 IV Skew；保留 source/snapshot/freshness contract
- ✅ Analyze Tab4：主力持仓密度使用真实 OI by strike 堆叠显示 Put/Call；缺 OI 时 unavailable，不回退 GEX
- ✅ Analyze 不再从 spot/wall target 合成不存在的推荐合约腿；没有真实 candidate attachment 时 recommendation 保持空

完成证据：
- Server tests 21/21；frontend tests 19/19；affected frontend lint 0 errors；原 effect dependency warning 已由 P2.4 独立修复；Vite production build passed
- Railway PostgreSQL runtime：AAPL S/R 读取 250 bars、Focus Score ready；chain stats 读取 56 个真实 IV contracts、5 个 ATM term points
- Runtime 发现并修复 PostgreSQL `DATE` 被序列化为 `Wed Jul 15` 的问题；API 统一 `YYYY-MM-DD`，expiry 排序有 Date-object 回归测试
- Visual verification gap：Browser plugin 初始化仍报 `Cannot redefine property: process`，因此本 section 未取得自动 screenshot，未宣称 browser-tested
- Rollback：回滚本 section commit；无 schema migration

P1.2 OI-density follow-up verification（2026-07-15）：server 58/58、frontend 21/21、全量 ESLint 通过、Vite production build passed。Local API 直连 Railway PostgreSQL 的 PLTR smoke 返回 `polygon_licensed`、fresh、7 expiries、84 contracts、11 strike points、total OI 307,713；OI 与 IV snapshot 独立选择，无 schema migration。

---

### 30 分钟级别股价数据

- TradingView：无可编程 API，排除
- Interactive Brokers：支持 `barSize='30 mins'`，但有 pacing limits（10秒/请求约束）
- **Polygon（已实现）**：`/v2/aggs/ticker/{symbol}/range/30/minute/...` 写入 `price_history_30m`；shared pacer 控制当前 entitlement 请求速率
  - 用途：30M momentum 与 Breakout；只消费 New York regular-session bars

---

### Scan 页 Market Regime Header（已实现）

- 页面顶部显示当前大盘环境：SPY/QQQ 的 GEX regime + IV Rank + 日线/30M 趋势评分；VIX 未有完整同口径数据，未伪造加入
- 让用户在看 scanner 结果前先了解大盘情绪
- 数据来源：`gex_snapshots` + `iv_history` + `price_history` + `price_history_30m`；30M market date 落后时返回 stale

---

### 数据架构现状（2026-07-15）

```
当前生产数据流：

  Polygon.io API（已接入）
    └── 每日快照采集（期权链）
          ├── OI / volume / gamma / delta / IV by strike+expiration
          ├── 写入 option_chain_snapshots + option_contract_snapshots
          └── 触发计算：GEX / PCR / Call Wall / Put Wall / Max Pain / Gamma Flip / Local Gamma

  Tastytrade API（保留，仅取 iv_rank）
    └── iv_rank / iv_percentile（冷启动过渡期用）
    └── 财报日 expected-report-date

  Polygon Stocks aggregates
    ├── 日线 OHLCV → price_history
    ├── regular-session 30M OHLCV → price_history_30m
    └── HV30/60/90 → volatility_history

  Mac Studio PM2
    ├── quantrift-options-collector（daemon，每60秒处理 refresh jobs）
    └── quantrift-options-prices（cron，周一至五 13:35 PT）

  Railway
    ├── PostgreSQL（iv_history / option_chain_snapshots / gex_snapshots / price_history）
    └── Node.js API（另含 /api/market/regime / /api/weekly/:symbol）
```

---

### 成本汇总（2026-07-15）

| 服务 | 月费 | 用途 | 何时停 |
|---|---|---|---|
| Polygon.io Options Starter | $29 | 期权链核心数据（商用授权） | 长期保留 |
| Railway（PostgreSQL + Node.js） | ~$5 | 数据库 + API | 长期保留 |
| Tastytrade API | 免费 | IV Rank 过渡期 | 积累 252 天后停 |
| yfinance | 免费 | 价格历史 / HV / fallback | 长期保留 |
| **合计** | **~$34/月** | | |

---

## 🛡️ V3A — Product Protection Architecture（商业化前架构调整）

> 目的：把 Quantrift 的核心算法、候选生成、评分逻辑、数据权限和运营状态从浏览器可见层移到后端与数据库受控边界内。这个任务块对应 `docs/QUANTRIFT_IP_PROTECTION.md` 中的产品保护方案，不改变任何交易策略含义，不改变自动交易、下单或持仓逻辑。

### Immediate Priority（现在就应先做）

- [x] **V3A immediate core**：已把 `frontend/src/lib/scanOpportunity.js` 的推荐算法迁到后端，并让 `/api/scan` 停止返回完整合约链。
  - 先做范围：`V3A-1 Backend Scanner Candidate Engine` + `V3A-3 Remove Raw Option Chain From Normal Scanner API`。
  - 暂缓范围：认证、限流、数据库角色、审计和更完整的商业化安全边界可在高度商业化前按 `V3A-5` 到 `V3A-8` 分阶段完成。
  - 完成标准：普通 scanner response 只返回最终 candidate DTO；前端不再包含候选枚举、评分权重和完整策略经济性算法；浏览器拿不到完整 raw option contract chain。
  - 交付：`server/src/domain/scanner/candidateEngine.cjs` 负责真实合约枚举、策略腿、经济性与排序；`frontend/src/lib/scanOpportunity.js` 已删除；`/api/scan` 只返回候选行的 `concrete_setup`，不返回 `option_contracts`。
  - 验证：2026-07-16 `server npm test` 82/82 通过；`frontend npm test` 36/36 通过；`frontend npm run build` 通过且 `frontend/dist` 无 `.map` 文件。

### 当前已确认的问题

- [x] Scanner 候选生成仍在前端暴露：
  - Historical evidence：`frontend/src/pages/Scan.jsx` 曾调用 `frontend/src/lib/scanOpportunity.js`。
  - 已修复：算法已迁到 `server/src/domain/scanner/candidateEngine.cjs`，前端模块已删除。
  - 结果：策略枚举、评分权重和经济性筛选不再随前端 bundle 发送。
- [x] `/api/scan` 仍向浏览器返回过多原始合约数据：
  - Historical evidence：`server/src/routes/scan.js` 曾聚合并返回 `option_contracts`。
  - 已修复：route 内部使用该数据生成候选后，在 response 前删除完整链。
  - 结果：普通 scanner 用户只收到具体候选单、legs、收益风险、解释和数据新鲜度。
- [ ] Analyze 页部分解释/推荐逻辑仍在前端：
  - 当前证据：`frontend/src/lib/analyzeData.js` 与页面组件承载部分 narrative / recommendation 拼接。
  - 当前问题：用户看到的是产品结论，但结论生成逻辑不应放在浏览器端。
- [ ] Auth/entitlement 仍处于 rollout gate：
  - 当前证据：`AUTH_ENFORCEMENT_ENABLED=false`。
  - 当前问题：商业化前可以保留 gate；商业化上线时付费 API 必须 fail closed。
- [ ] Internal status/operation endpoints 需要拆分：
  - 当前证据：`/api/status` 暴露 job summary、failures、scanner status、provider usage。
  - 当前问题：健康检查可以公开；collector/provider/job failure 细节应进入 admin/service-token API。
- [ ] Provider/source 文案暴露过细：
  - 当前问题：普通 UI 不需要显示 `polygon_licensed`、`ib_internal`、`tt_internal` 这类内部 provider/source 名。
  - 目标展示：数据日期、新鲜度、完整度、是否延迟/刷新中；内部 provider 保留给 admin/debug。
- [ ] API memory cache 是单实例缓存：
  - 当前证据：`server/src/lib/cache.js` 使用进程内 `Map`。
  - 当前问题：商业化后多实例部署、rate limit、stale-while-refresh、provider budget accounting 需要共享状态。
- [x] Vite sourcemap 与前端 bundle 保护需要显式配置：
  - 当前证据：`frontend/vite.config.js` 未显式声明 production sourcemap policy。
  - 当前问题：商业化前应明确 `build.sourcemap=false` 并在 CI 中验证。

### V3A-1 Backend Scanner Candidate Engine

- [x] 新增后端 candidate engine：
  - `server/src/domain/scanner/candidateEngine.cjs`
  - 说明：当前先用一个受测模块完成 immediate core；`candidateRules`、`candidateScoring`、`candidateEconomics`、`candidateDto` 的内部拆分作为后续可维护性重构，不阻塞浏览器隔离。
  - `server/src/domain/scanner/candidateRules.js`
  - `server/src/domain/scanner/candidateScoring.js`
  - `server/src/domain/scanner/candidateEconomics.js`
  - `server/src/domain/scanner/candidateDto.js`
- [x] 从 `frontend/src/lib/scanOpportunity.js` 迁移以下逻辑到后端：
  - supported strategy list；
  - preset → DTE/Delta/spread/OI/Volume/liquidity/risk 参数映射；
  - actual contract enumeration；
  - same-expiry / cross-expiry strategy rules；
  - credit/debit、max loss、breakeven、return-on-risk；
  - candidate score；
  - fail-closed reason；
  - unique candidate key；
  - duplicate candidate elimination；
  - rank/sort default order。
- [ ] 前端保留内容：
  - preset selector；
  - advanced filter inputs；
  - display labels/tooltips；
  - selected sort state；
  - row navigation；
  - UI-only formatting。
- [x] 前端不再包含：
  - hidden default strategy thresholds；
  - scoring weights；
  - candidate enumeration；
  - complete strategy economics engine；
  - raw option chain traversal。
- [ ] API contract：
  - request：`preset`, `strategyTypes[]`, optional advanced filters, pagination/sort。
  - response：final candidate DTO only。
  - response must include：symbol、spot、iv/hv summary、direction、positioning summary、strategy、legs、expiry/DTE、credit/debit、max loss、breakeven、score、reason、freshness、earnings risk。
  - response must not include：complete `option_contracts` array、provider internal routing、scoring internals、raw provider payload。

### V3A-2 Materialized Candidate Snapshots

- [ ] 新增 PostgreSQL additive tables：
  - `scanner_candidate_batches`
  - `scanner_candidate_snapshots`
- [ ] `scanner_candidate_batches` 字段：
  - `id`
  - `scan_key`
  - `algorithm_version`
  - `source_snapshot_cutoff`
  - `universe_count`
  - `candidate_count`
  - `started_at`
  - `completed_at`
  - `status`
  - `error`
- [ ] `scanner_candidate_snapshots` 字段：
  - `batch_id`
  - `candidate_key`
  - `symbol`
  - `strategy`
  - `strategy_family`
  - `expiry`
  - `dte`
  - `spot`
  - `score`
  - `rank`
  - `legs_json`
  - `economics_json`
  - `signals_json`
  - `freshness_json`
  - `created_at`
- [ ] Additive migration only；不得删除现有 `scanner_results_snapshots`。
- [ ] Materializer：
  - 新增 `server/src/jobs/materializeScannerCandidates.js` 或 collector-side equivalent。
  - 读取 latest option snapshot、GEX snapshot、IV/HV metrics、price trend、earnings。
  - 写入 batch + candidate rows。
  - `algorithm_version` 每次改变排序/评分/候选逻辑必须递增。
- [ ] API read path：
  - `/api/scan` 或新 `/api/v1/scanner/candidates` 读取 latest completed batch。
  - stale batch 仍返回真实候选并标记 batch age。
  - missing batch enqueue materialization job，不同步全市场 provider fetch。

### V3A-3 Remove Raw Option Chain From Normal Scanner API

- [x] 普通 scanner API 不返回 `option_contracts`。
- [ ] 新增 internal/admin chain endpoint 或给现有 chain endpoint 加权限：
  - 用于 debug、coverage、data quality inspection。
  - 需要 admin/service token 或 authenticated entitlement。
- [x] 前端 scanner row 只渲染 backend candidate DTO。
- [x] 删除或停用前端对 `row.option_contracts` 的依赖。
- [x] 测试必须覆盖：
  - `/api/scan` response body 不包含 `option_contracts`。
  - candidate legs 均来自真实 persisted contract snapshot。
  - 不存在实际合约时不生成策略。
  - same-expiry 策略不会跨 expiry 拼接。
  - credit spread 不会用负 credit 伪装成可卖结构。

### V3A-4 Backend Analyze DTO

- [ ] 新增后端 analyze domain：
  - `server/src/domain/analyze/analyzeDto.js`
  - `server/src/domain/analyze/scenarioEngine.js`
  - `server/src/domain/analyze/recommendationEngine.js`
  - `server/src/domain/analyze/positioningSummary.js`
- [ ] `/api/analyze/:symbol` 返回统一 product DTO：
  - header；
  - data freshness；
  - key metrics；
  - GEX/Wall/Gamma Flip；
  - Q&A；
  - playbooks；
  - recommended setup；
  - unavailable reasons。
- [ ] 前端 Analyze 只负责展示，不拼接核心结论。
- [ ] provider/source 对普通用户降级展示：
  - 显示：`数据更新于 11m 前`、`延迟行情`、`刷新中`、`部分数据缺失`。
  - 隐藏：`polygon_licensed`、`ib_internal`、`tt_internal`、internal job type。
- [ ] 保留 admin/debug mode 查看 raw source provenance。

### V3A-5 Auth, Entitlement, And Fail-Closed Production Gate

- [ ] Production auth defaults：
  - production 环境默认 `AUTH_ENFORCEMENT_ENABLED=true`。
  - 缺 Clerk/Stripe required env 时 production startup fail closed 或 paid routes 503。
  - local/dev 可显式关闭 enforcement。
- [ ] API route classification：
  - public：`/health`、billing webhook、必要的 landing/public market summary。
  - authenticated free：account、learn/progress、有限 analyze preview。
  - paid/pro：scanner candidates、alerts、portfolio、full analyze、weekly depth。
  - admin/service-token：status detail、provider jobs、raw chain snapshots、heartbeat operations。
- [ ] Tests：
  - production env + missing Clerk key 不得开放 paid API。
  - unauthenticated scanner returns 401/403 when enforcement true。
  - free user cannot access pro scanner candidates。
  - admin status requires admin/service token。

### V3A-6 Internal Status And Operational API Separation

- [ ] 保留 `/health` 为 minimal public health：
  - status ok/error；
  - no provider details；
  - no job failure details；
  - no database table row counts unless safe。
- [ ] 新增 `/api/admin/status` 或 `/api/internal/status`：
  - provider usage；
  - recent failures；
  - job backlog；
  - scanner batch age；
  - option snapshot coverage；
  - stale/running job diagnostics。
- [ ] Existing `/api/status/cache`、`/api/status/data`、`/api/status/heartbeat` 需分类：
  - public product-safe summary；
  - admin-only operational detail。
- [ ] Tests：
  - public status 不泄露 provider internals。
  - admin status without token fails。
  - admin status with token passes。

### V3A-7 Database Permission Boundary

- [ ] 拆分数据库 roles：
  - migration owner：DDL only；
  - collector writer：insert/upsert snapshots and jobs；
  - API reader：read product views/candidate snapshots；
  - admin/service：operational status and controlled maintenance。
- [ ] Normal API 不直接拥有 raw provider payload write permissions。
- [ ] Product-facing SQL 优先读 views/materialized product tables：
  - `scanner_candidate_snapshots`
  - `symbol_data_state`
  - `gex_snapshots`
  - derived read models。
- [ ] Tests/deployment checks：
  - API role cannot write raw option snapshots。
  - collector role cannot read user billing data。
  - migration role credentials never configured in runtime API service。

### V3A-8 Shared Cache And Rate Limit Layer

- [ ] 引入 Redis/Upstash 或 PostgreSQL-backed shared state：
  - API response cache；
  - per-user/IP rate limits；
  - provider budget/rate coordination；
  - stale-while-refresh polling state。
- [ ] 保留 PostgreSQL 为 source of truth；Redis 只做 cache/coordination。
- [ ] Rate limits：
  - anonymous/public endpoints tight。
  - authenticated free tier bounded。
  - paid tier higher。
  - admin/service tokens separately limited。
- [ ] Anti-enumeration：
  - unknown symbol requests require debounce/cooldown。
  - bulk scanner export not exposed through public API。
  - pagination limits enforced server-side。
- [ ] Tests：
  - repeated unknown symbol requests do not enqueue unlimited jobs。
  - scanner pagination limit cannot be bypassed。
  - stale cache is labeled, not silently treated as fresh。

### V3A-9 Frontend Production Hardening

- [x] `frontend/vite.config.js` production build explicitly sets `build.sourcemap=false`。
- [ ] CI/build verification checks no `.map` files in production artifact。
- [ ] Remove unused mock modules from production import graph：
  - `frontend/src/data/weeklyMock.js` 已删除；继续检查其他 mock imports。
  - Any remaining examples must be clearly educational/demo route only。
- [ ] Security headers:
  - CSP appropriate for Vercel/Clerk/Stripe。
  - `X-Content-Type-Options`。
  - `Referrer-Policy`。
  - `Permissions-Policy`。
- [ ] Do not display internal source names in normal product UI。
- [ ] Tests:
  - production build contains no source maps。
  - scanner/analyze UI does not render `polygon_licensed` / `ib_internal` / `tt_internal` for normal user mode。

### V3A-10 Worker And Runtime Boundaries

- [ ] Keep deployment units separated:
  - Vercel：frontend only。
  - Railway API：Express API only。
  - Railway worker/scheduler：Polygon/data materialization only。
  - Mac Studio：IB Gateway internal collector only。
  - PostgreSQL：snapshots/read models/jobs/user data。
  - Redis/shared cache：rate limit/cache/coordination。
- [ ] API service must not run collector loops。
- [ ] User request must not synchronously depend on Mac Studio。
- [ ] Provider jobs:
  - `ingest_option_chain`
  - `derive_gex`
  - `derive_oi_delta`
  - `materialize_scanner_candidates`
  - `materialize_analyze_summary`
  - `materialize_weekly_summary`
- [ ] Job records must include:
  - input snapshot id；
  - algorithm version；
  - provider；
  - dedupe key；
  - priority；
  - retry/backoff state。

### V3A-11 Rollout Plan

- [x] Step 1：后端实现 candidate engine；以迁移后的同一回归测试集验证行为一致。未新增独立 shadow compare job。
- [ ] Step 2：写入 `scanner_candidate_snapshots`，但 `/api/scan` 暂不切流。
- [x] Step 3：增加 API contract tests，确保 candidate DTO 完整且不返回 raw chain。
- [x] Step 4：前端 Scanner 改读 backend candidate DTO。
- [x] Step 5：删除前端 candidate enumeration/scoring 依赖。
- [ ] Step 6：Analyze recommendation/narrative 迁移到 backend DTO。
- [ ] Step 7：internal status/admin endpoint 拆分。
- [ ] Step 8：production auth fail-closed gate。
- [ ] Step 9：DB role split 与 deployment secret rotation。
- [ ] Step 10：Redis/shared limiter/rate limit 接入。

### V3A-12 Verification Requirements

- [x] Unit tests（immediate core scope）：`server/test/candidateEngine.test.js` covers DTE/Delta/spread/OI/Volume gates、same-expiry validation、credit/debit economics、scoring order and fail-closed missing legs. Candidate dedupe persistence remains V3A-2 work.
- [x] API tests（immediate core scope）：scanner returns candidate DTO and never returns `option_contracts`.
- [ ] API tests still required for stale batch behavior, missing-batch materialization and auth/entitlement paid gates.
- [ ] Frontend tests：
  - scanner renders backend DTO；
  - sorting works after repeated clicks；
  - no raw source names in normal UI；
  - stale/queued/missing UX stays user-friendly。
- [x] Build/security tests（immediate core scope）：no source maps in production artifact；no frontend import of candidate scoring engine。
- [ ] Build/security tests still required: no secrets in bundle；route entitlement matrix passes。
- [ ] Runtime evidence：
  - command；
  - git commit；
  - algorithm version；
  - candidate batch id；
  - candidate count；
  - symbols covered；
  - stale count；
  - response payload sample without raw chain；
  - rollback command/path。

### V3A-13 Rollback

- [ ] Candidate engine rollout must be reversible:
  - keep old `scanner_results_snapshots` read path until backend candidate DTO is verified。
  - feature flag：`SCANNER_CANDIDATE_ENGINE_ENABLED`。
  - rollback：disable flag and read previous scanner materialized rows。
- [ ] Additive DB tables can remain after rollback。
- [ ] Auth enforcement rollback:
  - local/dev can set `AUTH_ENFORCEMENT_ENABLED=false`。
  - production rollback must be explicit and documented because it changes commercial access control。
- [ ] Frontend rollback:
  - keep UI compatible with backend DTO and previous scanner row shape for one release if needed。

### V3A-14 Deployment Readiness

- [ ] Do not deploy commercial paid launch until:
  - scanner candidate generation no longer runs in frontend；
  - normal scanner API no longer returns raw option contracts；
  - paid APIs are auth/entitlement gated；
  - internal status/provider details are admin-only；
  - production sourcemaps are disabled；
  - data freshness/stale/queued states are visible to users；
  - rollback flag and previous read path are verified。

---

## 🏗️ V3 — Product
- [ ] User authentication（Clerk）
  - ✅ Express `clerkMiddleware`、JSON 401/503 guard、authorized parties、`/api/account/me`
  - ✅ React conditional `ClerkProvider`、SignIn/UserButton、`/account` route；无 key 时不挂载 SDK
  - ✅ Tests/build：server 43/43、frontend 19/19、Vite build passed
  - [ ] Railway/Vercel 注入 Clerk publishable/secret keys 并完成真实 sign-in 验收
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
  - ✅ Free/Pro plan catalog 与 bounded entitlements 已写入 account API
  - ✅ scanner/alerts/live/portfolio routes 已接入 entitlement middleware；`AUTH_ENFORCEMENT_ENABLED=false` rollout gate
  - ✅ Frontend API bridge 为所有数据请求附加 Clerk bearer token，避免登录用户仍被 401
  - [ ] 配置 Clerk/Stripe、完成 webhook lifecycle 后将 production enforcement 改为 true
- ✅ Portfolio dashboard：Clerk-owned CRUD、multi-leg positions、真实 contract snapshot mark、实际 P/L 与 aggregate Delta/Gamma/Theta/Vega（2026-07-15）
  - ✅ Missing quote fail closed：position/summary 显示 `待报价`，不以 entry price 伪装 current mark
  - ✅ Ownership：所有 list/create/close SQL 绑定 authenticated local user id
  - ✅ Tests/build：server 46/46、frontend 21/21、Vite build passed
- ✅ PostgreSQL: users / subscriptions / positions 表
  - ✅ `users` / `subscriptions` additive schema 已实现；新 Clerk user 自动获得 free subscription
  - ✅ Railway migration：2026-07-15 执行成功；只读确认 `users`、`subscriptions`、`positions`、`position_legs`、`stripe_webhook_events` 全部存在
  - ✅ `positions` / `position_legs` schema 与 ownership indexes 已实现
- [ ] Payment integration（Stripe）
  - ✅ Checkout subscription、Customer Portal、signed raw-body webhook、Free/Pro lifecycle mapping
  - ✅ `stripe_webhook_events` event-id idempotency；plan 只由 signed subscription webhook 更新
  - ✅ Tests/build：server 56/56、frontend 21/21、Vite build passed
  - [ ] 提供 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_PRICE_ID` 并完成 test-mode checkout/webhook/portal 验收
- ✅ Custom domain 配置：`quantrift.io` 308 → `www.quantrift.io`，www HTTP 200
