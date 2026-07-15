# Task Tracker

## ✅ Done (V1 Core)
- [x] Project scaffolding: React + Vite + Zustand
- [x] Documentation: CLAUDE.md, README.md, wiki.md, learning.md, task.md
- [x] Black-Scholes engine: pricing + Delta/Gamma/Theta/Vega/Rho + POP + BEP
- [x] Strategy data: 86 strategies, 7 categories, 9-field notes each（系统按卖方框架补强）
- [x] App layout: 3-column dark theme (sidebar / main / right panel)
- [x] Sidebar: search, category filter, strategy list, ↑↓ keyboard navigation
- [x] Payoff chart: Canvas, expiry + scenario lines, BEP markers, fill zones
- [x] Greeks six-chart: Risk/Theta/Delta/Vega/Gamma/Rho with DTE slider (4 time lines)
- [x] Scenario panel: spot / IV shift / rate / div / range / contracts
- [x] Risk metrics: Max P/L, BEP, POP, Delta, Theta, Vega, Gamma, Rho (12 metrics)
- [x] Leg editor: add/edit/remove legs, real-time chart update
- [x] Strategy notes: 9-card grid (build/when/strike/IV/DTE/delta/TP/SL/adj)
- [x] Unlimited profit/loss detection for naked options
- [x] Greeks 知识库页面（5大 Greek + 6个 Interaction 卡片）
- [x] 知识库扩展：GEX、Gamma Squeeze 实战案例、Vanna/Charm、OpEx Pin Risk、Vol Skew、期权卖方系统化框架
- [x] 期权实战交易框架记录（卖方哲学、Tastytrade 规则、Vol Risk Premium）→ learning.md
- [x] 数据库/基础设施决策：PostgreSQL on Railway（放弃 DuckDB）

## ✅ Done (V2 Scaffold)
- [x] React Router 多页路由：/learn、/analyze、/scan
- [x] NavBar 组件：页面导航
- [x] /learn：V1 所有组件完整保留（Learn.jsx）
- [x] /analyze：标的分析页（mock data），IV状态、方向信号、期限结构、策略推荐
- [x] /scan：扫描器页（mock data），过滤条件、结果列表、点击跳转 Analyze
- [x] mock data：9个标的（AAPL/SPY/QQQ/TSLA/MSFT/XOM/GLD/NVDA/AMD）
- [x] Analyze ↔ Scan 联动：扫描器点击行自动填入并分析

## ✅ Done (Phase 1 — /analyze 4-Tab UI)
- [x] /analyze 重构为 4-tab 布局（Tab 导航 + URL 状态 ?tab=0-3）
- [x] Tab 1 今日概览：sector chips、3个 Q&A 卡片、conclusion card、badge 组（格局/动量/信号/GEX）、剧本 playbook、推荐卡
- [x] Tab 2 日内变化：Kalman Filter 趋势图 Canvas、Trend Spread 动量柱、输出 badge、3格辅助信息（趋势格局/期权结构/RVol）
- [x] Tab 3 数据解读：GEX by Strike Canvas（带 Put/Call Wall 竖线、当前价箭头）、3 核心数字（GEX Total/PCR/IV ATM）、Unusual Activity 列表、结论文本
- [x] Tab 4 信号追踪：筹码标尺 Canvas（竖向密度图）、上方压力/下方支撑卡、观察结论
- [x] mockAnalysis.js 扩展：9 标的增加 sector/gexTotal/gexByStrike/putWall/callWall/pcr/unusualActivity/trend/conclusion/scenarios 字段
- [x] Canvas 全部支持 devicePixelRatio + ResizeObserver（Retina 适配）

## ✅ Done (Phase 2 — /weekly Weekly Recap UI)
- [x] /weekly 路由 + /weekly/:symbol 参数路由（App.jsx + NavBar）
- [x] Weekly.jsx：5段导航（?sec=0-4）、符号切换链接、prev/next 按钮、进度计数
- [x] weeklyMock.js：AAPL/SPY/QQQ 数据，含 week/candles(5)/gammaByDay(Mon-Fri)/gammaMigration/maxPain/smartMoney/scenarios
- [x] Sec1 本周定调：K线图 Canvas（5根OHLC）+ CME Gauge Canvas（半圆弧仪表盘）、定调文字
- [x] Sec2 Gamma迁徙：星期选择器、GEX 日内图 Canvas（随天切换）、Call/Put Wall 迁移表
- [x] Sec3 交割偏离：MaxPain vs FridayClose 偏离条形图、偏离 badge（中性/警告/空方）
- [x] Sec4 资金暗线：Smart Money 每日流入水平柱 Canvas、累计流向 + 背离 badge
- [x] Sec5 下周分叉：多头/空头剧本卡片（触发条件/价格目标/观察重点）
- [x] index.css：新增 ~170行 Phase 1 样式 + ~200行 Phase 2 样式（.wk-* 类）
- [x] /weekly 数据化第一步：AAPL/SPY/QQQ 继续用完整 mock；其他有真实 `/api/metrics` 数据的标的生成真实 IV weekly 骨架，并明确提示 price/GEX/flow 仍待接入

## ✅ Done (Infrastructure)
- [x] Git repo 初始化，branch: master
- [x] GitHub repo: whicter/quantrift_options-lab
- [x] Mac Studio: /Users/congrenhan/Documents/quantrift_options-lab（SSH push）
- [x] 本机: /Users/cohan/Documents/quantrift_options-lab（HTTPS pull）
- [x] 工作流确认：本机开发 → rsync → Mac Studio push
- [x] 项目结构重组：frontend/ + server/ + collector/ 单 repo
- [x] server/：Node.js Express API（/api/metrics, /api/scan, /health）
- [x] collector/：Python IV 采集脚本（auth.py + collect.py，Tastytrade → PostgreSQL）
- [x] 代码已同步至 GitHub（本机 → Mac Studio → push）
- [x] .claude/settings.json：Bash(*) 全放行白名单
- [x] .claude_session：session UUID 固化，`cr` 命令一键恢复对话

## ✅ Done (Phase 3A — UI Polish)

> 参考截图：华尔街咖啡馆 MRVL/META 盘中即时分析 + Nokia 周复盘
> 完成于 2026-07-13

- [x] **GEX 发散柱图**：已确认 Tab3Options + Sec2Gamma 均已是从零轴向两侧延伸的发散柱，无需修改
- [x] **时间轴滑块（/weekly Sec2）**：Mon-Fri 按钮改为横向轨道 + 5个节点，当前日期蓝色高亮，CSS `.wk-timeline-*`
- [x] **底部解读条**：Tab1/2/3/4 底部均加 `InsightCarousel`，新建 `components/InsightCarousel.jsx`，静态全部展示，黄色高亮
- [x] **PCR 拆分（Tab3）**：mockAnalysis.js 加 `pcrVol`（9个标的），Tab3 数字格从3格扩展为4格（GEX/PCR OI/PCR Vol/IV），CSS `.az-gex-numbers-4`
- [x] **公司信息增强**：新建 `data/companyInfo.js`（12个标的，含中文名/英文全称/logo/tagline）；/analyze header 显示 logo + 中文名；/weekly Sec1 显示大 logo + 中文名
- [x] **价格区间 chip（Tab4）**：顶部显示 `$putWall ~ $callWall` 金色圆角徽章，CSS `.az-price-range-chip`
- [x] **Tab4 筹码标尺重做**：bar 高度改为动态适配（相邻 strike 间距一半），bars 连续填充无空隙，渐变填色 + 左边accent，形成真正的 OI 密度分布侧面图
- [x] **InsightCarousel 改静态**：去除自动轮播/定时器，所有条目一次性全部展示

---

## ✅ Phase 3B-1 — Provider-first 价格历史闭环（IB internal + Tastytrade）

> 前置条件：Mac Studio collector cron 已配置运行
> 价格历史默认走 provider adapter。当前默认 `PRICE_PROVIDER=ib_internal`，显式开发/回填可用 `PRICE_PROVIDER=stooq`。yfinance 不作为默认路径。

### 真实价格历史（趋势图）
- [x] **collector 新增每日价格采集**：symbol → 60 天 OHLCV
  - 写入 Railway PostgreSQL 新表 `price_history (symbol, date, open, high, low, close, volume, source, created_at)`
  - 存储位置：数据库，不放前端 mock、不放本地 CSV；collector 每天按 watchlist upsert 最近 60 个交易日
  - [x] `server/src/migrate.js` 新增建表语句；2026-07-14 已在 Railway PostgreSQL 创建 `public.price_history`
  - [x] `collector/common.py`：共享 `watchlist.txt` loader
  - [x] `collector/providers/base.py`：`PriceProvider` / `PriceBar` contract
  - [x] `collector/providers/ib_price_provider.py`：IB Gateway internal adapter，source=`ib_internal`
  - [x] `collector/providers/stooq_price_provider.py`：显式 dev/backfill adapter，source=`stooq`
  - [x] `collector/collect_prices.py`：读取 watchlist 或 `SYMBOLS` override，按 provider upsert `price_history`
  - [x] `collector/requirements.txt`：加入 `ibapi`
  - [x] `collector/.env.example`：加入 `PRICE_PROVIDER`、`PRICE_HISTORY_LIMIT`、`IB_HOST`、`IB_PORT`、`IB_PRICE_CLIENT_ID`、`IB_TIMEOUT`、`SYMBOLS`
- [x] **server 新增 `/api/prices/:symbol`** 端点：返回最近 60 天 OHLCV
  - [x] `server/src/routes/prices.js`
  - [x] `server/src/index.js` 挂载 `/api/prices`
  - [x] `frontend/src/lib/api.js` 新增 `getPrices(symbol, limit)`
- [x] **Tab2Trend.jsx 改用真实价格**：优先调用 `/api/prices/:symbol`，fallback 保留 LCG mock
  - KF 计算逻辑不变，输入换成真实价格数组
  - RVol = 当日成交量 / 20日均量（从 price_history 算）
- [x] **Weekly Sec1 改用真实价格**：`/weekly/:symbol` 优先读取 `/api/prices/:symbol`
  - AAPL/SPY/QQQ 仍保留完整 5-section mock/GEX/flow 结构
  - 若有真实价格历史，则覆盖 Sec1 的 weekClose / prevClose / weekHigh / weekLow / 5日 K线
  - GEX / flow / Max Pain 仍需授权 options data，不能用 mock 伪装成真实

### 真实 IV（Tastytrade）
- [x] **`/api/metrics?symbols=X` 已上线**，前端 /analyze 接入
  - Analyze.jsx 调用真实 API
  - 真实 IV Rank / IV30 / HV / earnings 覆盖 mock shell
- [x] Analyze 缺失数据 UX：输入未采集标的不再提示固定 AAPL/SPY/QQQ；区分“在 watchlist 但尚未写入”和“不在 watchlist”
- [x] Analyze 使用真实 `/api/metrics` 覆盖 IV Rank / IV30 / HV / earnings；GEX/趋势结构暂用现有展示壳
- [x] Analyze price-only fallback：当 symbol 已有 `/api/prices/:symbol` 但 `/api/metrics` 缺失时，不再整页显示“暂无真实数据”
  - 2026-07-14 case：`PLTR`
  - Confirmed from production API：`/api/metrics?symbols=PLTR` 返回 `{}`，但 `/api/prices/PLTR?limit=3` 返回 `source=ib_internal`、`freshness=fresh`
  - UI behavior：显示真实价格、price history 趋势、`IV Rank 暂不可用`，并明确提示 IV / GEX / Walls / option chain 暂未接入
  - 不生成期权策略结论，不把 mock option analysis 伪装成真实数据
- [x] Analyze button click bug fixed：`onClick={handleAnalyze}` 会把 click event 当成 symbol 传入，导致 `.trim()` 报错；改为 `onClick={() => handleAnalyze()}` 并防御非字符串参数
  - 2026-07-14 local UI smoke verified：输入 `AAPL` 点击分析显示 IVR；输入 `PLTR` 点击分析显示 price-only 结果

### 真实 RVol（price_history 量能）
- [x] 从 `price_history` 的 volume 字段计算 RVol，替换 Tab2 中的 mock RVol（0.2x）

### Phase 3B-1 验证记录
- [x] Python syntax verified：`collector/venv311/bin/python -m py_compile collector/collect.py collector/collect_prices.py collector/common.py collector/providers/base.py collector/providers/ib_price_provider.py collector/providers/stooq_price_provider.py`
- [x] Node syntax verified：`node --check server/src/index.js`、`node --check server/src/routes/prices.js`
- [x] Frontend build verified：`npm run build` in `frontend/`
- [x] Collector runtime verified with IB Gateway：`SYMBOLS=AAPL collector/venv311/bin/python collector/collect_prices.py`，写入 60 rows，source=`ib_internal`
- [x] Database verified：AAPL `price_history` = 60 rows，date range 2026-04-17 → 2026-07-14，source=`ib_internal`
- [x] Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 3 rows，source=`ib_internal`
- [ ] Production API verified after deploy：待部署后 curl `/api/prices/:symbol`

---

## 🔨 Phase 3B-2 — 价格历史生产化与 UI 数据状态

### Collector 调度
- [x] 在 Mac Studio 安装 `collect_prices.py` 定时任务
  - 采用 macOS LaunchAgent，而不是 cron。
  - 原因：`crontab -l` 可读取，但 `crontab /private/tmp/quantrift_options_crontab.txt` 在当前 Codex/macOS 权限环境中挂住；LaunchAgent 可正常 bootstrap/kickstart。
  - Label：`com.quantrift.collect-prices`
  - Installed plist：`/Users/congrenhan/Library/LaunchAgents/com.quantrift.collect-prices.plist`
  - Runtime：`/Users/congrenhan/.quantrift_options_collector`
  - Schedule：Monday-Friday 13:35 PT / 16:35 ET
  - Runtime wrapper：`/Users/congrenhan/.quantrift_options_collector/run_collect_prices.sh`
  - Logs：`/Users/congrenhan/.quantrift_options_collector/logs/collect_prices.launchd.log`
  - 2026-07-14 kickstart 验证：`launchctl kickstart -k gui/$(id -u)/com.quantrift.collect-prices`
  - 2026-07-14 launchd 验证结果：`last exit code = 0`，日志显示 `4020 rows written, 0 failed`
- [x] 跑完整 watchlist 一次 `collect_prices.py`
  - 成功 symbols 数量：67 / 67
  - 写入 rows：4020
  - 失败 symbols：无
  - 失败分类：无 IB contract 解析失败、无权限、pacing/timeout、symbol 格式问题
  - Railway DB 验证：`price_history` source=`ib_internal`，date range 2026-04-17 → 2026-07-14，所有 symbol 均 >=60 rows
- [x] 为 `BRK.B` 等特殊 ticker 建立 symbol normalization 规则
  - 输入 symbol
  - IB contract symbol/localSymbol
  - UI display symbol
  - DB canonical symbol
  - 规则：DB/UI canonical symbol 保持原样；IB `Contract.symbol` 将 `.` 映射为空格，例如 `BRK.B` → `BRK B`

### Backend/API
- [x] 部署 server 后验证生产 `/api/prices/:symbol`
  - `curl -f "https://quantriftoptions-lab-production.up.railway.app/api/prices/AAPL?limit=3"`
  - 返回字段必须包括 `symbol`、`source`、`count`、`latest_date`、`prices[]`
  - 2026-07-14 验证结果：HTTP 200，返回 `source=ib_internal`、`count=3`、`freshness=fresh`、`is_stale=false`
- [x] `/api/status/data` 增加 price coverage 细节
  - watchlist 总数
  - `price_history` covered symbols
  - missing price symbols
  - stale price symbols
  - latest price date
  - source distribution
  - 2026-07-14 生产验证：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- [x] `/api/prices/:symbol` 增加 freshness 字段
  - `snapshot_ts` 或 `latest_date`
  - `freshness`
  - `is_stale`
  - `source`

### Frontend
- [x] Analyze header 显示价格数据状态
  - `price ib_internal 2026-07-14`
  - stale 时显示 `price stale`
  - missing 时不显示真实价格标记
- [x] Tab2Trend 增加真实/示例走势标识
  - real：`price_history`
  - fallback：`示例走势`
  - 不把 fallback 说成真实数据
- [x] Weekly Sec1 增加价格来源标识
  - real：显示 `price_history source + latest_date`
  - fallback：显示当前为示例 weekly shell
- [x] Scan 结果增加 price coverage 状态
  - 已有 price_history
  - 缺失 price_history
  - stale price_history

### Verification
- [x] Syntax verified：Python collector files
- [x] Syntax verified：Node server routes
- [x] Frontend build verified：`npm run build`
- [x] Collector runtime verified：完整 watchlist run
- [x] LaunchAgent verified：`com.quantrift.collect-prices` kickstart 完成，`last exit code = 0`
- [x] Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 `freshness=fresh`、`is_stale=false`
- [x] Local API verified：`curl -f "http://localhost:3002/api/status/data"` 返回 `price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- [x] Production API verified：Railway `/api/prices/AAPL?limit=3`
  - 2026-07-14 结果：HTTP 200，`freshness=fresh`、`is_stale=false`
- [x] Production status verified：Railway `/api/status/data`
  - 2026-07-14 结果：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- [ ] UI verified：`/analyze?symbol=AAPL&tab=1` 显示真实趋势
  - 自动浏览器验证未完成：Browser runtime 初始化报 `Cannot redefine property: process`。
- [ ] UI verified：`/weekly/AAPL?sec=0` 显示真实 5日 OHLCV
  - 自动浏览器验证未完成：Browser runtime 初始化报 `Cannot redefine property: process`。

---

## ✅ Phase 3B-3 — Scanner 接入真实 IV + Price Coverage

### Backend/API
- [x] `/api/scan` 限定 collector watchlist
  - 使用 `server/watchlist.txt` fallback，避免 Railway server-only 部署读不到 `collector/watchlist.txt`
  - 不再扫描 `iv_history` 中的 extra symbols
- [x] `/api/scan` 返回 latest `price_history` 字段
  - `price_close`
  - `price_date`
  - `price_source`
  - `price_status`
- [x] `/api/scan` 继续按真实 IV 数据筛选
  - `minIvr`
  - `maxIvr`
  - `minIvHv`
  - `limit`

### Frontend
- [x] `frontend/src/lib/api.js` 新增 `getScan()`
- [x] `Scan.jsx` 从 mock scanner 改为调用真实 `/api/scan`
- [x] Scanner watchlist 显示来自 `/api/status/data`
- [x] Scanner table 使用真实 price close 和 price coverage status
- [x] Strategy filter 仍在前端基于 current recommendation 过滤
- [x] Direction column 接入真实 `price_history` 派生趋势，不再显示 `待接入趋势`
  - `collector/materialize_scan.py` 从 `price_history` 计算 trend_score、trend_label、trend_signal、5D change、RSI14、MA20/50/200
  - `/api/scan` 从 `scanner_results_snapshots` 返回趋势字段，前端只读 materialized result

### Current Scanner Logic
- [x] 当前 scanner 是 IV + price trend + GEX/OI snapshot 版，不是完整 options chain selector
  - `IV Rank >= 50` + bullish trend：`Bull Put Spread`
  - `IV Rank >= 50` + bearish trend：`Bear Call Spread`
  - `IV Rank >= 50` + neutral/missing trend：`Iron Condor`
  - `30 <= IV Rank < 50`：默认 `Iron Condor`，小仓位/定义风险
  - `IV Rank < 30`：默认 `Long Straddle`，只表示低 IV 适合观察买方波动结构，不代表已有事件催化
  - POP 为规则占位值，不来自真实 option chain
- [x] 已写入文档：`docs/wiki.md`、`docs/learning.md`

### Verification
- [x] Node syntax verified：`node --check server/src/routes/scan.js`
- [x] Frontend build verified：`npm run build`
- [x] Local API verified：`curl -f "http://localhost:3002/api/scan?minIvr=0&maxIvr=100&limit=10"`
  - 返回真实 Tastytrade IV rows
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
  - 结果限定在 watchlist 内
- [x] Production API verified after deploy：Railway `/api/scan?minIvr=0&maxIvr=100&limit=5`
  - 2026-07-14 verified HTTP 200
  - 返回 rows 限定在 watchlist 内，不再包含 extra symbols such as `NFLX`
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
- [x] UI verified：`/scan` 点击立即扫描显示真实 rows
  - 2026-07-14 Playwright Core + local Chrome smoke verified `https://www.quantrift.io/scan`
  - 操作：打开 `/scan` → 点击 `立即扫描`
  - 页面显示 `找到 8 个标的`，可见 rows 包含 `AMD` / `META` / `GOOGL`
  - `/api/scan` response row count = 8，payload 包含 `source=tastytrade`、`price_source=ib_internal`、`price_status=covered`

---

## 📋 V1 Backlog (Polish)
- [ ] Strategy comparison mode (side by side, 2 strategies)
- [ ] IV Rank badge per strategy in sidebar (Low/Med/High indicator)
- [ ] Probability cone on payoff chart (shaded distribution band)
- [ ] Export payoff chart as PNG
- [ ] Mobile-responsive layout (stack panels vertically)
- [ ] Payoff chart: show multiple DTE snapshots (not just current + expiry)
- [ ] Add 10 more strategies (exotic, FX, index-specific)
- [ ] 策略 notes 进一步标准化（确保所有策略 iv/dte/tp/sl 字段有具体数字）

## 🚀 V2 — Real Data

### 数据层决策（已确定）
- [x] 数据源方案：Tastytrade API（IV Rank，免费）+ provider-first OHLCV（当前默认 IB internal）+ 授权期权链数据源（生产）+ IB API（内部研究/算法验证）
- [x] 数据采集节点：Mac Studio（复用已有 IB Gateway，clientId=2 与 futures bot 共存）
- [x] 总数据成本：$0/月（Railway 托管 ~$5/月）
- [x] 冷启动方案：Tastytrade API 第一天即可提供 IV Rank，同时自积累历史数据
- [x] Tastytrade 账户注册完成（whicter.han@gmail.com）
- [x] Tastytrade API 测试通过：/market-metrics 字段确认，认证流程完整验证
- [x] remember-token 自动续期机制验证通过（全自动，无需人工介入）
- [x] 生产数据原则：IB Gateway 只作为 internal research adapter，不作为公开/付费产品的默认 option chain 数据源，除非授权和再分发权利已确认

**Infrastructure**
- [x] Railway: 创建 PostgreSQL Service，获取 DATABASE_URL
- [x] Railway: 创建 Node.js Service，部署 server/，注入 DATABASE_URL
- [x] 跑 migrate.js 建表（iv_history, scanner_configs）
- [x] 建表 schema 已定义：server/src/migrate.js
- [x] Mac Studio collector：配 .env，python auth.py --login，加 cron
- [x] Vercel: 部署 frontend/，注入 VITE_API_BASE_URL → Railway URL
- [x] 前端：mock data → 真实 API 调用
- [x] 生产验收：quantrift.io 308 → www，www 200，Railway /health、/api/metrics、/api/scan 均返回成功（2026-07-14）

**Mac Studio 数据采集脚本**
- [x] Python 定时脚本：collector/collect.py（每日 4:30pm ET，采集 IV → 写入 Railway PostgreSQL）
  - Tastytrade 认证：collector/auth.py，remember-token 自动续期，过期时发邮件提醒
  - 采集字段：iv_rank, iv30, hv30/60/90, iv_hv_diff, earnings_date, term_structure
  - 2026-07-14 首次手动跑通：写入 21 rows，source=tastytrade；cron 已安装为 1:30pm PT / 4:30pm ET
- [x] 数据覆盖状态 API：`GET /api/status/data` 读取 collector watchlist，并返回 `iv_history` 覆盖率、缺失标的、stale 标的、source 分布和最新日期
  - 同时返回 `price_history.table_exists`、价格覆盖数量和最新价格日期
- [ ] IB 连接管理：clientId=2，复用 futures bot 的 IB Gateway
- [ ] 服务层自动切换：252天历史满后改为自算 IV Rank，停止调用 Tastytrade

**基础设施可靠性 / 云端迁移（新增）**
- [ ] Tastytrade collector 迁移：从 Mac Studio 搬到 Railway Cron Job（纯 REST API，无需本地网关，可直接云端跑）
- [ ] Mac Studio 断电风险：加装 UPS（如 APC Back-UPS），配置 macOS 电源恢复后自动开机，短期过渡方案
- [ ] IB Gateway 云端迁移评估：Docker + IBC（参考 gnzsnz/ib-gateway-docker）部署到云 VPS（DigitalOcean/AWS/Linode），解决 Mac Studio 单点故障
  - 需解决：云端固定出口IP（避免触发IBKR异常登录验证）、2FA 首次人工确认 + 后续会话保活
  - 上线前置条件：面向付费用户/需要高可用时必须完成此项，个人 Mac Studio 不适合作为生产基础设施
- [ ] （可选）心跳监控：Mac Studio → Railway 心跳上报，云端检测断线告警

**前端路由（Vite + React Router）**
- [x] 安装 react-router-dom，配置多页路由
- [ ] `/` 落地页（产品介绍）
- [x] `/learn` → V1 教育工具（Learn.jsx）
- [x] `/analyze` → V2 标的分析页（mock data）
- [x] `/scan` → V2 扫描器页（mock data）

**V2 核心流程（ticker-first）**
- [x] 用户输入标的 → 系统分析（不再要求用户先选策略）
- [x] 技术分析层：MA20/50/200、RSI、MACD → 方向评分
  - 真实输入：`price_history`
  - 60日历史不足 MA200 时返回 `ma200=null`，不伪造长周期数据
- [x] IV 分析层：IV Rank + IV vs HV → 卖方/买方判断
  - 真实输入：`/api/metrics`
  - recommendation matrix 使用 IV Rank / IV30 / HV / trend score / GEX context
- [x] 事件风险：财报日检测
  - 真实输入：`iv_history.earnings_date`
  - `/api/scan` 返回 `earnings_date`
  - Scanner 前端显示财报日期；距离当前日期 0-14 天时标记 warning
- [x] 策略矩阵 → 推荐具体策略 + 建议 Delta/DTE/宽度参数
  - High IV + neutral/positive GEX：Iron Condor
  - High IV + bullish trend：Bull Put Spread
  - High IV + bearish trend：Bear Call Spread
  - Low IV：Long Straddle
  - Mid IV：small defined-risk directional spread

**功能**
- [ ] 用 live 链数据填充推荐策略的 legs（自动选择最优行权价）
  - Current fallback：用 price / Call Wall / Put Wall 生成 target strikes 与 delta/DTE/width 参数
  - Blocked for full product：需要 broader option-chain snapshots with bid/ask, Greeks, DTE, liquidity across watchlist
- [ ] Options scanner: IV Rank / spread width / liquidity / DTE / Greeks 阈值
  - Current completed：IV Rank, GEX, PCR, OI/volume, OI delta filters
  - Remaining：contract-level spread width / liquidity / DTE / Greeks thresholds require broader option-chain snapshots
- [ ] Push notifications: email + web push 当扫描命中条件

**Phase 3D — Options Positioning Data Layer（IB internal 过渡版，生产需授权 provider）**

目标：先用 IB Gateway 作为 internal research adapter 跑通 option chain → snapshots → GEX / Wall / Gamma Flip → API → UI 的完整闭环；正式上线前将 provider 切换为具备授权和再分发权利的 options data provider。

边界：
- [x] `source=ib_internal` 只允许用于内部研究、算法验证、字段探索和个人使用。
- [x] 不把 IB Gateway 放进公开用户请求链路；用户输入 symbol 时 API 只读 PostgreSQL 最新 snapshot。
- [x] 不把 IB option chain 数据宣传为正式授权产品数据。
- [x] 所有 API response 必须返回 `source`、`snapshot_ts`、`freshness`、`is_stale`、`provider_status`。
- [x] provider adapter 必须可替换：IB internal adapter 与未来 licensed provider adapter 使用同一接口。

**Phase 3D-1 — Schema & Provider Contract**
- [x] 定义 provider interface：
  - `fetch_underlying(symbol) -> spot, bid, ask, timestamp, source`
  - `fetch_option_chain(symbol, expirations, strike_window) -> contracts[]`
  - 当前文件：`collector/providers/base.py`
  - 当前实现：`UnderlyingSnapshot`、`OptionContractSnapshot`、`OptionChainSnapshot`、`OptionChainProvider`
- [x] 新增 IB adapter skeleton：
  - `collector/providers/ib_option_chain_provider.py`
  - 只定义 `source=ib_internal` 和接口入口；实采逻辑留给 3D-2
- [x] 新增 PostgreSQL schema：
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
- [x] 新增只读 API skeleton：
  - `GET /api/options/:symbol/snapshot`
  - `GET /api/chain/:symbol`
  - `GET /api/gex/:symbol`
  - `GET /api/status/options`
  - missing snapshot 返回 `freshness=missing`；不触发 provider；不等待 IB Gateway
- [x] Migration rollback plan：drop new tables only；do not touch `iv_history` or `price_history`.
- [x] Migration executed：`NODE_ENV=production node src/migrate.js`
- [x] Local API smoke verified：
  - `curl -f "http://127.0.0.1:3001/api/options/PLTR/snapshot"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/chain/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/gex/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/status/options"` → `table_exists=true`, `covered_count=0`, `missing_count=67`

**Phase 3D-2 — IB Gateway Internal Adapter**
- [x] 新增 `collector/providers/ib_option_chain_provider.py`
- [x] 新增 `collector/collect_options.py`
  - provider → `option_chain_snapshots`
  - contracts → `option_contract_snapshots`
  - job status → `provider_fetch_jobs`
- [x] 使用 IB API `reqSecDefOptParams` 获取 expirations / strikes，避免用 ambiguous `reqContractDetails` 拉全链。
- [x] 限定过渡阶段采集范围：
  - symbols：先 `AAPL`, `SPY`, `QQQ`, `PLTR`
  - DTE：7-60 days
  - strikes：spot ±15% 或每边最多 20 个 strikes
  - rights：call + put
- [x] 对每个 option contract 请求 market data snapshot：
  - bid / ask / last / volume / open interest
  - model greeks：iv / delta / gamma / theta / vega
- [x] 记录 IB pacing / timeout / empty contract：
  - 每 symbol 最大运行时间
  - 每批 contract 数量
  - provider error code
  - snapshot completeness percentage
- [x] 失败策略：
  - underlying 缺失：整 symbol snapshot fail，不写 partial GEX
  - chain 缺失：写 job failure，不覆盖旧 snapshot
  - 部分 contract 缺 Greeks/OI：写 contract row，但 `completeness` 降低；GEX confidence 降级
- [x] Runtime smoke with IB Gateway：
  - Command：`OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 IB_OPTION_CLIENT_ID=43 IB_TIMEOUT=25 venv311/bin/python collect_options.py`
  - Result：snapshot written，latest `snapshot_id=2`
  - API verified：`/api/options/PLTR/snapshot` 返回 `source=ib_internal`、`provider_status=partial`、`contract_count=10`
  - API verified：`/api/status/options` 返回 `covered_count=1`、`covered_symbols=["PLTR"]`
- [x] Data quality follow-up 3D-2A：
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
- [x] Transition provider decision：
  - 使用 `tt_internal` 作为当前过渡 option-chain metadata provider。
  - 后续正式上线前仍需购买具备授权/再分发权利的数据源。
  - public API 仍然只读 PostgreSQL snapshot，不同步调用 tastytrade 或 IB。
- [x] 新增 tastytrade chain metadata adapter：
  - `collector/providers/tastytrade_option_chain_provider.py`
  - `OPTION_PROVIDER=tt_internal`
  - REST endpoint：`/option-chains/{symbol}/nested`
  - 保存 expiration、strike、call/put contract symbol、call/put streamer symbol 到 `option_contract_snapshots.raw_contract`
  - `source=tt_internal`
  - `provider_status=metadata_only`
- [x] 新增 tastytrade diagnostic：
  - `collector/debug_tastytrade_option_chain.py`
  - Command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
- [x] tastytrade DXLink quote/Greeks/OI merge：
  - 获取 API quote token
  - 订阅 underlying symbol 与 option streamer symbols
  - 记录 raw `Quote` / `Trade` / `Summary` / `Greeks` / `TheoPrice` / `Profile` payload
  - 将 bid / ask / last / volume / open_interest / iv / delta / gamma / theta / vega / rho merge 到 contract snapshot
  - 将 underlying bid / ask / trade price merge 到 chain snapshot
  - 若 TT 不返回 OI 或 Greeks，明确降级：quote-only / no-gex，不进入 GEX 计算
- [x] Runtime smoke with tastytrade：
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
  - Credential handling：使用 `.env` remember-token 自动续期；secret 未写入仓库
- [x] Gate before GEX：
  - GEX / Wall / Gamma Flip 只有在 gamma + OI completeness 达标后才计算
  - `metadata_only` snapshot 不参与 GEX
- [x] GEX compute job：
  - 新增 `collector/compute_gex.py`
  - 只读 PostgreSQL latest option-chain snapshot，不调用 IB / tastytrade / provider
  - 写入 `gex_snapshots`
  - 写入 `gex_by_strike_snapshots`
  - Upsert by `snapshot_id`，同一 option snapshot 重算不会重复堆数据
  - Fail-closed：缺 spot、缺 gamma/OI、missing ratio 超过 `GEX_MAX_MISSING_RATIO=0.25` 时不写假 GEX
- [x] GEX by contract：
  - call gex = `gamma * open_interest * 100 * spot^2`
  - put gex = `-gamma * open_interest * 100 * spot^2`
  - 缺 gamma 或 OI 的 contract 不参与 GEX，并计入 missing ratio
- [x] GEX by strike：
  - `net_gex = sum(call_gex + put_gex)` by strike
  - `call_oi`, `put_oi`, `call_volume`, `put_volume` by strike
- [x] Global GEX：
  - 跨 expiry、strike 聚合 `net_gex`
  - 输出 `positive`, `negative`, `near_zero`
- [x] Local Gamma：
  - V1 默认使用 spot ±1%
  - Future candidates：spot ± expected move、最近 3-5 个 strikes
- [x] Call Wall / Put Wall：
  - Call Wall：最大 call-side positive exposure 或最大 call OI strike
  - Put Wall：最大 put-side negative exposure 或最大 put OI strike
  - 同时保存 `wall_method=gex` 或 `wall_method=oi`，避免混淆 OI Wall 与 Gamma Wall
- [x] Gamma Flip：
  - 构建 spot ±10% price grid
  - 对每个 grid price 重新计算每张期权 gamma 和 net GEX
  - flip = net GEX 穿越 0 的价格；无穿越则取 abs(net_gex) 最小点
  - 输出 `gamma_curve`, `gamma_flip`, `spot_vs_flip_distance_pct`, `gamma_regime`, `confidence`
- [x] PCR：
  - `pcr_oi = total_put_oi / total_call_oi`
  - `pcr_volume = total_put_volume / total_call_volume`
- [x] Max Pain：
  - V1 基于当前 selected contracts aggregate 计算单一 `max_pain`
  - Future：对每个 expiry 独立计算 nearest expiry max pain + aggregate max pain
- [x] Confidence：
  - 根据 missing Greeks ratio、missing OI ratio、bid/ask availability、snapshot age 计算 high / medium / low
- [x] Runtime smoke with GEX：
  - Command：`GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py`
  - Result：`gex_id=1`、`snapshot_id=6`、`global_gex=112882349.11`、`confidence=high`
  - API verified：`/api/gex/PLTR` returned `global_gex=112882349.1123`、`local_gamma=25163724.2306`、`gamma_regime=positive`、`call_wall=135`、`put_wall=135`、`max_pain=135`、`pcr_oi=0.3634`、`pcr_volume=0.4672`
  - Note：API `freshness=stale` because the source option snapshot was older than the 15-minute API freshness threshold at verification time

**Phase 3D-4 — API Layer**
- [x] `GET /api/options/:symbol/snapshot`
  - 返回 latest chain snapshot metadata，不返回全量 contracts unless `includeContracts=true`
- [x] `GET /api/gex/:symbol`
  - 返回 `global_gex`, `local_gamma`, `call_wall`, `put_wall`, `gamma_flip`, `gamma_curve`, `pcr`, `max_pain`, `freshness`
- [x] `GET /api/chain/:symbol`
  - 只读 latest snapshot；默认分页 / strike range / expiry filter
- [x] `GET /api/status/options`
  - 返回 watchlist option-chain coverage、latest snapshot age、missing/stale symbols、provider failure count
- [x] API 不同步调用 IB Gateway；missing/stale 只返回状态，不在用户请求里等待 provider。

**Phase 3D-5 — Frontend Integration**
- [x] `/analyze?symbol=...` 读取 `/api/gex/:symbol`
- [x] 若 GEX fresh：
  - 替换 mock GEX / Call Wall / Put Wall / Gamma Flip / PCR / Max Pain
  - 显示 source、snapshot time、confidence
- [x] 若 GEX missing/stale/unusable：
  - 保留 price-only 或 IV-only 页面
  - 显示 GEX stale/unusable 状态，不把旧 GEX 当 fresh
  - 不显示 mock wall/gex 作为真实数据
- [x] 支持 GEX-only fallback：
  - 如果 symbol 有真实 GEX + price，但暂无 `/api/metrics`，仍展示真实 GEX / Walls / PCR / Max Pain
  - IV Rank 区域显示 unavailable，不生成策略腿推荐
- [x] UI safety fix：
  - Tab4 `Call Wall == Put Wall` 时不再出现 0-span canvas range
- [x] Verification：
  - Frontend build：`npm run build`
  - Production API prepared：PLTR `snapshot_id=7`、`/api/gex/PLTR` returned `freshness=fresh`、`confidence=high`
  - Browser plugin smoke attempted but blocked by runtime setup error：`Cannot redefine property: process`
- [x] `/scan` 新增 filters：
  - gamma regime
  - near call wall / near put wall
  - high local gamma
  - unusual OI / volume：当前实现 total OI / total volume / volume-to-OI ratio；OI delta 异常需后续连续 snapshot 历史
  - IV Rank + GEX combined scanner
  - API behavior：仍只读 latest `iv_history` / `price_history` / `gex_snapshots` / `gex_by_strike_snapshots`，不在 request path 同步调用 IB/TT/provider
  - Frontend behavior：扫描器新增 Gamma 环境、Wall 距离、Local Gamma、OI、Volume、IV+GEX 排序控件；结果列显示 GEX 状态、总 GEX、最近 wall 距离
  - Verification deferred per instruction

**Phase 3D-6 — Verification**
- [ ] Unit tests：
  - GEX sign calculation
  - wall selection
  - gamma flip interpolation / nearest-zero fallback
  - PCR division-by-zero
  - confidence downgrade
- [ ] Integration tests：
  - seeded option snapshot → `/api/gex/:symbol`
  - missing snapshot → `freshness=missing`
  - stale snapshot → stale response without synchronous provider call
- [ ] Runtime smoke with IB Gateway：
  - `SYMBOLS=PLTR,AAPL PRICE_PROVIDER=ib_internal OPTION_PROVIDER=ib_internal`
  - record command, source, snapshot counts, missing Greeks/OI ratio, latest snapshot_ts
- [ ] UI smoke：
  - PLTR shows price-only before options snapshot
  - PLTR shows GEX/Wall/Gamma Flip after options snapshot
- [ ] Disclosure:
  - Verification result must distinguish `IB internal verified` from `licensed provider verified`.

**Phase 3D-7 — Production Provider Cutover**
- [x] Evaluate licensed providers for OPRA/options chain redistribution.
  - First candidate：Massive/Polygon options chain snapshot
    - Official docs show option chain snapshot endpoint includes per-contract pricing, Greeks, IV, quotes/trades, open interest, and underlying asset fields.
    - Docs distinguish 15-minute delayed vs real-time options plan access.
    - Must confirm commercial redistribution/display rights before public paid product use.
  - Second candidate：Intrinio options chain / options data APIs
    - Needs commercial confirmation for OPRA redistribution/display and Greeks/OI completeness.
  - Not sufficient for public product：IB internal, TT internal, yfinance.
- [ ] Implement licensed adapter behind same provider interface.
  - Blocked until provider selected, API key available, and license permits the intended product display/redistribution.
  - Adapter target remains `collector/providers/base.py::OptionChainProvider`; API/frontend contract should not change.
- [ ] Run side-by-side comparison：IB internal vs licensed provider for AAPL/SPY/QQQ/PLTR.
  - Blocked until licensed adapter can fetch snapshots.
- [ ] Cutover condition：
  - licensed provider snapshot completeness acceptable
  - API contract unchanged
  - UI source displays licensed provider
  - IB internal disabled for public product path

**Phase 3C — Cache & Freshness Architecture（真实数据源上线体验）**
- [x] 定义 snapshot freshness policy：IV/HV daily，earnings daily，option chain 1-5min，OI daily/provider cadence，GEX/Walls/Gamma Flip 随 chain refresh，scanner 1-5min
- [x] PostgreSQL schema：`option_chain_snapshots`、`gex_snapshots`、`symbol_metrics_snapshots`、`scanner_results_snapshots`、`provider_fetch_jobs`
  - `option_chain_snapshots` / `gex_snapshots` / `provider_fetch_jobs` 已存在
  - 新增 `symbol_metrics_snapshots`
  - 新增 `scanner_results_snapshots`
- [x] API contract：真实数据 endpoint 返回或补充 `snapshot_ts`、`source`、`freshness`、`is_stale`、`refresh_status`
  - `/api/metrics`：保留原字段，新增 metadata
  - `/api/gex/:symbol` / `/api/chain/:symbol`：missing/stale 只 enqueue refresh，不同步调用 provider
  - `/api/scan`：读取 scanner materialized rows，并返回 freshness metadata
- [x] `/api/gex/:symbol` 行为：fresh → 200 data；stale → 200 stale data + enqueue refresh；missing → queued 状态；不可同步等待 provider
- [x] `/api/chain/:symbol` 行为：只读最新 provider snapshot；不从用户请求路径直连本地 Mac Studio / IB Gateway
- [x] `/api/scan` 行为：读取 `scanner_results_snapshots` latest materialized result；不在请求时全市场重算
- [x] `provider_fetch_jobs` worker：记录 symbol、job_type、status、attempts、last_error、created_at、started_at、finished_at
  - `collector/run_refresh_worker.py`
  - supports `symbol_metrics_snapshot`, `option_chain_snapshot`, `scanner_materialize`
  - unsupported/unconfigured licensed provider jobs fail closed with `last_error`
- [x] Refresh rate limit：单 symbol/job/provider 至少 60 秒间隔入队；worker 记录 provider budget usage
  - `provider_request_usage` tracks provider/date/job_type request_count vs request_budget
  - 同一用户手动 refresh 限频仍待 product auth layer
- [x] API memory cache：metrics 60s，GEX/chain 120s，scanner 60s（env 可调）
- [x] Frontend stale-while-revalidate：当前 Analyze/Scan 在 loading 时保留已有结果；API 提供 freshness/refresh_status
- [x] 前端状态文案：已有 GEX fresh/stale/unusable、price stale、missing data 文案；scanner rows 暴露 freshness metadata
- [x] 缺失数据体验：不要用 mock data 伪装真实数据；missing snapshot 返回 queued/missing 状态
- [x] 监控：provider fetch failure、stale snapshot age、job queue backlog、rate-limit hit、empty snapshot count
  - `/api/status/cache` returns job summary, recent failures, scanner stale age, empty/metadata-only option snapshot count, provider budget usage
- [x] 回滚策略：关闭 materialize job 后 `/api/scan` 仅返回已有 snapshot；保留旧 endpoint array contract 不破坏前端

**大单 / Unusual Activity（免费方案）**
- [x] **Phase 3E-1 OI Delta Snapshot Layer**
  - 新增 contract-level OI history / delta 表
  - 从连续 `option_contract_snapshots` 计算 OI delta
  - 输出 `symbol`, `contract_symbol`, `expiry`, `strike`, `right`, `open_interest`, `previous_open_interest`, `oi_delta`, `volume`, `volume_oi_ratio`, `snapshot_ts`, `source`
  - Fail-closed：没有 previous snapshot 时不标记 unusual，只标记 baseline
  - 不改变交易策略逻辑
- [x] Phase 3E-2 Unusual OI scanner：
  - 按 OI delta、volume/OI、absolute volume、DTE、bid/ask completeness 过滤
  - 只读预计算 snapshot，不在用户请求时计算全链
- [x] Phase 3E-3 `/scan` 新增过滤器：
  - Unusual OI
  - PCR 异常
  - GEX 环境组合
  - near wall + unusual OI combined signal
- [x] Phase 3E-4 `/analyze` Unusual Activity tab/card：
  - 展示 top contracts
  - 标注 baseline / confirmed delta / stale / missing
  - 不把 volume-only proxy 写成“机构建仓确认”
- [x] Runtime verification：
  - Migration completed against Railway PostgreSQL.
  - `venv311/bin/python materialize_oi_delta.py` wrote 10 PLTR OI delta rows, `status=confirmed`, `unusual=0`.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows.
  - Local API verified：`/api/unusual/PLTR?limit=5` returned confirmed rows with `oi_delta=0`, `status=quiet`.
  - Local API verified：`/api/status/cache` returned `oi_delta.row_count=10`, `status_counts.confirmed=10`.
- [ ] （付费扩展）Unusual Whales API：真实 sweep / dark pool 数据，$50/月

**Phase 3F — Scanner UX/Data Completion**
- [x] Scanner direction：materialized trend fields from `price_history` replace `待接入趋势`.
- [x] Scanner earnings risk：display `earnings_date` and warn when event is within 0-14 days.
- [x] Scanner row navigation：click row navigates directly to `/analyze?symbol=XXX&tab=0`.
- [x] Analyze URL sync：automatic data-load URL normalization uses replace/skip when params already match, avoiding an extra `/analyze?symbol=XXX` browser-history entry.
- [x] Scanner API cache key includes unusual/PCR filters, preventing filtered results from reusing stale cache entries from different filter combinations.
- [x] Scanner filter UX copy：default flow uses opportunity presets; advanced filters keep English market terms with Chinese explanations for OI, Volume, Local Gamma, OI Delta, Unusual Count and Put/Call Ratio.
- [x] Scanner universe copy：replace visible watchlist ticker chips with a data-coverage summary; document watchlist as transitional Phase 3 data pool, not final product scope.
- [x] Verification：
  - Migration completed against Railway PostgreSQL after adding trend columns.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows with trend fields.
  - Local API verified：`/api/scan?minIvr=0&maxIvr=100&limit=3` returned `trend_label`, `trend_score`, `trend_change_5d`, `trend_rsi14`, MA fields, and `earnings_date`.
  - Production API still requires Railway deploy to expose new `/api/scan` response fields; database rows are already materialized.

**Phase 3G — Scanner Universe Expansion**
- [ ] Replace transitional 67-symbol watchlist with a broader scanner universe.
- [ ] Universe filters：
  - market cap minimum / maximum
  - stock price range
  - underlying share volume / dollar volume
  - optionable flag
  - option chain liquidity：bid/ask spread, total OI, total volume
  - sector / ETF category
  - earnings window include/exclude
- [ ] Keep scanner materialized：universe expansion must still write `scanner_results_snapshots`; user requests must not run full-market provider calls synchronously.

**Phase 3H — Contract-Level Scanner Filters**
- [x] Add optional advanced filters for contract-level strategy inputs：
  - DTE min/max
  - absolute Delta min/max
  - max bid/ask spread percentage
  - per-contract minimum OI
  - per-contract minimum volume
- [x] Backend behavior：blank values do not filter; provided values require at least one latest option contract snapshot matching the constraints.
- [x] Scanner result display：show contract data summary per symbol, including DTE range, absolute Delta range, average bid/ask spread, quoted contract count and Greeks coverage count.
- [x] Data source：current `option_contract_snapshots` already stores expiry, bid, ask, volume, open_interest, IV and Greeks from IB/TT transitional adapters.
- [x] Product boundary：these filters are optional advanced controls; default scanner presets should work without the user understanding Greeks.
- [x] Strategy parameter presets：
  - 不限：不按合约参数过滤
  - 保守：DTE 30-60, Abs Delta 0.10-0.20, Max Spread 10%, Contract OI >= 500, Contract Vol >= 50
  - 标准：DTE 30-60, Abs Delta 0.16-0.30, Max Spread 15%, Contract OI >= 100, Contract Vol >= 10
  - 进取：DTE 7-45, Abs Delta 0.25-0.40, Max Spread 20%, Contract OI >= 50, Contract Vol >= 5
  - 短线：DTE 1-14, Abs Delta 0.20-0.40, Max Spread 20%, Contract OI >= 100, Contract Vol >= 20
  - 流动性优先：DTE 7-60, Abs Delta 0.05-0.50, Max Spread 8%, Contract OI >= 1000, Contract Vol >= 100
- [x] Advanced edits mark the strategy parameter profile as custom.
- [x] Default scanner profile is `不限` so missing or narrow contract-level snapshots do not hide symbol-level results. Users must explicitly select 保守 / 标准 / 进取 / 短线 / 流动性优先 to activate DTE/Delta/spread/OI/volume filters.

## 🏗️ V3 — Product
- [ ] User authentication (NextAuth or Clerk)
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
- [ ] Portfolio dashboard: 追踪开仓，P/L，综合 Greeks
- [ ] PostgreSQL: users / subscriptions / positions 表
- [ ] Payment integration (Stripe)
- [ ] Custom domain 配置
