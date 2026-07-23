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

## Methodological Caveats (recorded 2026-07-18 post-review; must be fixed before any v2 rerun)

Two geometry confounds are inherent to this zone-vs-point comparison. They bias the two
component metrics in opposite directions, and since the gate outcome was the conservative
one (do not ship), neither invalidates this run's decision — but a v2 rerun must not
inherit them:

1. **Zone-count asymmetry (favors the control on reversal recall).** The replay evaluated
   Confluence with `maxZones: 1` per side, while the control used every pivot S/R level
   (up to 3 bands per side). More bands mean more chances to be credited with a touch and
   a subsequent reversal, so the control was structurally advantaged on `reversal_recall`
   — exactly the metric Confluence lost. A rerun must align zone counts (e.g. top-3 vs
   top-3).
2. **Zone-width confound (favors Confluence on hold rate).** An ATR-wide zone has a lower
   `zone.low` than a ±0.5% band around the same level, so "every close stays above
   zone.low" is easier to satisfy for wider zones. Part of Confluence's hold-rate edge
   (50.07% vs 46.44%) is therefore a width artifact, not evidence of better level
   selection. A rerun should either normalize widths or score on a width-independent
   outcome (e.g. reversal from first touch only).

## Deployment Decision

Do not expose Confluence Zones in the production Analyze UI. The read-only API remains available for research. Improving or fitting the weights requires a separately approved v2 effort and a fresh replay; this result must not be reinterpreted as predictive validation.
