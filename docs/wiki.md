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
│   ├── mockAnalysis.js       # V2 mock data（9 symbols，含 GEX/scenarios/pcrVol 扩展）
│   ├── weeklyMock.js         # 周复盘 mock data（AAPL/SPY/QQQ，含 5日 gammaByDay）
│   └── companyInfo.js        # 公司信息 lookup（12 symbols：中文名/英文名/logo/tagline）
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
│   ├── NavBar.jsx            # 顶部导航
│   └── InsightCarousel.jsx   # 解读条（黄色静态列表，全部条目一次展示）
├── pages/
│   ├── Learn.jsx             # /learn — V1 教育工具
│   ├── Analyze.jsx           # /analyze — V2 标的分析（4-tab，?tab=0-3）；header 显示公司 logo + 中文名
│   ├── Scan.jsx              # /scan — V2 扫描器
│   ├── Weekly.jsx            # /weekly/:symbol — 周复盘（5-section，?sec=0-4）
│   ├── analyze/
│   │   ├── Tab1Overview.jsx  # 今日概览：sector/Q&A/conclusion/playbook + InsightCarousel
│   │   ├── Tab2Trend.jsx     # 日内变化：KF趋势图/Trend Spread Canvas + InsightCarousel
│   │   ├── Tab3Options.jsx   # 数据解读：GEX Canvas/4格数字(GEX/PCR OI/PCR Vol/IV)/Unusual + InsightCarousel
│   │   └── Tab4Signals.jsx   # 信号追踪：价格区间chip/OI密度分布Canvas(连续填充)/Wall距离 + InsightCarousel
│   └── weekly/
│       ├── Sec1Tone.jsx      # 本周定调：公司logo+中文名/K线Canvas/CME Gauge Canvas
│       ├── Sec2Gamma.jsx     # Gamma迁徙：时间轴滑块(Mon-Fri)/GEX日图Canvas/迁移表
│       ├── Sec3Pinning.jsx   # 交割偏离：MaxPain vs FridayClose 条形图
│       ├── Sec4Money.jsx     # 资金暗线：Smart Money 水平柱Canvas
│       └── Sec5Playbook.jsx  # 下周分叉：多头/空头剧本卡片
└── App.jsx                   # BrowserRouter + Routes（含 /weekly + /weekly/:symbol）
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
| 60日OHLCV | provider adapter（默认 IB internal；显式 dev/backfill 可用 Stooq） | 免费/内部 | 写入 `price_history`，供趋势图、RVol、weekly recap 使用 |
| 实时期权链 | 授权 options data provider（生产） | 需确认 | 用于公开/付费产品的 option chain、OI、Greeks、volume、IV surface |
| 实时期权链验证 | IB API | 免费/内部 | 仅用于个人研究、算法验证和 internal adapter，不作为公开产品默认数据源 |
| yfinance | 不作为默认路径 | 免费 | 受限于 rate limit、稳定性和授权边界；如未来使用，必须显式作为 adapter 并标注数据等级 |
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

### 期权链数据源原则

公开/付费产品不能默认依赖个人 IB Gateway 作为核心 option chain 数据源。

原因：
- IB API 适合个人研究、账户级工具和内部验证，但不应假定具备公开产品的数据再分发权利。
- IB Gateway session、2FA、pacing limit 和本地机器可用性不适合作为 SaaS 用户请求路径。
- 用户输入 `AAPL` 时，前端应通过 Railway API 读取 PostgreSQL 中已采集/预计算的快照，而不是同步触发本地 Mac Studio 去 IB Gateway 拉链。

生产原则：
- IB Gateway = internal research adapter / algorithm validation adapter。
- Production option chain = 授权 options data provider。
- 数据源必须通过 provider adapter 抽象，避免前端和 GEX 计算逻辑绑定 IB。

### IB API（内部验证）
- IB Gateway 跑在 Mac Studio（与期货 bot 共存，使用不同 clientId）
- clientId=1: futures bot；clientId=2: options research collector
- Mac Studio → 内部采集/验证 option chain 字段和 GEX 算法 → 写入 Railway PostgreSQL 或本地验证库
- 除非授权和再分发权利已确认，不将 IB 数据作为公开/付费用户的默认生产数据源

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
        ├── 授权 options data provider → 生产期权链
        ├── IB API (clientId=2) → 内部期权链验证
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
price_history   (symbol, date, open, high, low, close, volume, source, created_at) -- 60天OHLCV，collector每日upsert
option_chain_snapshots (symbol, snapshot_ts, expiration, strike, type, OI, volume, IV, Greeks, bid/ask/mid, source)
gex_snapshots          (symbol, snapshot_ts, global_gex, local_gamma, gamma_flip, call_wall, put_wall, max_pain, pcr, payload JSONB)
scanner_configs (id, user_id, filters JSONB)                  -- 扫描器配置
```

**V3 — 产品化**
```sql
users           (id, email, created_at)
subscriptions   (user_id, tier, stripe_id, expires_at)
positions       (user_id, symbol, legs JSONB, opened_at)
```

- 期权 legs 用 **JSONB 列**存储，不提前固定 schema
- `iv_history.source`: `'tastytrade'` | `'self'`（自算）等
- `price_history.source`: `'ib_internal'` | `'stooq'` | future licensed/market-data provider
- 60 天 OHLCV 写入 `price_history`，作为趋势图、RVol、weekly recap 的基础输入；不应放在前端 mock 或本地 CSV 中。
- `price_history` schema 已进入 `server/src/migrate.js`，并已于 2026-07-14 在 Railway PostgreSQL 创建。
- `collector/collect_prices.py` 已实现 provider-first 写入逻辑；默认 `PRICE_PROVIDER=ib_internal`，显式 dev/backfill 可用 `PRICE_PROVIDER=stooq`。
- `GET /api/prices/:symbol?limit=60` 返回最近 OHLCV，供 `/analyze` Tab2 和 `/weekly` Sec1 使用。
- 2026-07-14 最小闭环已验证：AAPL 通过 `ib_internal` 写入 60 条 `price_history`，本地 API 可读取。
- 2026-07-14 完整 watchlist 已验证：67/67 symbols 成功，写入 4020 rows，0 failed；`/api/status/data` 本地返回 `price_history.covered_count=67`、`missing_count=0`、`stale_count=0`。
- 2026-07-14 生产 API 已验证：`/api/prices/AAPL?limit=3` 返回 HTTP 200，`/api/status/data` 返回 `expected_count=67` 和 `price_history.covered_count=67`。
- IB symbol normalization：DB/UI canonical symbol 保持原样；IB stock contract symbol 将 `.` 映射为空格，例如 `BRK.B` → `BRK B`。

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
/analyze       → V2 标的分析 + 策略推荐（4-tab：今日概览/日内变化/数据解读/信号追踪）
/scan          → V2 扫描器（批量筛选）
/weekly        → 周复盘入口（无标的时显示快捷链接）
/weekly/:symbol → 周复盘详情（5-section：本周定调/Gamma迁徙/交割偏离/资金暗线/下周分叉）
/api/status/data → 数据覆盖状态：watchlist 覆盖率、missing/stale symbols、source counts、latest_date
/portfolio     → V3 持仓追踪
```

### Weekly Recap 数据化状态

- 完整 5-section mock 仍只有 AAPL / SPY / QQQ。
- `/weekly/:symbol` 现在会查真实 `/api/metrics` 和 `/api/prices/:symbol`。
- 若存在 `price_history`，Sec1 会用真实 5日 OHLCV 覆盖 weekClose / prevClose / weekHigh / weekLow / 日K线。
- 若 symbol 有真实 IV 数据但没有完整 weekly mock，则生成“真实 IV weekly 骨架”；若同时有真实价格历史，则 Sec1 使用真实价格。
- 完整数据化仍需要后续接入 `gex_snapshots`、OI/flow 数据；GEX/flow/Max Pain 不应用 mock 伪装成真实。

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

### 产品核心指标

Options Lab 的高价值产品层是 options positioning / dealer gamma intelligence，而不是单纯 IV Rank 工具。

核心指标：
- Call Wall：call-side OI 或 call-side GEX 最集中的 strike。
- Put Wall：put-side OI 或 put-side absolute GEX 最集中的 strike。
- OI Wall：按 open interest 计算的筹码集中价位。
- Gamma Wall：按 GEX 计算的 dealer hedging pressure 集中价位。
- Global GEX：跨到期、跨行权价聚合的 net GEX。
- Local Gamma：当前价附近（例如 spot ±1%、expected move、最近 3-5 个 strikes）的 Gamma/GEX 集中度。
- Gamma Flip：net GEX 从正变负或负变正的关键价格区域。
- Strike-level GEX：按 strike 展示 call/put/net GEX。
- Expiration-level GEX：按 expiration 聚合 GEX。
- Max Pain、PCR、IV Skew、OI concentration、Unusual OI delta。

用户请求路径：

```text
User inputs AAPL
  → frontend calls Railway API
  → API reads latest precomputed snapshots from PostgreSQL
  → frontend renders GEX / Wall / positioning view
```

不允许的生产路径：

```text
User inputs AAPL
  → Railway API waits for local Mac Studio IB Gateway
  → IB option chain is pulled synchronously
  → user waits for chain fetch
```

这种路径会暴露本地机器、IB session、2FA、pacing limit 和授权风险。
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
| GEX by strike | 授权期权链（OI + Gamma）；IB 仅内部验证 | 需确认 | Σ(Gamma × OI × 100 × Spot²)，call为正，put为负 |
| Call Wall / Put Wall | 授权期权链；IB 仅内部验证 | 需确认 | call/put side OI 或 GEX 最大的 strike，产品需标明 OI Wall vs Gamma Wall |
| Global GEX | 授权期权链；IB 仅内部验证 | 需确认 | 跨到期、跨行权价 Σ net GEX |
| Local Gamma | 授权期权链；IB 仅内部验证 | 需确认 | 当前价附近窗口内的 Gamma/GEX 集中度 |
| Gamma Flip | 授权期权链；IB 仅内部验证 | 需确认 | 估算 net GEX 正负切换价格区间 |
| PCR | 授权期权链（成交量 + OI）；IB 仅内部验证 | 需确认 | put_vol / call_vol，put_oi / call_oi |
| IV Skew | 授权期权链（每个行权价 IV）；IB 仅内部验证 | 需确认 | 直接从链数据读取 |
| Max Pain | 授权期权链（OI × 行权价）；IB 仅内部验证 | 需确认 | 计算各行权价的总期权价值，取最小点 |
| OI 变化 | 授权期权链每日对比；IB 仅内部验证 | 需确认 | 今日OI - 昨日OI |
| 真实 Sweep | Unusual Whales API | $50/月 | 实时多交易所大单扫描 |

### 原始期权链字段

每个 snapshot 至少需要：

```text
symbol
underlying_price
snapshot_ts
expiration
dte
strike
type: call / put
open_interest
volume
implied_volatility
delta
gamma
bid
ask
mid
last
source
```

### Provider adapter

数据源接口应保持稳定：

```text
provider.fetchUnderlying(symbol)
provider.fetchOptionChain(symbol)
provider.fetchOptionChainStats(symbol)
```

可选实现：
- `ib_internal_provider`：内部研究和算法验证。
- `licensed_options_provider`：公开/付费产品的默认生产数据源。
- `fixture_provider`：本地开发和测试。

### Snapshot cache / freshness contract

生产 API 不应在用户输入 symbol 时同步拉 provider。标准流程：

```text
GET /api/gex/AAPL
  → read latest gex_snapshots / option_chain_snapshots
  → fresh: return 200 with data
  → stale: return 200 with stale data + enqueue refresh
  → missing: return 202 queued or 404 unavailable state
  → worker refreshes provider asynchronously
```

核心表规划：

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `option_chain_snapshots` | 存储授权 provider 的期权链快照 | `symbol`, `snapshot_ts`, `expiration`, `strike`, `option_type`, `bid`, `ask`, `mid`, `iv`, `delta`, `gamma`, `theta`, `vega`, `open_interest`, `volume`, `source` |
| `gex_snapshots` | 存储 GEX / Walls / Gamma Flip 派生结果 | `symbol`, `snapshot_ts`, `spot`, `global_gex`, `local_gamma`, `call_wall`, `put_wall`, `gamma_flip`, `gamma_regime`, `source` |
| `symbol_metrics_snapshots` | 存储 IV/HV/earnings 等 symbol-level 指标 | `symbol`, `date`, `iv30`, `hv30`, `iv_rank`, `iv_percentile`, `earnings_date`, `source` |
| `scanner_results_snapshots` | 存储预计算扫描结果 | `scan_key`, `snapshot_ts`, `filters`, `results`, `source` |
| `provider_fetch_jobs` | 存储后台刷新队列 | `symbol`, `job_type`, `status`, `attempts`, `last_error`, `created_at`, `started_at`, `finished_at` |

统一 response metadata：

```json
{
  "symbol": "AAPL",
  "snapshot_ts": "2026-07-14T20:30:00.000Z",
  "source": "licensed_options_provider",
  "freshness": "fresh",
  "is_stale": false,
  "refresh_status": "none",
  "data": {}
}
```

字段含义：

| 字段 | 可选值 | 说明 |
| --- | --- | --- |
| `freshness` | `fresh`, `stale`, `missing`, `unavailable` | 页面是否能信任当前快照 |
| `refresh_status` | `none`, `queued`, `refreshing`, `failed` | 后台刷新任务状态 |

数据新鲜度目标：

| 数据 | 新鲜度目标 |
| --- | --- |
| IV Rank / IV30 / HV | daily / after close |
| Earnings | daily |
| Option chain quote / IV / Greeks | 1-5 min |
| Open interest | daily or provider update cadence |
| GEX / Walls / Gamma Flip | after chain refresh, normally 1-5 min |
| Scanner results | precomputed, 1-5 min |
| Weekly recap | daily / weekly |

前端 UX：

- `fresh`：正常显示。
- `stale`：继续显示旧数据，标注 snapshot time，并提示后台刷新中。
- `missing`：显示“正在准备数据”，不要显示 mock 结果伪装成真实数据。
- `unavailable`：明确说明该 symbol 暂无授权数据或 provider 暂不可用。

刷新限制：

- 单个 symbol 的手动 refresh 至少间隔 60 秒。
- scanner 不应在用户请求时全市场重算，应读取 `scanner_results_snapshots`。
- provider 请求预算需要独立记录，避免超出供应商 rate limit 或成本预算。

### 新增 API 端点规划（server/）

```
GET /api/chain/:symbol         # 最新期权链快照（生产来自授权 provider）
GET /api/gex/:symbol           # GEX by strike + Global GEX + Local Gamma + Gamma Flip
GET /api/chain/:symbol/stats   # PCR / Max Pain / IV Skew / Call Wall / Put Wall / OI Wall / Gamma Wall
GET /api/unusual/:symbol       # 异常OI变化 top 合约
POST /api/refresh/:symbol      # 手动请求后台刷新，需 rate limit
```
