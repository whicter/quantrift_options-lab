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
- [x] Strategy filter 仍在前端基于当前 IV-only recommendation 过滤
- [x] Direction column 明确显示 `待接入趋势`，不再把 mock MA/RSI/MACD 当真实趋势

### Current Scanner Logic
- [x] 当前 scanner 是 IV-only 第一版，不是完整 options scanner
  - `IV Rank >= 50`：默认 `Iron Condor`，理由是高 IV 且趋势/链数据未接入时优先使用定义风险中性卖方结构
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
- [ ] Production API verified after deploy：Railway `/api/scan?minIvr=0&maxIvr=100&limit=10`
- [ ] UI verified：`/scan` 点击立即扫描显示真实 rows

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
- [ ] 用户输入标的 → 系统分析（不再要求用户先选策略）
- [ ] 技术分析层：MA50/200、RSI、MACD → 方向评分
- [ ] IV 分析层：IV Rank + IV vs HV → 卖方/买方判断
- [ ] 事件风险：财报日检测
- [ ] 策略矩阵 → 推荐具体策略 + 建议 Delta/DTE/宽度参数

**功能**
- [ ] 用 live 链数据填充推荐策略的 legs（自动选择最优行权价）
- [ ] Options scanner: IV Rank / spread width / liquidity / DTE / Greeks 阈值
- [ ] Push notifications: email + web push 当扫描命中条件

**GEX + 期权链分析（生产需授权数据源，IB 仅用于内部验证）**
- [ ] Phase 3B — GEX Data Model Design：定义 Call Wall / Put Wall / Global GEX / Local Gamma / Gamma Flip / OI Wall / Gamma Wall
- [ ] 数据源 adapter 抽象：provider.fetchOptionChain(symbol)、provider.fetchUnderlying(symbol)，允许从 IB internal adapter 切换到授权 provider
- [ ] PostgreSQL schema：option_chain_snapshots、gex_snapshots、wall_snapshots / chain_stats
- [ ] GEX by strike：Σ(Gamma × OI × 100 × Spot²)，正负 GEX 判断做市商对冲方向
  - 正GEX = 价格稳定，适合卖方；负GEX = 波动放大，慎卖方
  - Call Wall / Put Wall / GEX wall = 价格磁铁/阻力位，但需区分 OI Wall 与 Gamma Wall
- [ ] Global GEX：跨到期、跨行权价聚合 net GEX
- [ ] Local Gamma：当前价附近（如 spot ±1%、expected move、最近 3-5 个 strikes）的 Gamma/GEX 集中度
- [ ] Gamma Flip：net GEX 从正变负或负变正的关键价格区间
  - 计算方式：构建 spot ±10%（或可配置范围）的 price grid，对每个价格点重新计算每张期权 gamma，再聚合 net_gex(price)
  - Flip 点定义：net_gex(price) 穿越 0 的价格；如无精确穿越，取 abs(net_gex(price)) 最小的价格
  - 展示字段：gamma_flip、spot_vs_flip_distance_pct、gamma_regime（positive/negative/near_flip）、confidence、snapshot_ts、source
  - 操作意义：positive gamma 更偏震荡/均值回归；negative gamma 更偏趋势/波动放大；跌破/突破 flip 代表 dealer hedge regime 可能切换
  - 风险说明：Gamma Flip 不是独立买卖信号，必须和 Call Wall / Put Wall / Local Gamma / IV / 事件风险一起解读
- [ ] Gamma regime 解释文案：前端输出“Spot is above/below gamma flip”以及对应的 volatility-dampening / volatility-amplifying 解释
- [ ] Gamma Flip API contract：/api/gex/:symbol 返回 gamma_curve（price, net_gex）、gamma_flip、current_spot、distance_pct、regime
- [ ] PCR（Put/Call Ratio）：OI + 成交量两个维度，辅助判断市场情绪
- [ ] IV Skew 图：各行权价 IV 可视化，put skew 大 = 市场恐慌/保险需求高
- [ ] Max Pain 计算：到期时期权买方亏损最大的行权价
- [ ] OI 集中度热图：大量 OI 堆积的行权价 → 支撑/阻力参考
- [ ] /analyze 页面新增：GEX 环境指示（正/负）、Call Wall、Put Wall、Global GEX、Local Gamma、Gamma Flip、Max Pain、PCR

**Phase 3C — Cache & Freshness Architecture（真实数据源上线体验）**
- [ ] 定义 snapshot freshness policy：IV/HV daily，earnings daily，option chain 1-5min，OI daily/provider cadence，GEX/Walls/Gamma Flip 随 chain refresh，scanner 1-5min
- [ ] PostgreSQL schema：`option_chain_snapshots`、`gex_snapshots`、`symbol_metrics_snapshots`、`scanner_results_snapshots`、`provider_fetch_jobs`
- [ ] API contract：所有真实数据 endpoint 返回 `snapshot_ts`、`source`、`freshness`、`is_stale`、`refresh_status`
- [ ] `/api/gex/:symbol` 行为：fresh → 200 data；stale → 200 stale data + enqueue refresh；missing → queued/unavailable 状态；不可同步等待 provider
- [ ] `/api/chain/:symbol` 行为：只读最新授权 provider 快照；不从用户请求路径直连本地 Mac Studio / IB Gateway
- [ ] `/api/scan` 行为：读取 `scanner_results_snapshots` 或 latest materialized result；不在请求时全市场重算
- [ ] `provider_fetch_jobs` worker：记录 symbol、job_type、status、attempts、last_error、created_at、started_at、finished_at
- [ ] Refresh rate limit：单 symbol 至少 60 秒间隔；同一用户手动 refresh 限频；全局 provider request budget 记录
- [ ] API memory cache：metrics 30-60s，GEX 30-120s，scanner 1-5min
- [ ] Frontend stale-while-revalidate：保留上一份数据，后台刷新，不因 refresh 清空页面
- [ ] 前端状态文案：fresh / stale but usable / refreshing / missing / unavailable
- [ ] 缺失数据体验：不要用 mock data 伪装真实数据；显示“正在准备数据”或“该 symbol 暂无授权数据”
- [ ] 监控：provider fetch failure、stale snapshot age、job queue backlog、rate-limit hit、empty snapshot count
- [ ] 回滚策略：关闭 manual refresh，仅返回已有 snapshot；保留旧 endpoint contract 不破坏前端

**大单 / Unusual Activity（免费方案）**
- [ ] 每日 OI 变动追踪：OI delta 异常大的合约 → 机构建仓信号
- [ ] Unusual OI scanner：按 OI 变化量 / 成交量 vs OI 比值筛选
- [ ] /scan 新增过滤器：Unusual OI、PCR 异常、GEX 环境
- [ ] （付费扩展）Unusual Whales API：真实 sweep / dark pool 数据，$50/月

## 🏗️ V3 — Product
- [ ] User authentication (NextAuth or Clerk)
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
- [ ] Portfolio dashboard: 追踪开仓，P/L，综合 Greeks
- [ ] PostgreSQL: users / subscriptions / positions 表
- [ ] Payment integration (Stripe)
- [ ] Custom domain 配置
