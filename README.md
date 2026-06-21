# Options Lab 期权策略库

Interactive options strategy education and analysis tool with payoff diagrams, Greeks visualization, IV analysis, and strategy recommendations.

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
| `/analyze` | V2 标的分析：输入股票代码，获取IV状态+方向信号+策略推荐 |
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
- IV analysis: IV Rank, IV30 vs HV30, term structure
- Direction signals: MA50/200, RSI, MACD
- Earnings date detection
- Scanner: filter by IVR range, strategy type; click row → detailed analysis

## Data Sources (V2)
- IV Rank: Tastytrade API (free, pre-calculated)
- Option chains: IB API (free, via Mac Studio IB Gateway)
- Fallback: yfinance

## Roadmap
- [ ] V2: Railway PostgreSQL + Node.js API (replace mock data)
- [ ] V2: Python IV collector on Mac Studio (daily cron)
- [ ] V2: Vercel deployment
- [ ] V2: Options scanner push notifications
- [ ] V3: User auth + subscription tiers
- [ ] V3: Portfolio tracking + Greeks aggregation
