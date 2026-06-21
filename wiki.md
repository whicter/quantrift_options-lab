# Options Lab — Wiki

## Architecture

```
options-lab/
├── src/
│   ├── data/
│   │   ├── strategies.js         # 86 strategy definitions, 7 categories
│   │   └── greeksKnowledge.js    # Greeks 知识库：GREEKS(5) + GREEKS_INTERACTIONS(12)
│   ├── lib/
│   │   └── blackscholes.js       # BS pricing engine + Greeks
│   ├── store/
│   │   └── useStrategyStore.js   # Zustand: global app state
│   ├── components/
│   │   ├── Sidebar.jsx           # Left: search, filters, strategy list, Greeks nav button
│   │   ├── PayoffChart.jsx       # Main P&L canvas chart
│   │   ├── GreeksCharts.jsx      # 6-panel Greeks canvas charts with DTE slider
│   │   ├── RightPanel.jsx        # Right: scenario inputs + risk metrics + leg editor
│   │   ├── StrategyNotes.jsx     # Bottom: 9-card notes grid
│   │   └── GreeksKnowledge.jsx   # Greeks 知识库页面（tab切换视图）
│   ├── App.jsx                   # view state: 'strategy' | 'greeks'
│   └── main.jsx
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

**本机开发完成后：**
```bash
# 1. 本机提交
cd /Users/cohan/Documents/quantrift_options-lab
git add . && git commit -m "描述"

# 2. 拷贝到 Mac Studio
rsync -av --exclude='.git' \
  /Users/cohan/Documents/quantrift_options-lab/ \
  mac-studio:/Users/congrenhan/Documents/quantrift_options-lab/

# 3. Mac Studio push 到 GitHub
ssh -A mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && \
  git add . && git commit -m '描述' && git push"
```

**本机 pull 最新代码：**
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
