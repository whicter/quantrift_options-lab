# Options Lab 期权策略库

Interactive options strategy education tool with payoff diagrams, Greeks visualization, and scenario analysis.

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Features (V1)
- 70+ strategies: Direction / Income / Volatility / Calendar / Complex / Arbitrage / Guide
- Payoff diagram: expiry line + current scenario line + breakeven markers
- Greeks six-chart: Risk / Theta / Delta / Vega / Gamma / Rho
- Scenario editor: spot price, IV shift, rate, dividend, range, contracts
- Risk metrics: Max Profit/Loss, Breakeven, Delta, Theta, Vega, Gamma, Rho, POP
- Leg editor: real-time chart updates when modifying legs
- Strategy notes: 9-card layout (build / scenario / strike / IV / DTE / delta / TP / SL / adjustment)
- Bilingual: English strategy names + Chinese descriptions
- Dark professional theme

## Roadmap
- [ ] V2: IB Gateway integration — real-time option chains + IV Rank
- [ ] V2: Options scanner with configurable filters + push alerts
- [ ] V3: User auth + subscription tiers
- [ ] V3: Portfolio tracking + Greeks aggregation
- [ ] V3: Vercel deployment + custom domain
