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

## 🏗️ V3 — Product
- [ ] User authentication (NextAuth or Clerk)
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
- [ ] Portfolio dashboard: 追踪开仓，P/L，综合 Greeks
- [ ] PostgreSQL: users / subscriptions / positions 表
- [ ] Payment integration (Stripe)
- [ ] Custom domain 配置
