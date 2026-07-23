# Options Lab 期权策略库

Interactive options strategy education and analysis tool with payoff diagrams, Greeks visualization, IV analysis, and strategy recommendations.

## Production

| Surface | URL |
|---|---|
| Website | https://www.quantrift.io |
| Root redirect | https://quantrift.io → https://www.quantrift.io |
| Railway API | https://quantriftoptions-lab-production.up.railway.app |

Production verification on 2026-07-14:

- `https://quantrift.io` returns HTTP 308 to `https://www.quantrift.io/`
- `https://www.quantrift.io` returns HTTP 200
- `GET /health` returns `{"status":"ok"}`
- `GET /api/metrics?symbols=AAPL` returns AAPL IV metrics from `iv_history`
- `GET /api/scan?minIvr=0&maxIvr=100&limit=5` returns scan results

## Project Structure

```
quantrift_options-lab/
  frontend/     ← React 19 + Vite (Vercel)
  server/       ← Node.js API (Railway)
  collector/    ← Python IV data collector (Mac Studio cron)
```

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Pages

| Route | Description |
|---|---|
| `/learn` | V1 教育工具：86个策略、Payoff图、Greeks图表、知识库 |
| `/analyze` | 标的分析：真实技术支撑/压力结构；已有 mock 标的同时显示 IV、方向信号与策略推荐 |
| `/scan` | V2 扫描器：批量筛选符合条件的标的，按IV Rank排序 |

## Features (V1 — /learn)
- 86 strategies across 7 categories: Direction / Income / Volatility / Calendar / Complex / Arbitrage / Guide
- Payoff diagram: expiry line + current scenario line + breakeven markers
- Greeks six-chart: Delta / Gamma / Theta / Vega / Rho with DTE slider
- Scenario editor: spot price, IV shift, rate, dividend, range, contracts
- Risk metrics: Max Profit/Loss, Breakeven, Delta, Theta, Vega, Gamma, Rho, POP
- Leg editor: real-time chart updates
- Greeks 知识库: 5大Greek + 12个互动卡片（GEX、Gamma Squeeze、Vanna/Charm等）
- Bilingual: English strategy names + Chinese descriptions

## Features (V2 — /analyze + /scan)
- Ticker-first flow: input symbol → system analyzes → recommends strategy
- Technical Support Structure: Volume Profile POC/HVN、Anchored VWAP、50/100/200DMA、日线/周线结构
- Confluence zones: 按现价先分 support/resistance，再以 ATR 容差聚合为 S1–S3 / R1–R3，并展示证据与强度
- Options structure is fail-closed: GEX Wall 与最大 OI Wall 独立计算；快照缺失时明确显示 missing
- IV analysis: IV Rank, IV30 vs HV30, term structure
- Direction signals: MA50/200, RSI, MACD
- Earnings date detection
- Scanner: filter by IVR range, strategy type; click row → detailed analysis

## Data Sources (V2)
- IV Rank: Tastytrade API (free, pre-calculated)
- Option chains: production must use a licensed options data provider
- IB API: internal research / algorithm validation only, not the default public product data source
- Fallback: yfinance

## Product Data Direction
- Core product signals: Call Wall, Put Wall, Global GEX, Local Gamma, Gamma Flip, Max Pain, PCR, IV Skew, OI concentration, Unusual OI delta
- User requests should read precomputed snapshots from Railway PostgreSQL through the Railway API
- Public user requests must not synchronously depend on a local Mac Studio IB Gateway
- Future data ingestion should use provider adapters so IB can be replaced by licensed production data without changing frontend contracts

## Technical Levels API

`GET /api/technical-levels/:symbol` 从 PostgreSQL 快照计算并返回：

- 最近 250 根日线的 50/100/200DMA、ATR14、日线 Pivot 和周线 MA/Pivot。
- 常规交易时段 30m OHLCV 的 Volume Profile 与 Anchored VWAP。
- 最新 GEX / Gamma Wall 和 7–60 DTE 最大 Call/Put OI Wall；两类 Wall 不混用。
- 带 `score`、`strength`、`distance_pct` 和 evidence 列表的支撑/压力区域。

2026-07-22 GOOG 数据 smoke：spot `346.19`、POC `346.00`、AVWAP `353.42`、50/100/200DMA
`366.12 / 343.21 / 321.99`；生产期权快照当时为 fresh，Call/Put GEX Wall 为 `350 / 330`。

## Roadmap
- [x] V2: Railway PostgreSQL + Node.js API (replace mock data)
- [ ] V2: Python IV collector on Mac Studio (daily cron)
- [x] V2: Vercel deployment
- [x] V2: Technical Support Structure / Confluence API + Analyze panel
- [ ] V2: GEX data model + licensed options data provider abstraction
- [ ] V2: Options scanner push notifications
- [ ] V3: User auth + subscription tiers
- [ ] V3: Portfolio tracking + Greeks aggregation
