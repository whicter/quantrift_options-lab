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
- [x] 数据源方案：Tastytrade API（IV Rank，免费）+ IB API（期权链，免费）+ yfinance（fallback）
- [x] 数据采集节点：Mac Studio（复用已有 IB Gateway，clientId=2 与 futures bot 共存）
- [x] 总数据成本：$0/月（Railway 托管 ~$5/月）
- [x] 冷启动方案：Tastytrade API 第一天即可提供 IV Rank，同时自积累历史数据
- [x] Tastytrade 账户注册完成（whicter.han@gmail.com）
- [x] Tastytrade API 测试通过：/market-metrics 字段确认，认证流程完整验证
- [x] remember-token 自动续期机制验证通过（全自动，无需人工介入）

**Infrastructure**
- [ ] Railway: 创建 PostgreSQL Service，获取 DATABASE_URL
- [ ] Railway: 创建 Node.js Service，部署 server/，注入 DATABASE_URL
- [ ] 跑 migrate.js 建表（iv_history, scanner_configs）
- [x] 建表 schema 已定义：server/src/migrate.js
- [ ] Mac Studio collector：配 .env，python auth.py --login，加 cron
- [ ] Vercel: 部署 frontend/，注入 VITE_API_URL → Railway URL
- [ ] 前端：mock data → 真实 API 调用

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

**GEX + 期权链分析（免费，基于 IB 期权链）**
- [ ] GEX by strike：Σ(Gamma × OI × 100 × Spot²)，正负 GEX 判断做市商对冲方向
  - 正GEX = 价格稳定，适合卖方；负GEX = 波动放大，慎卖方
  - GEX wall（最大GEX行权价）= 价格磁铁/阻力位
- [ ] PCR（Put/Call Ratio）：OI + 成交量两个维度，辅助判断市场情绪
- [ ] IV Skew 图：各行权价 IV 可视化，put skew 大 = 市场恐慌/保险需求高
- [ ] Max Pain 计算：到期时期权买方亏损最大的行权价
- [ ] OI 集中度热图：大量 OI 堆积的行权价 → 支撑/阻力参考
- [ ] /analyze 页面新增：GEX 环境指示（正/负）、GEX wall 位置、Max Pain、PCR

**大单 / Unusual Activity（免费方案）**
- [ ] 每日 OI 变动追踪：OI delta 异常大的合约 → 机构建仓信号
- [ ] Unusual OI scanner：按 OI 变化量 / 成交量 vs OI 比值筛选
- [ ] /scan 新增过滤器：Unusual OI、PCR 异常、GEX 环境
- [ ] （付费扩展）Unusual Whales API：真实 sweep / dark pool 数据，$50/月

## 📺 盘中即时分析 + Weekly Recap 系统

> 参考：华尔街咖啡馆系统解构（详见 wiki.md）
> 原则：先 mock data 画完全部 UI，视觉确认后再接真实数据

### Phase 1：盘中即时分析 UI（mock data）

**1.1 /analyze 页面重构为4个Tab**
- [ ] Tab 导航组件：今日概览 / 日内变化 / 数据解读 / 信号追踪
- [ ] URL 记忆 Tab 状态（?tab=overview 等）

**1.2 Tab 1 · 今日概览**
- [ ] 行业标签 chips（sector tags，mockAnalysis.js 新增字段）
- [ ] 三个问题引导卡（①期权结构 ②波动来源 ③关键位置）——先问题，再答案
- [ ] 综合结论卡：格局 badge / 动量 badge / 信号 badge + 核心结论文字

**1.3 Tab 2 · 日内变化（趋势分析）**
- [ ] Kalman Filter 趋势主图（Canvas）：价格线 + KF平滑带 + 支撑阻力区填充 + Weekly Fibo线
- [ ] 子图1：Trend Spread 颜色分级柱状图（红绿渐变，动能强弱）
- [ ] 子图2：Weekly Spread Context 柱状图（周级别共振）
- [ ] 输出 badge 区：格局（多头/空头）/ 动量（向上/向下增强）/ 信号（延续/反转）
- [ ] 辅助3格：趋势格局 / 期权结构标签 / RVol（相对量能，今日量 ÷ 近20日均量）

**1.4 Tab 3 · 数据解读（期权市场）**
- [ ] GEX by Strike 柱状图（Canvas）：
  - 绿色柱 = 正GEX（Call主导/阻力），红色柱 = 负GEX（Put主导/加速）
  - Put Wall 红色虚线 / Call Wall 绿色虚线 / 现价蓝色竖线
  - 柱顶数值标注（如 744K）
- [ ] 三数字行：GEX总量（$）/ PCR(OI) / IV(ATM)
- [ ] 期权大单异动列表：`[PUT/CALL] $[行权价] @ [日期] (Vol: [成交量])`
- [ ] 结论文字（价格与Wall的关系 + GEX量级 + PCR解读）

**1.5 Tab 4 · 信号追踪（筹码标尺）**
- [ ] 主力筹码标尺（Integrated Price Axis，Canvas竖向）：
  - 竖轴价格刻度
  - 当前价蓝色标注点
  - Call Wall 红色横线（阻力防线）
  - Put Wall 绿色横线（支撑铁底）
  - OI分布热图（筹码密度填充）
- [ ] 上方压力：距Call Wall的% + $
- [ ] 下方支撑：距Put Wall的% + $
- [ ] 观察结论文字 + 盯哪个价位说明

**1.6 mockAnalysis.js 扩展（新增字段）**
- [ ] sector: string[]（行业标签）
- [ ] gexTotal: number（美元）
- [ ] gexByStrike: {strike, gex}[]
- [ ] putWall: number / callWall: number
- [ ] pcr: number（OI口径）
- [ ] unusualActivity: {type, strike, date, vol}[]
- [ ] trend: {regime, momentum, signal, rvol}
- [ ] conclusion: string（核心结论）
- [ ] scenarios: {upTrigger, upTarget, downTrigger, downTarget}（用于下周分叉）

---

### Phase 2：Weekly Recap UI（mock data）

**2.1 新路由 /weekly/:symbol**
- [ ] 新建 frontend/src/pages/Weekly.jsx
- [ ] App.jsx 注册路由 `/weekly/:symbol`
- [ ] NavBar 增加入口（或从 /scan 和 /analyze 页面跳转）

**2.2 五个 Section 导航**
- [ ] 横向 Tab 导航：本周定调 / Gamma迁徙 / 交割偏离 / 资金暗线 / 下周分叉
- [ ] 显示 Section 序号（01/05 ... 05/05）

**2.3 Section 01 · 本周定调**
- [ ] 股价 + 周涨跌幅 + 时间范围
- [ ] 日K线迷你图（Mon-Fri，5根蜡烛，Canvas）
- [ ] CME 情绪仪表盘（0-100 指针表，Canvas）：分区标注，50=中性
- [ ] 周高点 / 周低点
- [ ] 本周定调文字

**2.4 Section 02 · Gamma迁徙**
- [ ] 时间轴滑块（Mon / Tue / Wed / Thu / Fri）
- [ ] 每日 GEX by Strike 柱状图快照（切换日期时图表更新）
- [ ] Call Wall 迁移追踪：显示每日 Call Wall 行权价变化
- [ ] Put Wall 迁移追踪：显示每日 Put Wall 行权价变化
- [ ] 一句话结论（如：Gamma墙稳定，12.5美元Call正Gamma支撑价格）

**2.5 Section 03 · 交割偏离**
- [ ] Max Pain vs 周五收盘价横向对比条
- [ ] 偏离百分比（%）+ 方向箭头
- [ ] 解读文字（引力锚定效应说明）

**2.6 Section 04 · 资金暗线**
- [ ] 每日净流向横向柱状图（Mon-Fri，红=流出/绿=流入）
- [ ] 每日数值标注（如 +15.6M）
- [ ] 累计净流向数字（如 +38.9M）
- [ ] 背离信号 badge：YES / NO（价格创新高但资金流出 = YES）
- [ ] 解读文字

**2.7 Section 05 · 下周分叉**
- [ ] 多头剧本卡（绿色）：触发条件 / 目标价 / 观察重点
- [ ] 空头剧本卡（红色）：触发条件 / 目标价 / 观察重点

**2.8 weeklyMock.js 新建**
- [ ] 覆盖3个 symbol 的 mock 数据（含5天 gammaByDay 快照）

---

### Phase 3：真实数据接入

**3.1 IB 期权链采集（collector/collect_chain.py）**
- [ ] 每日 4:15pm ET 拉完整期权链（所有到期日 × 所有行权价）
- [ ] 计算并存储：GEX by Strike / Call Wall / Put Wall / GEX Total / PCR / Max Pain
- [ ] 存入 option_chain 表 + gex_snapshot 表

**3.2 DB 新增表（server/src/migrate.js 扩展）**
- [ ] option_chain：symbol / date / expiry / strike / type / oi / volume / gamma / delta / iv
- [ ] gex_snapshot：symbol / date / gex_total / call_wall / put_wall / pcr_oi / pcr_vol / max_pain / gex_by_strike JSONB / unusual_activity JSONB
- [ ] smart_money：symbol / date / net_flow / divergence BOOLEAN / daily_flows JSONB
- [ ] trend_snapshot：symbol / date / regime / momentum / signal / rvol / kf_band_upper / kf_band_lower

**3.3 server/ 新增 API 端点**
- [ ] GET /api/analyze/:symbol → 完整盘中分析（GEX + 趋势 + 结论合并）
- [ ] GET /api/weekly/:symbol → 完整周回顾（5个section数据）
- [ ] GET /api/chain/:symbol → 完整期权链
- [ ] GET /api/gex/:symbol → GEX by strike + walls + PCR + Max Pain
- [ ] GET /api/unusual/:symbol → 异常OI变化 top 合约
- [ ] GET /api/smart-money/:symbol → 主力资金净流向（按日）

**3.4 Kalman Filter 趋势模块**
- [ ] collector/calc_trend.py：每日 EOD 用 yfinance 拉60天历史价格，运行 Kalman Filter
- [ ] 输出：regime / momentum / signal / kf_band_upper / kf_band_lower
- [ ] 结果写入 trend_snapshot 表
- [ ] server/src/lib/trend.js：读 DB 供 API 返回

**3.5 主力资金近似计算**
- [ ] IB 逐笔数据按订单大小分层（>50手 / >100手 / >500手）
- [ ] 每日汇总净流向写入 smart_money 表
- [ ] 计算背离信号：价格创新高但净流向为负 → divergence=true

**3.6 前端切换真实 API**
- [ ] 新建 frontend/src/api/client.js（统一 fetch 封装，读 VITE_API_URL）
- [ ] Analyze.jsx：mock data → /api/analyze/:symbol
- [ ] Weekly.jsx：weeklyMock → /api/weekly/:symbol
- [ ] Scan.jsx：scanMock → /api/scan

---

### Phase 4：智能增强（差异化优势）

**4.1 条件剧本自动生成**
- [ ] 根据 Call Wall / Put Wall 自动生成多头/空头剧本（触发、目标、观察）
- [ ] 目标价 = 突破方向的下一个 GEX 峰值行权价

**4.2 策略自动绑定**
- [ ] 正GEX + IV高 → 自动推荐 Iron Condor，上沿=Call Wall，下沿=Put Wall
- [ ] 负GEX + 趋势明确 → 推荐方向性 Debit Spread
- [ ] 结论输出直接显示具体行权价 + DTE 建议

**4.3 盘中 GEX 实时刷新**
- [ ] 盘中每30分钟抓一次期权链（9:30am-4:00pm ET）
- [ ] /analyze 页面显示 GEX 结构实时更新时间戳
- [ ] 检测 Call Wall / Put Wall 位移，触发前端提示

**4.4 付费扩展（未来）**
- [ ] Unusual Whales API 接入（$50/月）：真实多交易所 sweep 检测
- [ ] 资金暗线从近似 → 精确 dark pool 数据

---

### 执行顺序

```
Week 1:  Phase 1（盘中分析4个Tab UI，mock data）
Week 2:  Phase 2（Weekly Recap 5个Section UI，mock data）
Week 3:  Railway 部署 + IB collector 链采集 + DB建表
Week 4:  server/ API 实现 + 前端接真实数据
Week 5:  Kalman Filter 趋势模块
Week 6:  智能剧本自动生成 + 策略绑定
```

---

## 🏗️ V3 — Product
- [ ] User authentication (NextAuth or Clerk)
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
- [ ] Portfolio dashboard: 追踪开仓，P/L，综合 Greeks
- [ ] PostgreSQL: users / subscriptions / positions 表
- [ ] Payment integration (Stripe)
- [ ] Custom domain 配置
