# Phase 2.5 Historical IV Backfill Verification

Date: 2026-07-18

## Scope

Validated the historical ATM-IV repair for the high-liquidity acceptance set. The backfill source is Polygon EOD option aggregates and the target store is PostgreSQL `volatility_history`.

## Commands

```bash
cd collector
.venv/bin/python -m unittest discover -s tests

set -a && source .env && set +a
.venv/bin/python -u backfill_iv_history.py \
  SPY QQQ IWM GLD TLT TSLA XLB XLC XLE XLK XLU XLY XHB XSD --days 400

.venv/bin/python -c "import derive_volatility as d; d.run(
  backfill=False,
  symbols='SPY QQQ IWM GLD TLT TSLA XLB XLC XLE XLK XLU XLY XHB XSD'.split(),
)"
```

## Results

- Test result: 226 collector unit tests passed.
- `iv_rank_ready=true`: SPY 262, QQQ 274, IWM 274, GLD 276, TLT 276, TSLA 276, XLC 275, XHB 275 ATM-IV observations.
- Historical-data exceptions: XLB 157, XLE 158, XLK 166, XLU 156, XLY 155, XSD 203. Their historical Polygon EOD option bars do not supply 252 usable dates; XLB/XLE/XLK/XLU/XLY become continuous only around 2025-12 in the database coverage query.

## Verification Boundary

This verifies code behavior, database persistence, and derived-rank readiness. It does not claim parity with another vendor's IV methodology. Values remain sourced from reconstructed Polygon EOD option prices, with `iv_source='polygon_backfill_bs'`.

## Rollback

Code rollback: revert `d7175d4`, `cb9f639`, and `5a11d4b` in reverse order. The upserted rows are source-tagged and can be replaced by a subsequent deterministic replay; no destructive row deletion is required for rollback.
