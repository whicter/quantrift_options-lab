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
- [x] 数据源方案：Tastytrade API（IV Rank，免费）+ 授权期权链数据源（生产）+ IB API（内部研究/算法验证）+ yfinance（fallback）
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
- [ ] Mac Studio collector：配 .env，python auth.py --login，加 cron
- [x] Vercel: 部署 frontend/，注入 VITE_API_BASE_URL → Railway URL
- [x] 前端：mock data → 真实 API 调用
- [x] 生产验收：quantrift.io 308 → www，www 200，Railway /health、/api/metrics、/api/scan 均返回成功（2026-07-14）

**Mac Studio 数据采集脚本**
- [x] Python 定时脚本：collector/collect.py（每日 4:30pm ET，采集 IV → 写入 Railway PostgreSQL）
  - Tastytrade 认证：collector/auth.py，remember-token 自动续期，过期时发邮件提醒
  - 采集字段：iv_rank, iv30, hv30/60/90, iv_hv_diff, earnings_date, term_structure
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
- [ ] PCR（Put/Call Ratio）：OI + 成交量两个维度，辅助判断市场情绪
- [ ] IV Skew 图：各行权价 IV 可视化，put skew 大 = 市场恐慌/保险需求高
- [ ] Max Pain 计算：到期时期权买方亏损最大的行权价
- [ ] OI 集中度热图：大量 OI 堆积的行权价 → 支撑/阻力参考
- [ ] /analyze 页面新增：GEX 环境指示（正/负）、Call Wall、Put Wall、Global GEX、Local Gamma、Gamma Flip、Max Pain、PCR

**大单 / Unusual Activity（免费方案）**
- [ ] 每日 OI 变动追踪：OI delta 异常大的合约 → 机构建仓信号
- [ ] Unusual OI scanner：按 OI 变化量 / 成交量 vs OI 比值筛选
- [ ] /scan 新增过滤器：Unusual OI、PCR 异常、GEX 环境
- [ ] （付费扩展）Unusual Whales API：真实 sweep / dark pool 数据，$50/月

## ✅ Done (Phase 3C — Technical Support Structure / Confluence)

### 产品目标
- [x] `/analyze` 为任意已有价格历史的 symbol 显示真实股票技术支撑/压力结构，不依赖 mock symbol 白名单
- [x] 股票技术结构与期权结构分层展示；Put/Call OI Wall、GEX 缺失时明确显示 missing，不生成替代数字
- [x] 将多个接近价位聚合为 S1/S2/S3 与 R1/R2/R3 区域，并列出每个区域的证据、强度、来源和数据日期

### 数据与计算
- [x] 使用 `price_history` 最近 250 根日线计算 50DMA、100DMA、200DMA 与 ATR14
- [x] 使用常规交易时段 `price_history_30m` 计算固定窗口 Volume Profile、POC 与主要 HVN
- [x] Volume Profile 明确返回 bar count、price range、bin size、window start/end 和 `approximation=bar_typical_price`
- [x] 自动选择最近高成交量 Swing Low/High 作为 Anchored VWAP 锚点，并返回 anchor date/type/reason
- [x] 使用锚点之后的常规交易时段 30M OHLCV 计算 Anchored VWAP；数据不足时 fail closed
- [x] 将日线聚合为周线，计算周 MA4/MA12/MA20/MA40 与周线 Pivot High/Low
- [x] 复用真实日线 Pivot 并按距离现价排序，避免只按历史触碰次数输出远端价位
- [x] 读取最新 `gex_snapshots`，保留 Gamma Regime、Gamma Flip、Call/Put GEX Wall
- [x] 从最新可用 `option_contract_snapshots` 聚合 7–60 DTE Call/Put OI，计算最大 Call OI Wall 与 Put OI Wall
- [x] 严格区分 OI Wall 与 GEX Wall，并返回期权快照 source、snapshot time、freshness 和 coverage

### Confluence Engine
- [x] 将 Volume Profile、Anchored VWAP、50/100/200DMA、日/周线结构、周线 MA、GEX 与 OI Wall 标准化为统一 evidence
- [x] 先按现价区分 support/resistance，再使用 `max(0.5 × ATR14, 0.5% × spot)` 聚类，避免跨越现价误合并
- [x] 每个区域返回 low/high/center、score、strength、distance_pct 和可解释 evidence 列表
- [x] 技术证据在期权数据缺失时仍可独立形成区域；期权数据不得成为技术结构的硬依赖

### API 与前端
- [x] 新增 `GET /api/technical-levels/:symbol`，校验 symbol 并返回 ready/missing/error 状态
- [x] 将 technical-levels route 挂载到 Express 生产入口
- [x] `/analyze` 搜索任意 symbol 时加载技术结构；即使没有旧 mock 分析数据也显示真实技术结构
- [x] 新增支撑结构面板：顶部指标、垂直价格地图、支撑/压力区域、证据 chips、期权数据状态
- [x] GOOG 示例显示近期 Volume Profile、AVWAP、DMA 与周线结构；GEX/OI 按实时快照显示 ready/stale/missing
- [x] 页面覆盖 loading、missing、stale、partial、network error，所有 null 值不得导致 NaN 或 Canvas/React 崩溃

### 测试与验收
- [x] 后端单测覆盖 DMA、ATR、Volume Profile、AVWAP anchor、周线结构、聚类和期权 missing/ready（8/8）
- [x] 前端纯函数测试覆盖 API payload 标准化和缺失状态（3/3）
- [x] `node --test server/test/technicalLevelsRoute.test.js` 通过本阶段全部后端测试
- [x] 前端 `npm run lint` 零错误、`npm run build` 成功
- [x] GOOG 生产数据 smoke：技术结构可计算；期权按真实快照返回，缺失时不伪造 Wall/GEX
- [x] 更新 README、ARCHITECTURE、wiki 和 task；本阶段标题及全部条目标记 ✅

> 全仓库既有回归状态（不属于 Phase 3C）：`node --test server/test/*.test.js` 为 46/55，
> 9 个失败来自尚未纳入当前 server 的 Clerk/Stripe 依赖、`routes/options.js`、新版 metrics/scan 测试接口；
> 前端全量测试另有策略数量与 notes 数字化两项既有 backlog。Phase 3C 目标测试、lint 与 build 全绿。

## 🏗️ V3 — Product
- [ ] User authentication (NextAuth or Clerk)
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
- [ ] Portfolio dashboard: 追踪开仓，P/L，综合 Greeks
- [ ] PostgreSQL: users / subscriptions / positions 表
- [ ] Payment integration (Stripe)
- [ ] Custom domain 配置
