# Options Lab — Wiki

## Architecture

### Monorepo 结构

```
quantrift_options-lab/
├── frontend/          → Vercel（React 19 + Vite）
├── server/            → Railway（Node.js Express API）
├── collector/         → Mac Studio cron（Python IV 采集）
├── CLAUDE.md / wiki.md / task.md / learning.md / README.md
```

### frontend/ 结构

```
frontend/src/
├── data/
│   ├── strategies.js         # 86 strategy definitions, 7 categories
│   ├── greeksKnowledge.js    # Greeks 知识库
│   └── mockAnalysis.js       # V2 mock data（9 symbols）
├── lib/
│   └── blackscholes.js       # BS pricing engine + Greeks
├── store/
│   └── useStrategyStore.js   # Zustand global state
├── components/
│   ├── Sidebar.jsx
│   ├── PayoffChart.jsx
│   ├── GreeksCharts.jsx
│   ├── RightPanel.jsx
│   ├── StrategyNotes.jsx
│   ├── GreeksKnowledge.jsx
│   └── NavBar.jsx            # 顶部导航
├── pages/
│   ├── Learn.jsx             # /learn — V1 教育工具
│   ├── Analyze.jsx           # /analyze — V2 标的分析
│   └── Scan.jsx              # /scan — V2 扫描器
└── App.jsx                   # BrowserRouter + Routes
```

### server/ 结构

```
server/
├── src/
│   ├── index.js              # Express app 入口
│   ├── db.js                 # PostgreSQL pool（reads DATABASE_URL）
│   ├── migrate.js            # 建表脚本（run once）
│   └── routes/
│       ├── metrics.js        # GET /api/metrics?symbols=AAPL,SPY
│       └── scan.js           # GET /api/scan?minIvr=30&maxIvr=80
├── package.json
└── .env.example
```

**API 端点：**

| 端点 | 说明 |
|---|---|
| `GET /health` | 健康检查 |
| `GET /api/metrics?symbols=X,Y` | 返回最新 IV 数据（最多 50 个）|
| `GET /api/scan?minIvr=&maxIvr=&minIvHv=&limit=` | 扫描器过滤 |

### collector/ 结构

```
collector/
├── auth.py       # Tastytrade 认证：remember-token 自动续期；--login 手动登录
├── collect.py    # 每日定时采集：Tastytrade API → PostgreSQL iv_history
├── requirements.txt
└── .env.example
```

## State Shape (Zustand)

```js
{
  strategy: { id, name, zh, cat, tag, lvl, legs, notes },
  legs: [...],            // editable copy of strategy.legs
  spot: 100,              // current stock price
  ivShift: 0,             // IV adjustment in percentage points
  rate: 0.04,             // risk-free rate
  div: 0.00,              // dividend yield
  range: 50,              // price range ± % for charts
  contracts: 100,         // multiplier (default 100 for US options)
  dte: null,              // overrides leg DTE for Greeks slider
}
```

## Black-Scholes Implementation

### Inputs
- S: current stock price
- K: strike price
- T: time to expiration in years (dte / 365)
- r: risk-free rate (decimal)
- q: dividend yield (decimal)
- v: implied volatility (decimal)
- type: 'call' | 'put'

### Outputs
- price: option premium
- delta: ∂V/∂S
- gamma: ∂²V/∂S²
- theta: ∂V/∂t (per day)
- vega: ∂V/∂σ (per 1% IV change)
- rho: ∂V/∂r (per 1% rate change)

### Multi-leg Aggregation
For each spot price S on the chart:
- `expiryPL(S)` = Σ leg.dir × leg.qty × intrinsic(S, leg.K, leg.type) - netPremium
- `scenarioPL(S)` = Σ leg.dir × leg.qty × bsPrice(S, leg.K, ...) - netPremium
- Greeks = Σ leg.dir × leg.qty × legGreek

## Greeks Knowledge Base

`src/data/greeksKnowledge.js` 导出：

| 导出 | 内容 |
|---|---|
| `GREEKS_INTRO` | 知识库介绍文字 |
| `GREEKS` | 5 条目：Delta/Gamma/Theta/Vega/Rho，各含 4-5 个 sections + keyRules |
| `GREEKS_INTERACTIONS` | 12 条目（交互卡片，支持 Markdown 渲染） |

**GREEKS_INTERACTIONS 条目清单：**
1. Gamma vs Theta：最根本的权衡
2. Vega vs Theta：时间价值的两个维度
3. Delta vs Gamma：方向与加速度
4. Vega 与 DTE：时间越长 IV 影响越大
5. 综合 Greeks 矩阵
6. 实战决策框架
7. GEX & 做市商对冲机制
8. Gamma Squeeze 实战案例（GME/TSLA/Volmageddon/0DTE）
9. Vanna & Charm：二阶希腊字母
10. OpEx Pin Risk & 期权到期效应
11. Vol Skew & Smile：波动率曲面
12. 期权卖方系统化框架（Vol Risk Premium）

## Strategy Notes 标准化原则

所有策略 notes 字段遵循以下框架（来自 learning.md 期权实战交易框架）：

| 字段 | 卖方策略 | 买方策略 |
|---|---|---|
| `iv` | IVR > 40-50 时卖；高于 HV 时有统计优势 | IVR < 30 时买；低于 HV 时买方划算 |
| `dte` | 45 DTE 开仓；< 21 DTE 考虑平/roll | 30-60 DTE；< 21 DTE 止损或滚动 |
| `tp` | 收取权利金 50% 时平仓 | 权利金翻倍（+100%）止盈 |
| `sl` | 亏损 2× 权利金止损 | 权利金亏损 50% 止损 |
| `delta` | Short Delta 0.16-0.30（POP 70-84%）| 买方选 Delta 0.40-0.60 |

## Strategy Categories

| Category | ID | Count | Description |
|---|---|---|---|
| 方向 Direction | direction | 14 | Directional bets, spreads |
| 收租 Income | income | 14 | Premium selling, defined risk |
| 波动率 Volatility | volatility | 10 | Long/short vol plays |
| 跨期 Calendar | calendar | 10 | Multi-expiry strategies |
| 复杂 Complex | complex | 15 | Butterflies, condors, exotics |
| 套利 Arbitrage | arb | 4 | Box, conversion, reversal |
| 向导 Guide | guide | 7 | Concept guides (Delta neutral, etc.) |

## Chart Rendering

### Payoff Chart
- X-axis: spot price range = current_spot ± range%
- Y-axis: P&L in dollars (× contracts)
- Line 1 (green solid): P&L at expiration
- Line 2 (blue dashed): P&L at current scenario (with time value)
- Verticals (yellow dotted): breakeven price(s)
- Horizontal (gray): zero line

### Greeks Charts (6 mini-charts)
Each chart:
- X-axis: same spot range as payoff chart
- Y-axis: Greek value
- 3 lines: current DTE, half DTE, quarter DTE (expiry)
- DTE slider at top controls "current DTE" baseline

## Data API (V2 — not yet implemented)

### 数据源策略

**目标成本：~$5/月（仅 Railway 托管费）**

| 用途 | 来源 | 费用 | 备注 |
|---|---|---|---|
| IV Rank（预计算） | Tastytrade API | 免费 | 开空账户即可，无需在此交易 |
| 实时期权链 | IB API | 免费 | 复用 Mac Studio 已有 IB Gateway |
| Fallback | yfinance | 免费 | 任一来源挂掉时兜底 |
| DB 托管 | Railway PostgreSQL | ~$5/月 | 独立 Service |

**Tastytrade API：**
- `MarketMetricInfo` endpoint 直接返回 `iv_rank`、`iv_percentile`、`IVx` (VIX-style)
- 免账户余额下限，开户免费（账户：whicter.han@gmail.com）
- 解决冷启动问题：第一天即可使用，无需等 52 周积累
- **已测试验证（2026-06-20）：API 完全可用，字段已确认**

**IV 自积累策略（长期摆脱外部依赖）：**
- 每天同步把 IV 数据写入 `iv_history` 表
- 积累 252 个交易日（约 1 年）后，自算 IV Rank
- `source` 字段区分 `tastytrade` / `ib` / `yfinance` / `self`

### Tastytrade API 认证流程（已验证）

**认证方式：session-token + remember-token**

```
首次登录（手动，需过设备验证）：
  Step 1: POST /sessions → 403 + x-tastyworks-challenge-token (header)
  Step 2: POST /device-challenge + challenge-token → 安全问题验证
  Step 3: POST /device-challenge + challenge-token + answer → OTP 发送到邮箱
  Step 4: POST /sessions + challenge-token + OTP header + remember-me:true
       → 返回 session-token（24h）+ remember-token（数周）

日常自动续期（全自动）：
  POST /sessions {"login": "...", "remember-token": "..."}
  → 返回新 session-token，无需人工介入

remember-token 过期时：
  → 脚本发邮件提醒 → 手动重新登录一次
```

**API 端点：**
- 登录：`POST https://api.tastyworks.com/sessions`
- 设备验证：`POST https://api.tastyworks.com/device-challenge`
- IV Rank：`GET https://api.tastyworks.com/market-metrics?symbols=AAPL,SPY`
- Authorization header：`Authorization: <session-token>`

**`/market-metrics` 返回字段（已确认）：**
```json
{
  "implied-volatility-index":       "0.241",   // 当前 IVx（小数）
  "implied-volatility-index-rank":  "0.313",   // IV Rank（0-1，×100 得百分比）
  "implied-volatility-percentile":  "0.137",   // IV Percentile（0-1）
  "implied-volatility-30-day":      "27.16",   // IV30（百分比字符串）
  "historical-volatility-30-day":   "11.21",   // HV30
  "historical-volatility-60-day":   "14.17",
  "historical-volatility-90-day":   "17.77",
  "iv-hv-30-day-difference":        "15.95",   // IV-HV 差值
  "earnings": {
    "expected-report-date": "2026-07-30"        // 财报日
  },
  "option-expiration-implied-volatilities": [   // 完整期限结构
    {"expiration-date": "2026-07-17", "implied-volatility": "0.241"}
  ],
  "beta": "1.08",
  "corr-spy-3month": "0.27",
  "lendability": "Easy To Borrow"
}
```

### IB API（实时期权链）
- IB Gateway 跑在 Mac Studio（与期货 bot 共存，使用不同 clientId）
- clientId=1: futures bot；clientId=2: options IV collector
- Mac Studio → 每日收盘后定时采集 → 写入 Railway PostgreSQL

### IV Rank Calculation
```
# 外部数据（冷启动阶段）
IV Rank = Tastytrade API 直接返回（implied-volatility-index-rank × 100）

# 自有数据（积累 252 天后）
IV Rank = (current_iv - min_iv_252d) / (max_iv_252d - min_iv_252d) × 100
```

服务层自动切换：有足够历史数据则自算，否则回退 Tastytrade API。

### 数据采集架构

```
Mac Studio（永远在线）
  └── 每日 4:30pm ET 定时任务（Python）
        ├── Tastytrade API → IV Rank / IVx / HV / 财报日
        ├── IB API (clientId=2) → 实时期权链
        └── yfinance → fallback
        → 写入 Railway PostgreSQL

Railway
  ├── PostgreSQL（数据存储）
  └── Node.js API（前端查询接口）

Vercel
  └── 前端（options-lab）
```

## Infrastructure & Database

### 决策
- **数据库**: PostgreSQL（独立 Service，不用嵌入式 DB）
- **部署平台**: Railway（后端 + DB）/ Vercel（前端静态）
- **数据采集节点**: Mac Studio（已有 IB Gateway，永远在线）
- **放弃**: DuckDB（嵌入式，无法作为独立 Service 运行，不符合偏好）
- **放弃**: ORATS/Barchart（$100+/月，个人使用成本过高）

### Railway 架构
```
Railway Project
  ├── Service: Node.js 后端 (Express / Fastify)
  │     └── DATABASE_URL → postgres://...
  └── Service: PostgreSQL  ← 独立容器
```

### 数据库 Schema（规划）

**V2 — 实时数据**
```sql
iv_history      (symbol, date, iv30, hv30, iv_rank, source)  -- IV历史 + 来源标记
option_chain    (symbol, snap_ts, strike, type, ...)          -- 期权链快照
scanner_configs (id, user_id, filters JSONB)                  -- 扫描器配置
```

**V3 — 产品化**
```sql
users           (id, email, created_at)
subscriptions   (user_id, tier, stripe_id, expires_at)
positions       (user_id, symbol, legs JSONB, opened_at)
```

- 期权 legs 用 **JSONB 列**存储，不提前固定 schema
- `iv_history.source`: `'tastytrade'` | `'ib'` | `'yfinance'` | `'self'`（自算）

## Git & Deployment Workflow

### 项目信息
- **本地路径**: `/Users/cohan/Documents/quantrift_options-lab`
- **Mac Studio 路径**: `/Users/congrenhan/Documents/quantrift_options-lab`
- **GitHub repo**: `https://github.com/whicter/quantrift_options-lab`

### Git 设置说明
- **本机**：公司网络封锁 SSH port 22/443 到外部，只能用 HTTPS 连 GitHub
  - remote URL: `https://whicter@github.com/whicter/quantrift_options-lab.git`
  - 只 pull，不 push
- **Mac Studio**：SSH 正常，负责 push 到 GitHub
  - remote URL: `git@github.com:whicter/quantrift_options-lab.git`

### 日常工作流

**本机开发完成后 → push 到 GitHub：**
```bash
# 1. 本机提交
cd /Users/cohan/Documents/quantrift_options-lab
git add -A && git commit -m "描述"

# 2. 同步到 Mac Studio（exclude 无用目录）
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' \
  /Users/cohan/Documents/quantrift_options-lab/ \
  mac-studio:/Users/congrenhan/Documents/quantrift_options-lab/

# 3. Mac Studio push 到 GitHub
ssh mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && \
  git add -A && git commit -m '描述' && git push"
```

**Mac Studio 有改动 → 同步回本机：**
```bash
# 1. 先看 Mac Studio 改了什么
ssh mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && git diff && git status --short"

# 2. Mac Studio 提交并 push
ssh mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && \
  git add -A && git commit -m '描述' && git push"

# 3. 把改动的文件 rsync 回本机
rsync -av \
  mac-studio:/Users/congrenhan/Documents/quantrift_options-lab/改动的文件 \
  /Users/cohan/Documents/quantrift_options-lab/
```

**本机 pull 最新代码（GitHub → 本机）：**
```bash
cd /Users/cohan/Documents/quantrift_options-lab && git pull
```

### SSH Config（本机 ~/.ssh/config）
```
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519

Host github.com          ← 注意：SSH 在公司网络不通，实际用 HTTPS
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519

Host mac-studio
  HostName mac-studio.quantrift.io
  User congrenhan
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
```

## Frontend Architecture

### 路由结构
```
/              → 落地页（产品介绍，吸引注册）
/learn         → V1 教育工具（现有 options-lab 所有组件）
/analyze       → V2 标的分析 + 策略推荐
/scan          → V2 扫描器（批量筛选）
/portfolio     → V3 持仓追踪
```

### 框架决策
- **框架**: 继续用 **Vite + React Router**（不迁移 Next.js）
- **理由**: 产品页面需要登录才能使用，SEO 不是刚需；Next.js 迁移成本换来收益有限
- **组件复用**: V1 所有组件（PayoffChart、Sidebar 等）直接在 `/learn` 路由复用，无需重写
- **未来**: 如需内容营销/SEO 再评估迁移 Next.js

### 项目结构（规划）
```
src/
  pages/
    Home.jsx          → / 落地页
    Learn.jsx         → /learn V1 教育工具
    Analyze.jsx       → /analyze V2 标的分析
    Scan.jsx          → /scan V2 扫描器
  components/         → 现有 V1 组件（直接复用）
  data/               → 现有策略数据
  lib/                → BS 引擎等
```

### 一次性切换原则
不同时维护两套代码库。V2 开发时在**同一个项目**内新增路由和页面，V1 内容原封不动保留在 `/learn`。

## Deployment

### V1（当前）
- 纯静态前端，Vercel 直接部署，零后端成本

### V2+
- 前端: Vercel（同一个 Vite 项目，新增路由）
- 后端 + DB: Railway（Node.js Service + PostgreSQL Service）
- 数据采集: Mac Studio Python 脚本 → Railway PostgreSQL
- 前端通过 REST API 调用 Railway 后端

## V2 分析框架：GEX + 期权链 + 大单

### 三层信号叠加逻辑

```
层级 1: GEX 环境（市场结构）
  正GEX → 做市商 long gamma → 价格稳定 → 卖方策略友好
  负GEX → 做市商 short gamma → 波动放大 → 降低卖方敞口

层级 2: 期权链信号（方向 + 情绪）
  PCR高 + IV put skew大 → 市场恐慌 → 可能是顶部，考虑 put spread
  PCR低 + IV call skew大 → 市场贪婪 → 可能是顶部，考虑 call spread
  Max Pain → 到期价格收敛目标
  OI wall    → 支撑/阻力参考，帮助选 spread 边界

层级 3: 大单验证（机构意图）
  大量 call sweep → 机构看涨，方向性信号
  大量 put sweep  → 机构对冲/看跌
  异常 OI delta   → 有人在悄悄建仓
```

### 实战组合示例

```
场景: SPY 当前 450，正GEX环境，GEX wall at 455
期权链: Max Pain = 448，PCR = 1.2（偏空情绪）
大单: 上周出现大量 445 put 买入（机构对冲）

结论:
  - 价格大概率在 445-455 之间震荡
  - 卖方策略：Iron Condor 445/448/452/455
  - 到期收敛到 Max Pain 448 有利

```

### 数据来源 & 计算

| 信号 | 数据来源 | 成本 | 计算方式 |
|---|---|---|---|
| GEX by strike | IB 期权链（OI + Gamma） | 免费 | Σ(Gamma × OI × 100 × Spot²)，call为正，put为负 |
| PCR | IB 期权链（成交量 + OI） | 免费 | put_vol / call_vol，put_oi / call_oi |
| IV Skew | IB 期权链（每个行权价 IV） | 免费 | 直接从链数据读取 |
| Max Pain | IB 期权链（OI × 行权价） | 免费 | 计算各行权价的总期权价值，取最小点 |
| OI 变化 | IB 期权链每日对比 | 免费 | 今日OI - 昨日OI |
| 真实 Sweep | Unusual Whales API | $50/月 | 实时多交易所大单扫描 |

### 新增 API 端点规划（server/）

```
GET /api/chain/:symbol         # 完整期权链（IB）
GET /api/gex/:symbol           # GEX by strike + 净GEX
GET /api/chain/:symbol/stats   # PCR / Max Pain / IV Skew / OI wall
GET /api/unusual/:symbol       # 异常OI变化 top 合约
```

## 竞品分析：华尔街咖啡馆系统解构

> 参考来源：2026-07-10 盘中截图（META / MRVL 盘中即时分析 + Nokia 一周深度复盘）

---

### 系统一：盘中即时分析

产品名称：**美股盘中日报**（V5P2-2）

**框架：三个问题驱动**

每支股票围绕三个问题展开：
1. 当前期权结构是正Gamma还是负Gamma？（市场减震器方向）
2. 上涨/下跌来自趋势修复，还是期权结构推动？（波动来源）
3. 接下来的关键位置是什么？（上方压力区 vs 下方支撑区，谁更近）

**四个Tab结构：**

---

#### Tab 1 · 今日概览

- 股价 + 实时涨跌幅 + 时间标注（如"周五盘中"）
- 行业标签（如：社交广告 / AI应用 / 元宇宙）
- 公司一句话描述（用于说明该股的观察视角）
- 三个问题的引导卡片（先问题，再给出答案）
- 综合结论卡片：
  - 格局（如：多头格局）
  - 动量（如：向上增强）
  - 信号（如：趋势延续）
  - 今日核心结论文字（一句话）
- 展开后显示下钻问题入口（趋势还在吗？期权怎么说？）

---

#### Tab 2 · 日内变化（趋势分析）

**模块 1：趋势还在吗？** 标注：偏强 / 偏弱

图表：**Trend V9 Analysis with Tuned Kalman Filter**
- 图层构成：
  - 价格线（日线级别）
  - KF 1.5/10 平滑带（Kalman Filter主趋势）
  - KF EMX 2% 辅助线
  - Near Regions（支撑/阻力区域，填充色）
  - Weekly Fibo（斐波那契周级别线）
  - Weekly Trend（周趋势方向线）
- 子图 Layer 2 [Decision] Trend Spread (Color Graded)：
  - 柱状图，颜色深浅表示趋势动能强弱（红/绿渐变）
- 子图 Layer 2.1 [Resonance] Weekly Spread Context：
  - 柱状图，周级别趋势共振强度

输出标签（3个badge）：
- **格局**：多头格局 / 空头格局
- **动量**：向上增强 / 向下减弱 / 趋于平稳
- **信号**：趋势延续 / 趋势反转

辅助指标格（3格）：
- **趋势格局**：偏强 / 偏弱
- **期权结构**：看多拥挤 / 看空拥挤 / 中性
- **相对量能（RVol）**：当日成交量 ÷ 近期同时段平均量；1.0x = 正常，>1.5x = 活跃异常

解读逻辑：
- 趋势只负责方向，能否成立要看期权结构和量能是否一起确认
- 趋势格局偏强 + 动量向上 + 量能没有异常放大 → 上涨持续性待确认
- 趋势和期权指向一致，但量能没跟上 → 上涨持续性还需确认

---

#### Tab 3 · 数据解读（期权市场）

**模块 2：期权市场怎么说？** 标注：看多拥挤 / 看空拥挤

图表：**Gamma Exposure by Strike**（GEX柱状图）
- X轴：行权价（从左到右递增）
- Y轴：GEX数值（正负）
- 颜色：红色 = 负GEX（Put主导，价格加速），绿色 = 正GEX（Call主导，阻力）
- 标注：
  - **Put Wall**：负GEX最大绝对值的行权价（= 最大支撑/加速位）
  - **Call Wall**：正GEX最大值的行权价（= 最大阻力/减速位）
  - **现价**：蓝色竖线
  - 柱顶标注数值（如744K、618K）

三个核心数字：
- **GEX**：全局Gamma敞口总量（美元，如 $86.5M）；越大 = 减震器越强
- **PCR(OI)**：Put/Call持仓量比值（如0.42 = 极度看多情绪，看多方向合约非常集中）
- **IV**：ATM隐含波动率（如63.11%，偏高 = 市场预期波动不小）

期权大单异动（异动提示）：
- 格式：`[PUT/CALL] $[行权价] @ [日期] (Vol: [成交量])`
- 示例：`PUT $630.0 @ 2026-07-10 (Vol: 4487)`
- 含义：当日该合约成交量异常，可能是机构建仓/对冲信号

解读结论：
- 价格位置与Wall的关系（如：仍在Call Wall和Put Wall之间，方向需要量能确认）
- GEX量级解读（如：GEX $86.5M，正Gamma在缓冲短线摆动）
- PCR解读（如：PCR(OI) 0.42，情绪极度拥挤，看多方向合约非常集中）
- IV解读（如：ATM IV 63%，市场预期波动不小，但正Gamma在缓冲短线摆动）

---

#### Tab 4 · 信号追踪

**模块 3：哪些信号值得关注？** 标注：价格区间（如 $600.0 ~ $650.0）

图表：**主力筹码标尺（Integrated Price Axis）**
- 竖轴：价格刻度
- 当前价格：蓝色标注点
- Call Wall：红色横线（阻力防线）
- Put Wall：绿色横线（支撑底部）
- 相机集点说明：
  - "CALL WALL 阻力防线 聚集"（表示该位置OI高度集中）
  - "PUT WALL 支撑铁底 聚集 + 主力牛证重量堆积"
  - "均值回归视角"（表示当前价远离均值，均值回归压力）
- 多空筹码平衡度指标：偏多 / 偏空 / 平衡
- 分布均匀度：是否均匀

数字面板：
- **上方压力**：距Call Wall的% + $ （如：-2.95% / $650.0）
- **下方支撑**：距Put Wall的% + $ （如：-10.41% / $600.0）

观察结论：
- 价格已高于/低于关键墙位时的解读（如：现价已突破Call Wall，该墙的压力属性需重新验证）
- 观察重点：谁离现价更近，就更容易先被市场测试

附注：**本期不是操作建议**，日报只回答一个问题：今天最该观察的风险点在哪里。

---

### 系统二：一周深度复盘（Weekly Recap）

产品名称：**一周深度复盘 WEEKLY REVIEW**，共5个Section

---

#### Section 01 · 本周定调

- 股票名称 + 股票代码
- 本周收盘价 + 周涨跌幅%
- 上周收盘参考价
- 时间范围（如：7/6 – 7/10）
- 日K线迷你图（Mon-Fri 5根蜡烛）
- **CME FAAR & GREEKS 情绪仪表盘**：0-100指针，分区标注，50 = 中性
- 本周高点 / 本周低点
- 本周一句话定性（如：本周是典型的交割偏离周：价格未能被吸引至最大痛点）

---

#### Section 02 · Gamma迁徙（Gamma Migration）

副标题：**主力阵地延时摄影**  
说明：时间轴游标推进时，Gamma柱和Call/Put Wall同步迁移

**时间轴滑块**：Mon / Tue / Wed / Thu / Fri（可切换查看每日快照）

每日快照内容（Gamma Field 柱状图）：
- X轴：行权价
- Y轴：GEX（正负）
- 绿色柱 = 正GEX / Call主导（阻力）
- 红色柱 = 负GEX / Put主导（加速）
- 虚线标注当日 Put Wall 和 Call Wall 位置

迁移追踪：
- **Call Wall 迁移**：记录一周内Call Wall的行权价变化
- **Put Wall 迁移**：记录一周内Put Wall的行权价变化
- 分析要点：墙位是否稳定？是否向价格方向迁移？

一句话结论示例：
- "Gamma墙稳定，12.5美元Call正Gamma支撑价格"
- "处于Put Wall上方但远离Call Wall"

---

#### Section 03 · 交割偏离（Expiry Pinning）

副标题：**期权引力锚定**  
说明：观察周五收盘价与最大痛点之间的偏离，判断下周开局的压力方向

展示：
- **MAX PAIN**：计算值（$ ）
- **FRI CLOSE**：实际周五收盘价（$ ）
- 偏离方向箭头（↑ 收盘高于Max Pain / ↓ 收盘低于Max Pain）
- 偏离百分比（如：-4.31%）

解读示例：
- "收盘偏离最大痛点4.31%，12.5美元Call Gamma吸引价格停留"
- "原因可能是12.5美元Call的Gamma正敞口（4.24百万美元）吸引价格停留"

---

#### Section 04 · 资金暗线（Smart Money）

副标题：**主力资金透视**  
说明：把价格路径和累计主力流向放在一起看，识别背离风险

展示：
- **累计流向（净）**：全周累计主力资金净流入/出（如 +38.9M）
- **背离信号**：YES / NO（价格走势与资金流向是否背离）
- 每日明细条形图（Mon-Fri）：
  - 颜色：红色=净流出，绿色=净流入
  - 数值：如 Mon -6.2M / Tue -4.4M / Wed +6.1M / Thu +15.6M / Fri +32.7M

解读示例：
- "主力资金周四大幅流入，与价格冲高同步"（资金和价格同向 → 趋势可信）
- 背离=YES：价格创高但资金流出 → 警惕顶部

---

#### Section 05 · 下周分叉（Next Week Scenarios）

副标题：**下周条件剧本（PLAYBOOK）**  
说明：只按关键价位触发，不提前替市场下结论

**多头剧本（绿色卡片）**：
- 触发：突破 $[Call Wall价位]
- 目标：$[下一个正GEX峰值]
- 观察：观察突破后成交量与Gamma是否同步扩张

**空头剧本（红色卡片）**：
- 触发：跌破 $[Put Wall价位]
- 目标：$[下一个负GEX峰值]
- 观察：观察跌破后是否出现负Gamma放大

---

### 数据源映射

| 数据字段 | 数据来源 | 成本 | 备注 |
|---|---|---|---|
| 价格 / 涨跌幅 / RVol | yfinance 或 IB API | 免费 | RVol = 今日量 ÷ 近20日同时段均量 |
| 完整期权链（OI + Gamma + IV per strike） | **IB API**（clientId=2，复用Mac Studio） | 免费 | 需日内多次拉取存快照 |
| GEX by Strike | 从IB链计算：Σ(Gamma × OI × 100 × Spot²) | 免费 | Call正，Put负 |
| Call Wall / Put Wall | GEX最大正值行权价 / 最大负值行权价 | 免费 | 从GEX分布直接取 |
| PCR(OI) / PCR(Vol) | 从IB链汇总 put_oi / call_oi | 免费 | |
| Max Pain | Σ(行权价 × OI) 最小总痛点 | 免费 | 从OI分布计算 |
| ATM IV | IB API 或 Tastytrade API | 免费 | Tastytrade已验证 |
| Kalman Filter趋势 | 自算（Python，yfinance历史价格） | 免费 | Trend V9可用pykalman复现 |
| 期权大单异动（Vol >> OI） | IB链 日内对比（Vol > OI × N倍） | 免费（近似） | 无法区分方向是买还是卖 |
| 主力筹码标尺（OI分布热图） | 从IB链OI by strike计算 | 免费 | |
| Gamma迁徙历史快照 | 每日存DB（collector规划中） | 免费（自积累） | 需每日EOD存完整链 |
| 主力资金净流入 | IB逐笔 + 大单过滤（>100手） | 免费（近似） | 真实dark pool需付费 |
| CME情绪仪表盘(0-100) | CME CVOL 或 PCR+GEX+动量组合评分 | 免费 | CME CVOL免费公开 |
| **真实Sweep / Dark Pool** | Unusual Whales API | **$50/月** | 真正的多交易所扫单检测 |

---

### 我们的差异化优势

**1. Gamma迁徙 → 盘中实时刷新（vs 他们的EOD静态5天快照）**
每30分钟抓一次期权链，可以看到GEX结构在盘中实时演变，更早发现Call Wall / Put Wall迁移。

**2. 多股并排 GEX 扫描器**
他们是逐个股做报告，一次只看一只。我们的 `/scan` 一次显示20+股的 GEX方向 + 距最近墙位% + PCR，快速找机会。

**3. 条件剧本自动生成**
他们手动写"多头剧本：突破$15触发"。我们根据Call Wall / Put Wall自动生成：突破上方Wall → 目标下一个正GEX峰值，空头触发条件反向。

**4. 直接输出期权策略**
他们只给结论，不给期权操作。我们结合策略库输出具体策略：
- 正GEX + IV高 → Iron Condor，上沿贴Call Wall，下沿贴Put Wall，具体行权价
- 负GEX + 趋势明确 → 方向性买方策略，Debit Spread

**5. 资金暗线分层**
他们的"主力资金"是单一净流向。我们用IB逐笔数据按订单大小分层（>50手 / >100手 / >500手），显示机构参与度层级，比单一净流向更有信息量。
