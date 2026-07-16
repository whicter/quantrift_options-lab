# Options Lab — Wiki

## Architecture

### Monorepo 结构

```
quantrift_options-lab/
├── frontend/          → Vercel（React 19 + Vite）
├── server/            → Railway（Node.js Express API）
├── collector/         → Mac Studio PM2（直接运行 repo 的采集/计算/worker）
├── CLAUDE.md / wiki.md / task.md / learning.md / README.md
```

### frontend/ 结构

```
frontend/src/
├── data/
│   ├── strategies.js         # 86 strategy definitions, 7 categories
│   ├── greeksKnowledge.js    # Greeks 知识库
│   ├── mockAnalysis.js       # V2 mock data（9 symbols，含 GEX/scenarios/pcrVol 扩展）
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
│       ├── Sec4Money.jsx     # 仓位变化：真实 ΔOI 日汇总
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

## Data API (V2 — implemented)

### 数据源策略

**目标成本：~$5/月（仅 Railway 托管费）**

| 用途 | 来源 | 费用 | 备注 |
|---|---|---|---|
| IV Rank（预计算） | Tastytrade API | 免费 | 开空账户即可，无需在此交易 |
| 日线/30M OHLCV | Polygon aggregates（scheduled）；IB/Stooq 显式 fallback | 当前 provider | 写入 `price_history` / `price_history_30m`，供趋势、HV、RVol、weekly recap、breakout 使用 |
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

日常自动续期（通常自动，但可能触发设备挑战）：
  POST /sessions {"login": "...", "remember-token": "..."}
  → 正常返回新 session-token；如果返回 403 device_challenge_required，必须停止重复尝试并走设备验证/手动登录流程

remember-token 过期时：
  → 脚本记录错误并提醒 → 手动重新登录一次；不能把 401/403 当作无限重试登录
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
- `price_history.source`: `'polygon_licensed'` | `'ib_internal'` | `'stooq'`
- 最多 400 个日线 bar 写入 `price_history`；近 35 个自然日 30M bar 写入 `price_history_30m`，作为趋势图、HV、RVol、weekly recap、breakout 的基础输入。
- `price_history` schema 已进入 `server/src/migrate.js`，并已于 2026-07-14 在 Railway PostgreSQL 创建。
- `collector/collect_prices.py` 默认 `PRICE_PROVIDER=polygon`，两个 timeframe 在同一 symbol transaction 中 upsert；IB/Stooq 仅显式 fallback。
- `GET /api/prices/:symbol?limit=60&interval=day|30m` 返回对应 timeframe。
- 2026-07-14 最小闭环已验证：AAPL 通过 `ib_internal` 写入 60 条 `price_history`，本地 API 可读取。
- 2026-07-14 完整 watchlist 已验证：67/67 symbols 成功，写入 4020 rows，0 failed；`/api/status/data` 本地返回 `price_history.covered_count=67`、`missing_count=0`、`stale_count=0`。
- 2026-07-14 生产 API 已验证：`/api/prices/AAPL?limit=3` 返回 HTTP 200，`/api/status/data` 返回 `expected_count=67` 和 `price_history.covered_count=67`。
- IB symbol normalization：DB/UI canonical symbol 保持原样；IB stock contract symbol 将 `.` 映射为空格，例如 `BRK.B` → `BRK B`。
- Polygon price normalization：DB/UI canonical symbol 保持原样；请求层仅把 `/` share-class separator 规范为 `.`。日线 bar 用 America/New_York 交易日期，30M `bar_ts` 统一存 UTC。
- 2026-07-15 Polygon seed：daily 与 30M 均 67/67 covered，分别 26815 / 39135 rows，无 duplicate key。已有更新日期的 IB row 保留并依赖 row-level `source` 区分。

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
/              → Quantrift 产品入口（live regime + Scan/Analyze/Weekly workflow）
/learn         → V1 教育工具（现有 options-lab 所有组件）
/analyze       → V2 标的分析 + 策略推荐（4-tab：今日概览/日内变化/数据解读/信号追踪）
/scan          → V2 扫描器（批量筛选）
/weekly        → 周复盘入口（无标的时显示快捷链接）
/weekly/:symbol → 周复盘详情（5-section：本周定调/Gamma迁徙/交割偏离/仓位变化/下周分叉）
/api/status/data → 数据覆盖状态：watchlist 覆盖率、missing/stale symbols、source counts、latest_date
/portfolio     → V3 持仓追踪
```

### Weekly Recap 数据化状态

- 完整 5-section mock 仍只有 AAPL / SPY / QQQ。
- `/weekly/:symbol` 现在会查真实 `/api/metrics` 和 `/api/prices/:symbol`。
- 若存在 `price_history`，Sec1 会用真实 5日 OHLCV 覆盖 weekClose / prevClose / weekHigh / weekLow / 日K线。
- Weekly 不再读取 mock。真实 price/GEX/Max Pain/ΔOI 按 section 独立返回；缺失 section 显示 unavailable。
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

### 当前 Analyze / Scanner 算法口径（Phase 3D-3）

当前系统已经有三层真实数据，但前端消费程度不同：

```text
真实数据层：
  iv_history → /api/metrics
  price_history → /api/prices/:symbol
  option_chain_snapshots + gex_snapshots → /api/options, /api/chain, /api/gex

当前 UI 消费：
  /scan → IV-first scanner，尚未使用 GEX filters
  /analyze → IV + price history + fresh /api/gex positioning

仍待接入 UI 或后续 provider：
  Unusual Activity
  real strategy legs
  option-chain-derived POP
  technical trend signals such as MA50/MA200/RSI/MACD
```

#### `/api/scan` 当前逻辑（Scanner Algorithm）

`/api/scan` 是当前线上 scanner 的事实来源。它读取 `iv_history` 中每个 watchlist symbol 的最新一条 IV 记录，并左连接 `price_history` 最新价格。

筛选条件：
- `minIvr`：最低 IV Rank。
- `maxIvr`：最高 IV Rank。
- `minIvHv`：最低 IV30 - HV30 差值。
- `limit`：返回数量上限。
- universe：当前 Phase 3 只扫描 transitional watchlist；不扫描 `iv_history` 中的 extra symbols。最终产品不应暴露为“Watchlist scanner”，而应扩展为全市场/大范围 scanner universe，并支持 market cap、价格、成交额、期权可交易性、option-chain liquidity、行业/ETF 类别和 earnings window 等过滤。

用户界面术语：
- 默认 scanner 不应要求用户理解所有期权微观结构字段。主流程使用 opportunity presets，例如 high-IV income、near wall、unusual OI。
- 高级过滤保留英文市场术语，同时给中文解释。
- OI / Open Interest：未平仓合约数量。用户不需要手工知道这个值；系统从期权链快照读取，用于衡量期权链是否足够活跃。
- Volume / Option Volume：期权合约在当前统计窗口内的成交量。
- Volume / OI：volume divided by open interest，用于观察今天交易是否相对异常活跃。
- Gamma：期权 Delta 对标的价格变化的敏感度。产品里的 Gamma 指标来自期权链聚合，不是让用户手工计算。
- Local Gamma：当前价格附近 strike 的净 Gamma 强度。它不是单个合约 Gamma，而是价格附近期权仓位对标的价格的局部影响。
- Unusual Count：命中 OI Delta 阈值的合约数量。
- OI Delta：当前 snapshot 与上一 snapshot 的 open interest 差值。正值表示未平仓增加，负值表示减少；它只能说明持仓变化，需要结合价格、成交、bid/ask 和方向确认。
- Put/Call Ratio：put OI or put volume divided by call OI or call volume。大于 1 表示 Put 相对更多，小于 1 表示 Call 相对更多。
- DTE / Days To Expiration：期权到期剩余天数。30-60 DTE 常用于很多 premium-selling 策略，短 DTE 更事件/周权，长 DTE 更慢。
- Abs Delta：Delta 的绝对值。比如 0.16-0.30 常用于寻找较远 OTM 的 short premium legs。Call Delta 通常为正，Put Delta 通常为负，所以 scanner 用绝对值。
- Bid/Ask Spread：通常用 `(ask - bid) / mid` 估算，mid = `(bid + ask) / 2`。spread 越宽，滑点和成交难度通常越高。
- Greeks / bid / ask：当前 IB/TT 过渡 adapters 和 `option_contract_snapshots` schema 已有这些字段；拿不到或覆盖不足的部分后续用实际订阅数据源补。

高级合约过滤的后端语义：
- 所有 DTE/Delta/spread/contract OI/contract volume 参数留空时，不启用这些过滤。
- 只要用户填写任一合约级参数，`/api/scan` 要求 latest option snapshot 中存在至少一个合约满足所有已填写条件。
- 这仍然是数据库 snapshot 查询，不允许在用户请求路径同步调用 IB、TT 或 licensed provider。
- DTE range、quoted contract count 和 Greeks coverage 是采集诊断，不是交易机会。Scanner 用户结果只显示被选择候选单的 expiry/DTE、实际 legs、流动性和风险收益。

Scanner table columns:
- IV Rank：当前 IV 在历史 implied volatility range 中的位置。高 IV Rank 表示期权相对自身历史更贵；它不是 IV 百分比本身。
- 机会分：0-100 的候选质量排序分，综合 DTE、short-leg Delta、bid/ask spread、OI、volume 和策略经济性。它不是收益预测，也不是 POP。
- `ΔOI`：Open Interest delta，连续快照之间的 OI 变化。
- Scanner table should not expose a generic `数据` column. Price freshness is an internal/debug signal; the user-facing table should show the actual `现价` and actionable states in the relevant domain column.
- `Wall` empty / missing：表示当前没有该 symbol 的 GEX/Wall snapshot，不能推导最近 wall。
- `机会质量`：显示选中候选的具体 expiry/DTE、最低 leg OI、平均 bid/ask spread，以及 RoR 或 debit。
- `候选单`：显示实际 legs、净 credit/debit、max loss 与 breakeven；不是只显示策略名。
- All visible table headers are sortable client-side for quick triage.

Strategy parameter presets：
- Presets are product language; DTE / Delta / spread / OI / volume are execution parameters.
- `不限` 是默认 profile：不施加隐藏 preset，在当前采集窗口 1-90 DTE 内枚举所有已支持策略的全部达标候选；同一 symbol 可以因不同策略、expiry 或 strikes 出现多行。
- `保守` maps to farther Delta and stricter liquidity：DTE 30-60, Abs Delta 0.10-0.20, max spread 10%, contract OI >= 500, contract volume >= 50.
- `标准` maps to balanced premium-selling defaults：DTE 30-60, Abs Delta 0.16-0.30, max spread 15%, contract OI >= 100, contract volume >= 10.
- `进取` maps to closer strikes and looser liquidity：DTE 7-45, Abs Delta 0.25-0.40, max spread 20%, contract OI >= 50, contract volume >= 5.
- `短线` maps to weekly/short-DTE setups：DTE 1-14, Abs Delta 0.20-0.40, max spread 20%, contract OI >= 100, contract volume >= 20.
- `流动性优先` maps to broad DTE/Delta but strict liquidity：DTE 7-60, Abs Delta 0.05-0.50, max spread 8%, contract OI >= 1000, contract volume >= 100.
- Editing Advanced fields manually switches the UI profile to custom.

排序：
- 默认按 `iv_rank DESC` 排序。
- `sort=combined` 时先按 IV + GEX signal score 排序，再回退到 `iv_rank DESC`。

返回字段：
- IV：`iv30`, `hv30`, `iv_rank`, `iv_percentile`, `iv_hv_diff`, `earnings_date`, `source`
- Price：`price_close`, `price_date`, `price_source`, `price_status`
- GEX：`global_gex`, `local_gamma`, `gamma_flip`, `gamma_regime`, `call_wall`, `put_wall`, `max_pain`, `pcr_oi`, `pcr_volume`, `gex_status`
- Positioning totals：`total_oi`, `total_volume`, `volume_oi_ratio`, `max_strike_oi`, `max_strike_volume`
- Wall distance：`call_wall_distance_pct`, `put_wall_distance_pct`

GEX filters：
- `gammaRegime=all|positive|negative|neutral`
- `wall=all|call|put|either` + `nearWallPct`
- `minLocalGamma`
- `minTotalOi`
- `minTotalVolume`
- `minVolumeOiRatio`：当前阶段的 unusual activity proxy；真正 OI delta 异常需要连续快照历史

Wall availability:
- Wall values come from `gex_snapshots.call_wall` / `gex_snapshots.put_wall`.
- A row can only have Wall values after the pipeline has written `option_chain_snapshots`, `option_contract_snapshots`, computed GEX via `compute_gex.py`, and rematerialized scanner rows.
- If only PLTR has latest option contracts and GEX snapshots, only PLTR can show Wall. Other symbols showing empty Wall means they have not been through that chain yet, not that TT/IB cannot provide the chain.

Scanner recommendation coverage:
- Current recommendation engine favors defined-risk structures：`Bull Put Spread`, `Bear Call Spread`, `Iron Condor`, plus limited long-vol/fallback labels.
- Put spread and call spread are present under their directional names: `Bull Put Spread` = sell put spread; `Bear Call Spread` = sell call spread.
- Naked `Short Put` / `Short Call` and butterfly variants exist in the strategy knowledge base but are not yet emitted by the scanner recommendation engine.
- Butterfly recommendations should be added only when contract-level selection can identify body/wing strikes, expected pinning area, debit/credit, max profit/loss, and expiration.

Scanner actionable candidate selector:
- A scanner result is not useful if it only says `Iron Condor` or `Bear Call Spread`. It must show the actual candidate structure when option contracts are available.
- `/api/scan` includes latest quoted option contracts from the cached snapshot so the UI can build a concrete setup without synchronous provider calls.
- 当前 selector 支持：
  - `Bear Call Spread`：sell nearest target call, buy next higher call.
  - `Bull Put Spread`：sell nearest target put, buy next lower put.
  - `Iron Condor`：combine a put credit spread and call credit spread when both sides exist.
  - `Long Straddle`：buy same-expiry, same-strike ATM call + put.
- `不限` 使用当前采集窗口 1-90 DTE，不隐藏期限过滤；保守/标准/进取/短线/流动性优先 preset 才施加各自 DTE/Delta/流动性范围。
- 所有 legs 必须来自同一 latest snapshot 的真实 quoted contracts；spread/condor legs 必须同 expiry。
- Credit structures 使用可执行侧估值：short bid 减 long ask，结果必须大于 0。Long premium 使用 ask debit。
- 硬门槛后按 DTE fit、short Delta、spread、OI、volume 和 RoR/economics 排序，机会分低于 50 不显示。
- Displayed fields include expiry, DTE, legs, executable credit/debit, max loss, breakeven, RoR, minimum OI and average spread.
- If no complete candidate survives, scanner returns an explicit empty state instead of a strategy word or inventory DTE range.

Option-chain collector persistence:
- The collector should not let the first available expiration consume the whole contract cap.
- Default DTE sampling is bucketed：`0-14`, `30-60`, `60-90`.
- `OPTION_MAX_EXPIRATIONS_PER_BUCKET` controls how many expirations are selected from each bucket.
- `OPTION_MAX_CONTRACTS_PER_EXPIRATION` controls how many contracts can be persisted per expiration.
- `OPTION_MAX_CONTRACTS` remains a global safety cap.
- This lets scanner/analyze see short-term, standard premium, and farther-dated setups for the same symbol from one bounded snapshot.
- IB contract identity rule：`reqSecDefOptParams` only chooses expiration buckets. For each expiry/right, `reqContractDetails` returns actual contracts; only returned contracts with valid `conId`/`localSymbol` are eligible for market data and persistence.
- Never combine the independent expiry and strike sets into a Cartesian product. Such combinations can describe contracts that do not exist and can corrupt Wall/GEX/strategy output.
- `IB_MARKET_DATA_TYPE=3` is the current default, so delayed quotes/Greeks/OI are accepted and normalized into the same snapshot schema.

#### Scanner 前端策略标签

IV/trend/GEX 用于机会背景、上游过滤和解释；`不限`不会用这些字段替用户预先压缩成单一策略，而是从实际合约链枚举所有已支持策略的达标 legs：

| 条件 | 当前标签 | 含义 |
|---|---|---|
| `IV Rank >= 50` + bullish trend | `Bull Put Spread` | 高 IV 且价格趋势偏多，优先定义风险卖 Put |
| `IV Rank >= 50` + bearish trend | `Bear Call Spread` | 高 IV 且价格趋势偏空，优先定义风险卖 Call |
| `IV Rank >= 50` + neutral/missing trend | `Iron Condor` | 高 IV 但方向不明确，使用定义风险中性卖方结构 |
| `30 <= IV Rank < 50` | `Iron Condor` | 中等 IV，偏小仓位/定义风险观察 |
| `IV Rank < 30` | `Long Straddle` | 低 IV 环境可观察买方波动结构，但不代表已有事件催化 |

重要边界：
- Scanner 不再显示规则占位 POP；机会分只衡量候选质量，不代表获利概率。
- `Direction` 来自 materialized scanner snapshot：`collector/materialize_scan.py` 读取 `price_history` 计算 MA20/50/200、RSI14、5D change 和 trend_score；60日数据不足时 MA200 为 null，不伪造长周期趋势。
- `Earnings` 来自 `iv_history.earnings_date`；scanner 前端显示日期，并在 0-14 天窗口内标记事件风险 warning。
- `/api/scan` 现在读取 latest `gex_snapshots` 和 `gex_by_strike_snapshots`，但只读数据库快照，不在用户请求路径直连 IB/TT/provider。
- GEX fresh/stale/missing 由后端返回 `gex_status`；stale 但 required fields 完整时继续显示并标记质量，missing/unusable 才隐藏 GEX/Wall。前端不能把 stale 当 fresh。
- 当前已接入 bid/ask、DTE、contract liquidity 和自动选腿；后续仍可增加独立、经校准的 POP/定价模型，但不能用固定百分比占位。
- OI delta unusual 已实现为连续 snapshot 差分；`volume_oi_ratio` 仍只说明“当期成交相对持仓是否活跃”，不能等同机构建仓确认。

后续 scanner 应新增：
- `pcr_oi` / `pcr_volume` abnormal filters。
- OI delta filters：比较当前 OI 与前一交易日/前一 provider snapshot。
- contract-level bid/ask spread 与 DTE filters。
- strategy-specific leg selection。

#### `/analyze` 当前逻辑（Analyze Algorithm）

`/analyze` 当前使用：
- 真实 `/api/metrics` 覆盖 IV Rank / IV30 / HV / earnings。
- 真实 `/api/prices/:symbol` 覆盖 latest price、60日 price history、RVol。

价格趋势派生：
- latest close 来自 60日 OHLCV 最后一根。
- RVol = latest volume / prior 20 trading bars average volume。
- 20日均线：close >= 20日均线 → `价格强于20日均线`；否则 `价格弱于20日均线`。
- 5日变化：> 1% → `向上增强`；< -1% → `向下减弱`；其他 → `横盘整理`。

缺失数据处理：
- 有价格但无 metrics：price-only fallback；只展示价格趋势，不生成期权策略结论。
- 无价格也无 metrics：根据 `/api/status` 判断是否在 watchlist。
- API 全部失败但本地有 mock symbol：显示本地示例结构，并提示真实 API 不可用。

当前 analyze 已消费：

```text
/api/gex/:symbol
strike-level GEX
Call Wall / Put Wall
Gamma Flip
PCR OI / PCR Volume
Max Pain
```

GEX 使用条件：
- 有 `global_gex`, `call_wall`, `put_wall`, `strikes` required fields。
- stale/partial snapshot 继续显示实际数据，并标记 source、age、confidence。
- freshness/confidence 影响质量提示，不再单独导致整块分析消失。

GEX fallback：
- GEX missing/unusable：保留 IV + price 分析，不保留 mock Wall 或策略腿。
- GEX stale/partial 且字段完整：保留实际分析，明确标记其不是 fresh。
- 有 GEX + price 但无 IV metrics：展示真实 GEX / Walls / PCR / Max Pain；IV Rank unavailable；不生成策略腿推荐。

当前 analyze 尚未消费：

```text
real strategy legs
option-chain-derived POP
Unusual Activity
```

不得把 mock shell 当作真实 options data 或交易建议。下一步 UI 接入应补 actual strategy legs / POP / unusual activity。

#### Options Positioning 数据层现状

Production option snapshots 已切换到 `polygon_licensed`；TT/IB 仅保留为 fallback/research adapters。API 和前端继续只读 PostgreSQL snapshots，不直接调用 provider。

| 数据 | 当前状态 | 当前过渡路径 | 下一步产品工作 |
|---|---|---|---|
| 60日 OHLCV / latest close | 已接入 | `ib_internal` | coverage/freshness alert |
| IV Rank / IV30 / HV30 | 已接入 watchlist metrics | Tastytrade metrics | coverage alert |
| Option chain bid/ask/last | 已接入 snapshot schema | Polygon licensed | bounded universe backfill |
| Open Interest / Volume | 已接入 contract snapshots | Polygon actual fields | completeness monitoring |
| Greeks / IV by contract | 已接入 contract snapshots | Polygon Greeks | completeness monitoring |
| GEX by strike | `compute_gex.py` 已实现 | latest usable option snapshot | broader symbol coverage |
| Call Wall / Put Wall | GEX snapshot 已实现 | actual strike aggregation | broader symbol coverage |
| Gamma Flip | GEX snapshot 已实现 | reproducible price grid | broader symbol coverage |
| Unusual activity / OI delta | 已实现连续 snapshot 差分 | `materialize_oi_delta.py` | repeated-snapshot coverage |

IB Gateway 当前路径：
- `source=ib_internal`
- delayed market data type `3` 可进入过渡采集闭环
- 只采集 IB actual contract details，不构造合约
- 不放在公开用户请求路径
- 不作为公开/付费产品的授权 option-chain 数据源

Phase 3D 的第一版范围：
- symbols：`AAPL`, `SPY`, `QQQ`, `PLTR`
- expirations：7-60 DTE
- strikes：spot ±15% 或每边最多 20 个 strikes
- rights：calls + puts
- API：前端只读 `/api/gex/:symbol`、`/api/chain/:symbol` 的最新 PostgreSQL snapshot

Phase 3D-1 已落地的数据接口：

| API | 行为 |
|---|---|
| `GET /api/options/:symbol/snapshot` | 返回最新 option chain snapshot metadata；`includeContracts=true` 时返回合约行 |
| `GET /api/chain/:symbol` | 返回最新 option chain snapshot + contract rows |
| `GET /api/gex/:symbol` | 返回最新 GEX / Wall / Gamma Flip snapshot |
| `GET /api/status/options` | 返回 watchlist option snapshot coverage |

这些 API 只读 PostgreSQL，不会同步调用 IB Gateway 或任何外部 provider。没有 snapshot 时返回 `freshness=missing`，而不是 fallback 到 mock。

Phase 3D-2 已验证 IB internal adapter 可以写入 bounded option-chain snapshot：
- 2026-07-14 runtime smoke：`OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10`
- 写入 `option_chain_snapshots.snapshot_id=2`
- `/api/options/PLTR/snapshot` 返回 `source=ib_internal`、`provider_status=partial`、`contract_count=10`
- 当前限制：IB 返回 chain definition / expirations / strikes，但本次 option quote、Greeks、OI 为空；因此 `completeness_pct=0.00`，不可用于 GEX / Wall / Gamma Flip 计算。

Phase 3D-2A 已补齐 IB delayed-data parser 与 raw tick diagnostic：
- live quote ticks：bid / ask / last / close = 1 / 2 / 4 / 9
- delayed quote ticks：bid / ask / last / close = 66 / 67 / 68 / 75
- OI / volume generic ticks：call OI / put OI / call volume / put volume = 27 / 28 / 29 / 30
- live option computation：bid / ask / last / model = 10 / 11 / 12 / 13
- delayed option computation：bid / ask / last / model = 80 / 81 / 82 / 83
- Diagnostic command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 IB_OPTION_CLIENT_ID=44 venv311/bin/python debug_ib_option_ticks.py`
- 2026-07-14 verification status：syntax verified；runtime diagnostic blocked because IB Gateway `127.0.0.1:4001` timed out.

Interpretation rule：
- If TWS/Gateway does not show the same contract's bid/ask/IV/Greeks/OI, the API socket should not be expected to return it.
- If TWS shows those fields but `debug_ib_option_ticks.py` raw payload is empty, treat it as adapter/parser bug.
- If raw payload contains IB permission errors, resolve market-data subscriptions before entering 3D-3 GEX calculation.

Credential invariant：`POLYGON_API_KEY` 只存在于 `collector/.env` 或部署 secret store。PM2 config、源码、测试与文档不得包含真实 key，也不得注入空字符串覆盖 dotenv。

Phase 3D-6 verification contract：
- GEX formula tests assert positive Call exposure and negative Put exposure.
- Wall tests enforce Call Wall at/above spot and Put Wall at/below spot.
- Gamma Flip tests cover sign-change interpolation and nearest-zero fallback.
- PCR denominator zero returns `null`, not infinity or a fabricated value.
- `/api/gex/:symbol` fresh/missing/stale tests verify snapshot-first behavior; missing/stale only enqueue refresh jobs.
- API refresh default is `polygon_licensed` and must remain executable by the collector worker.

Collector health semantics：
- `coverage_below_threshold`：watchlist 中缺少可用 contract snapshot；empty/metadata-only 不算 covered。
- `failed_jobs_above_threshold`：最近 24h failed refresh jobs 超阈值。
- `snapshot_age_above_threshold`：latest snapshot age 超阈值。
- `completeness_below_threshold`：latest snapshot completeness 缺失或低于阈值。
- 相同 issue/symbol 集合生成稳定 fingerprint；cooldown 内不重复通知，健康恢复后状态写为 resolved，再次复发会重新通知。

Phase 3D-7 licensed provider evaluation：

| Provider candidate | Why it fits | Open questions | Current decision |
|---|---|---|---|
| Polygon options snapshot | Adapter and licensed snapshot path implemented with pricing, Greeks, implied volatility, quotes, volume and open interest | Continue coverage/completeness monitoring | Selected production provider |
| Intrinio options APIs | Options chain/data APIs are available and may fit a commercial data workflow | Need confirm field completeness for gamma/OI/volume, rate limits, redistribution/display terms, and cost | Second candidate / quote comparison |
| IB Gateway | Can validate internal formulas and compare snapshots | Not a public product data redistribution source; local gateway is not acceptable request-path dependency | Internal validation only |
| Tastytrade internal | Useful transitional chain + DXLink data while building schema and GEX logic | Not documented here as a licensed redistribution source for a public SaaS product | Internal validation only |

Cutover rule：
- Licensed adapter must implement `collector/providers/base.py::OptionChainProvider`.
- API response shape for `/api/gex/:symbol`, `/api/chain/:symbol`, `/api/scan` must remain stable.
- `source` must display the licensed provider name, not `ib_internal` or `tt_internal`.
- Side-by-side comparison must run on `AAPL`, `SPY`, `QQQ`, `PLTR` before disabling internal providers for public product paths.
- No public/paid product launch until the provider agreement explicitly allows the intended display/redistribution.

Current `tt_internal` behavior：
- Collector selector：`OPTION_PROVIDER=tt_internal`
- Diagnostic：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
- DXLink diagnostic：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 TT_DXLINK_TIMEOUT=12 venv311/bin/python debug_tastytrade_dxlink.py`
- Snapshot source：`tt_internal`
- Snapshot status：`ok` when DXLink returns quote + Greeks + OI; `metadata_only` when only REST chain metadata is available
- REST stored fields：contract symbol, streamer symbol, expiration type, settlement type, DTE
- DXLink stored fields：
  - underlying Quote / Trade：underlying bid, ask, price
  - option Quote：bid, ask, bid size, ask size
  - option Trade：last, day volume
  - option Summary：open interest, day open/high/low, previous close in raw
  - option Greeks：iv/volatility, delta, gamma, theta, rho, vega
  - option TheoPrice：theoretical price, underlying price, delta/gamma fallback
  - option Profile：raw trading/profile status
- GEX status：unblocked for symbols whose snapshot has gamma + OI completeness above threshold

2026-07-14 runtime evidence：
- TT chain diagnostic fetched PLTR metadata：19 expirations, 138 strikes, 10 selected contracts.
- `OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python collect_options.py`
- Wrote `option_chain_snapshots.id=4`.
- Production API returned `source=tt_internal`, `provider_status=metadata_only`, `contract_count=10`, `freshness=fresh`.
- After DXLink merge, wrote `option_chain_snapshots.id=6`.
- Production API returned `source=tt_internal`, `provider_status=ok`, `completeness_pct=100.00`, `missing_greeks_ratio=0.0000`, `missing_oi_ratio=0.0000`.
- Current TT quote token level returned by API is `demo`; DXLink URL is delayed feed. Treat this as internal validation until formal provider licensing is purchased.

Phase 3D-3 GEX calculation is implemented as a cached compute job:
- Job：`GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py`
- Reads latest `option_chain_snapshots` + `option_contract_snapshots`
- Writes `gex_snapshots` + `gex_by_strike_snapshots`
- Does not call IB, tastytrade, or any provider directly
- Upserts by `snapshot_id`
- Fail-closed gates：no spot, no usable gamma/OI, or missing Greeks/OI ratio above `GEX_MAX_MISSING_RATIO=0.25`

V1 formulas:
- Call GEX：`gamma * open_interest * 100 * spot^2`
- Put GEX：`-gamma * open_interest * 100 * spot^2`
- Strike net GEX：sum call GEX + put GEX at strike
- Global GEX：sum all strike net GEX
- Local Gamma：sum strike net GEX within spot ±1%
- Call Wall：strike with max call-side GEX
- Put Wall：strike with max absolute put-side GEX
- PCR OI：total put OI / total call OI
- PCR Volume：total put volume / total call volume
- Max Pain V1：aggregate across selected contracts
- Gamma Flip：Black-Scholes gamma recalculated across spot ±10% grid; if no zero crossing, use nearest abs(net GEX) fallback

2026-07-14 PLTR GEX runtime evidence:
- `compute_gex.py` wrote `gex_snapshots.id=1` for `option_chain_snapshots.id=6`
- `/api/gex/PLTR` returned `global_gex=112882349.1123`, `local_gamma=25163724.2306`, `gamma_regime=positive`
- Walls：`call_wall=135`, `put_wall=135`, `wall_method=gex`
- Other metrics：`max_pain=135`, `pcr_oi=0.3634`, `pcr_volume=0.4672`, `confidence=high`
- API `freshness=stale` during verification because source option snapshot age exceeded the 15-minute API threshold; calculation itself succeeded.

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

### 三层信号叠加逻辑

```text
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
  → missing: return missing/queued state
  → worker refreshes provider asynchronously
```

核心表规划：

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `option_chain_snapshots` | 存储授权 provider 的期权链快照 | `symbol`, `snapshot_ts`, `expiration`, `strike`, `option_type`, `bid`, `ask`, `mid`, `iv`, `delta`, `gamma`, `theta`, `vega`, `open_interest`, `volume`, `source` |
| `gex_snapshots` | 存储 GEX / Walls / Gamma Flip 派生结果 | `symbol`, `snapshot_ts`, `spot`, `global_gex`, `local_gamma`, `call_wall`, `put_wall`, `gamma_flip`, `gamma_regime`, `source` |
| `symbol_metrics_snapshots` | 存储 IV/HV/earnings 等 symbol-level 指标 | `symbol`, `snapshot_ts`, `source`, `metrics`, `freshness`, `refresh_status` |
| `scanner_results_snapshots` | 存储预计算扫描结果 | `scan_key`, `symbol`, `snapshot_ts`, `iv_rank`, `gamma_regime`, `wall_distance`, `signal_score`, `freshness` |
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
- scanner 不在用户请求时全市场重算；`collector/materialize_scan.py` 预计算 `scanner_results_snapshots`，`/api/scan` 只读 latest materialized batch。
- provider 请求预算需要独立记录，避免超出供应商 rate limit 或成本预算。

Phase 3C implementation status：
- `server/src/migrate.js` creates `symbol_metrics_snapshots` and `scanner_results_snapshots`.
- `collector/materialize_scan.py` writes one scanner cache row per watchlist symbol from existing PostgreSQL snapshots only.
- `/api/scan` now reads `scanner_results_snapshots`; if cache is missing/stale it enqueues `provider_fetch_jobs(symbol='__SCAN__', job_type='scanner_materialize')`.
- `/api/gex/:symbol` and `/api/chain/:symbol` enqueue `option_chain_snapshot` refresh jobs for missing/stale snapshots but do not call providers synchronously.
- API memory cache exists for metrics, GEX/chain and scanner responses.
- `collector/run_refresh_worker.py` consumes queued jobs:
  - `symbol_metrics_snapshot`
  - `option_chain_snapshot`
  - `scanner_materialize`
- `provider_request_usage` tracks daily provider request usage and budget.
- `/api/status/cache` reports job backlog/failures, scanner stale age, empty/metadata-only option snapshots, and provider budget usage.
- Runtime completed：Mac Studio PM2 直接运行 `collector/ecosystem.config.cjs`。`quantrift-options-collector` 每 300 秒 missing-first/oldest-first bounded enqueue 两个 symbols、每 60 秒消费 queue、每 300 秒 materialize scanner；失败 symbol 有 30 分钟 cooldown；`quantrift-options-prices` 工作日 13:35 PT 运行。
- No runtime copy：旧 LaunchAgent、wrappers 和 `~/.quantrift_options_collector` 已移除；当前 repo 是唯一运行代码源。

### 新增 API 端点规划（server/）

```
GET /api/chain/:symbol         # 最新期权链快照（生产来自授权 provider）
GET /api/gex/:symbol           # GEX by strike + Global GEX + Local Gamma + Gamma Flip
GET /api/chain/:symbol/stats   # PCR / Max Pain / IV Skew / Call Wall / Put Wall / OI Wall / Gamma Wall
GET /api/unusual/:symbol       # 异常OI变化 top 合约
POST /api/refresh/:symbol      # 手动请求后台刷新，需 rate limit
```

### Phase 3E OI Delta / Unusual Activity

Phase 3E 把 unusual activity 从“volume/OI proxy”推进到“连续 snapshot 的 OI delta”。

Phase 3E-1 数据层：
- 输入：连续 `option_contract_snapshots`
- 输出：contract-level OI delta snapshot
- 字段：`symbol`, `contract_symbol`, `expiry`, `strike`, `right`, `open_interest`, `previous_open_interest`, `oi_delta`, `volume`, `volume_oi_ratio`, `snapshot_ts`, `source`
- baseline rule：第一次看到某个合约时只能建立 baseline，不能标记为 unusual。
- stale rule：previous snapshot 太旧时不确认 OI delta，只返回 stale/baseline 状态。

Phase 3E-2 scanner：
- unusual OI = `oi_delta` absolute threshold + relative threshold + volume confirmation。
- volume-only / volume-to-OI 只能作为活跃度 proxy，不能写成机构建仓确认。
- scanner 继续只读预计算结果，不在用户请求路径全链计算。

### Analyze Direction / Strategy Matrix

Current Analyze uses real `price_history` to compute:

### Analyze Derived Data Products（2026-07-15）

- `GET /api/sr/:symbol`：读取最多 250 根日线，以左右各 2 根 bar 识别 pivot high/low，再把 ±1% 内的 pivots 聚成 zone。只返回现价下方 support 与上方 resistance，各最多 3 个，并附 touches。
- Focus Score：基础 50 分；MA20/50/200 相对位置、RSI14、5日变化与完整日线 RVol 加减分，截断到 0–100。少于 20 根日线不 ready；当天盘中 volume 不参与 RVol。
- `GET /api/chain/stats/:symbol`：选最新一个至少含一条 `iv > 0` contract 的 snapshot。Term Structure 取每个 expiry 最靠近 spot 的 call/put 平均 ATM IV；Skew 保留最近 expiry 各 strike 的 call IV、put IV、delta 和 OI。
- Analyze Tab1 展示 Focus / VRP / Gamma Flip / Local Gamma；Tab2/Tab4 展示技术 S/R；Tab3 展示 IV skew/term structure。
- 数据缺失规则：不生成示例价格，不从 spot/wall 构造期权 legs，不把 mock 作为 fallback。
- MA20 / MA50 / MA200
- RSI14
- MACD line / signal / histogram
- 5-day price change
- direction score

Strategy matrix inputs:
- IV Rank / IV30 / HV from `/api/metrics`
- price/trend indicators from `/api/prices/:symbol`
- GEX / Call Wall / Put Wall from `/api/gex/:symbol` when usable
- OI delta / unusual status from `/api/unusual/:symbol`

Recommendation rules:
- High IV + neutral trend + positive/usable GEX → Iron Condor
- High IV + bullish trend → Bull Put Spread
- High IV + bearish trend → Bear Call Spread
- Low IV → Long Straddle
- Mid IV → small defined-risk directional spread

Boundary:
- Current legs are target strikes from price / Call Wall / Put Wall, not contract-level optimal live-chain selection.
- Full automatic leg selection requires broader option-chain snapshots with bid/ask spread, DTE, Greeks and liquidity for the watchlist.

### Derived HV, ATM IV, and IV Rank

- **HV30/60/90**：Polygon adjusted daily close 的 log return sample standard deviation，乘 `sqrt(252)` 年化。
- **ATM IV observation**：每个美东交易日最新 Polygon option snapshot 中，30–45 DTE、strike 最接近 spot、IV 非空的 call。
- **IV Rank**：`(current ATM IV - 52-week low) / (52-week high - 52-week low) * 100`；不足 252 个独立交易日不计算。
- **IV Percentile**：历史 ATM IV 中小于等于当前值的比例；与 IV Rank 不是同一指标。
- **来源展示**：`iv_source`、`hv_source`、`iv_rank_source` 分开，不用一个 `source=hybrid` 隐藏字段来源。

选择 30–45 DTE 是为了建立稳定的标准期限 IV 序列，不代表该 expiry 就是 scanner 推荐合约。Scanner 的实际候选 expiry/legs 由策略枚举独立决定。

### Scanner Candidate Enumeration

当前支持 13 种结构：Iron Condor、Bull Put Spread、Bear Call Spread、Long Straddle、Short Strangle、Iron Butterfly、Calendar Spread、Diagonal Spread、Long Call、Long Put、Jade Lizard、Short Put、Short Call。

- `不限` 是对当前 quote snapshot 的全部达标组合进行枚举，同一 symbol 可有多个 expiry/strategy/strike candidate。
- Named presets 只改变 DTE、absolute Delta、spread、OI、volume 阈值。
- Sell side 使用 bid，buy side 使用 ask；这比用 mid 更保守，也可重放。
- Short Strangle 与裸卖单腿不是定义风险，默认不参与；用户必须开启高级风险。
- Quote freshness 与 GEX freshness 分开显示。新的 Polygon OI/Greeks snapshot 不保证含 bid/ask。
- `机会分` 用于排序，不替代结构完整性门控；低分、缺腿、错 expiry、非正 credit 的结构先被删除。

Implemented files：
- `collector/materialize_oi_delta.py`
- `server/src/routes/unusual.js`
- `frontend/src/pages/analyze/Tab3Options.jsx`
- `frontend/src/pages/Scan.jsx`

Runtime evidence：
- `materialize_oi_delta.py` wrote 10 PLTR rows from consecutive TT internal snapshots.
- Current PLTR status is `quiet`: rows are confirmed, but `oi_delta=0`, so no unusual OI is reported.

### Persistent Scanner Universe and Unknown Symbols

The scanner is no longer bounded by the visible 67-symbol watchlist. `symbol_universe` persists all known symbols and on-demand registrations. `sync_universe.py` imports the legacy watchlist plus symbols already known to price, IV and option tables; `materialize_scan.py` reads active/scannable registry rows.

`GET /api/analyze/:symbol` is the one-symbol orchestration endpoint. It returns independent coverage for price, metrics, options and GEX and enqueues only missing products. The frontend can therefore show partial real analysis while another field is queued or blocked. A recent non-retryable failure suppresses repeated enqueue until its recovery window passes.

Universe filter semantics:
- price and underlying share/dollar volume use latest persisted OHLCV;
- earnings include/exclude uses persisted `earnings_date`;
- market cap, sector/category and optionable use nullable registry metadata and fail closed when a selected filter lacks the field;
- contract liquidity remains a candidate-level filter over actual option contracts.

### Market Regime and Weekly Recap

The Scan header consumes `/api/market/regime`. SPY and QQQ each expose daily score, 30M score, breakout evidence, GEX regime and IV Rank. `30M Breakout` is not a label inferred from daily trend: it requires a close beyond the previous 20 regular-session 30M range plus `volume/current-average >= 1.2`, and the intraday date must match the latest daily market date.

Weekly consumes `/api/weekly/:symbol` and has no symbol-specific mock path:
- 本周定调：last five actual daily bars and a transparent composite score;
- Gamma 迁徙：one actual latest GEX/by-strike snapshot per New York market date;
- 交割偏离：latest actual Max Pain versus latest close;
- 仓位变化：daily aggregate ΔOI and unusual count, never described as dollar flow;
- 下周分叉：expected-side Wall first, then real pivot S/R; absent evidence leaves a direction missing.

### Product Home

`Home.jsx` is the first product signal. It uses the scanner interface as the hero visual, reads the real Market Regime endpoint for context, and exposes direct actions for the three core workflows. It does not duplicate feature documentation or hide the actual app behind a signup screen. `/learn` stays available as a distinct education workspace.

### Scanner Alerts

The Scan page can persist the current minimum IV Rank, Gamma regime and unusual-only state as an email or browser-push rule. Browser push uses `public/sw.js`; the client obtains only the VAPID public key. The private key remains with the collector delivery process.

Each latest materialized row is tested against active rules. A unique delivery outbox row is inserted before sending, so process restart cannot resend the same symbol from the same scanner batch. Delivery states are `pending`, `sent`, `blocked`, `failed`; missing channel configuration is blocked. Unsubscribe uses a random token rather than an email address or push endpoint.

### Collector Heartbeat

`send_heartbeat.py` reports the Mac Studio daemon identity and runtime metadata to `POST /api/heartbeat`. `GET /api/heartbeat/status` is the operator-facing read model: expected nodes appear even before their first report, with `missing`, `offline`, or `online` state and heartbeat age.

The Railway monitor persists an incident in `collector_heartbeat_alerts` when a report is absent or older than the configured threshold. Repeated notification follows a cooldown; recovery resolves the same incident. URL/token absence disables only heartbeat transmission, never the collector loop.

### IV Rank Automatic Cutover

`volatility_history.iv_rank_ready` owns the transition from cold-start provider rank to self-derived rank. Readiness is checked per symbol. API/scanner consumption prefers derived data, while scheduled collection, queued refresh and Analyze orchestration all skip Tastytrade for ready symbols. Until readiness, the provider value remains available with explicit provenance.

### Railway Metrics Cron

The cloud metrics service is a separate one-shot deployment defined by `collector/railway.metrics.json`. It runs only `collect.py` after the US close and exits. It shares PostgreSQL but does not run IB, scanner materialization, provider refresh jobs or the Mac heartbeat. Derived-ready symbols are filtered before TT authentication.

### IB Gateway Cloud Boundary

The evaluated target is a fixed-egress VPS, not a public Railway service. Gateway and a read-only collector share localhost/private networking; raw API ports are never internet-facing. `ops/ib-gateway/` contains the paper/read-only template and soak checklist. Mac Studio remains active until the candidate survives reconnect/reboot and data-parity checks.

### Account and Entitlements

Clerk verifies browser sessions; local `users` and `subscriptions` rows own product access. `/api/account/me` performs an idempotent user/free-plan upsert and returns entitlements. Frontend auth components are conditional on the Clerk publishable key. The additive account/portfolio/billing schema is applied in Railway PostgreSQL. Product enforcement remains off until billing lifecycle and production credentials are present.

### Portfolio

`/portfolio` records real multi-leg option positions and reads the latest matching persisted contract quote for valuation. The API applies long/short sign, 100 multiplier, position quantity and leg quantity to P/L and Greeks. Missing quotes remain unpriced; the summary never presents a partial portfolio number as complete. Close preserves the record and updates lifecycle state.

### Billing and Paid Access

Stripe Checkout creates recurring Pro subscriptions; Customer Portal owns cancellation and payment-method changes. A successful browser redirect is never treated as payment evidence. Only a webhook whose signature was verified against the raw request body can update the local subscription projection.

`stripe_webhook_events.event_id` makes replay idempotent. The event audit row and subscription update share one PostgreSQL transaction. Active and trialing map to Pro; past-due, unpaid, canceled and incomplete states fail closed to Free. Concurrent checkout requests lock the user's subscription row before creating a Stripe customer so one local user cannot accidentally acquire multiple billing customers.

`AUTH_ENFORCEMENT_ENABLED` is the deployment switch. While false, existing product access remains unchanged. After Clerk and Stripe runtime acceptance, enabling it requires a valid Clerk bearer token plus the route entitlement; health, heartbeat and the signed billing webhook remain outside the paid gate.
