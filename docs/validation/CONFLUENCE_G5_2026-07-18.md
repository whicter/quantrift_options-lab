# Confluence G5 Replay — 2026-07-18

## Scope

- Model: `confluence-g5-v1`; Gamma is disabled because historical option positioning is not available.
- Candidate model: `confluence-v1-prior` with fixed `40/25/15/10/5/5` weights.
- Control: existing daily pivot S/R point expanded to a `+/-0.5%` band.
- Each decision uses only bars through that market date. The next five daily bars are used only to score zone touch, close-through hold, and reversal recall.
- No trade simulation occurred: no capital, commissions, slippage, trade count, PnL, Sharpe, or drawdown apply.

## Reproduction

```bash
cd server
set -a && source ../collector/.env && set +a
node scripts/replay-confluence.js --min-history=90 --horizon-days=5
```

Configuration: `min_history=90`, `horizon_days=5`, daily OHLCV from the configured local PostgreSQL `price_history` table. No external API request is made by the replay.

## Result

- Run time: `2026-07-18T16:37:40.834Z`
- Symbols requested / eligible: `72 / 72`
- Data date range: `2024-10-02` through `2026-07-16`
- Control hold rate: `46.44%`; reversal recall: `27.30%`
- Confluence hold rate: `50.07%`; reversal recall: `22.14%`
- Composite relative improvement: `-2.07%`
- G5 threshold: `>=15%` composite lift **and** both component metrics improve.
- Gate: **failed**.

## Deployment Decision

Do not expose Confluence Zones in the production Analyze UI. The read-only API remains available for research. Improving or fitting the weights requires a separately approved v2 effort and a fresh replay; this result must not be reinterpreted as predictive validation.
