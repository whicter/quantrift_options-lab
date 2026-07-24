# Candidate Result Ledger (R2.1) — backend — 2026-07-24

## Goal

An honest track record: score PAST scanner candidates by their actual outcome, as
a trust layer and — the second bird — the labeled data needed to fit the candidate
scoring weights (repaying the "打分权重未经验证" debt). Model validation, never a
copy-trade signal.

## Two real data-readiness gates (facts, not scope questions)

1. **The candidate snapshots are pruned.** V3A-2 `pruneOldBatches` keeps only the
   newest ~5 completed batches per scan_key, so a candidate materialized today does
   not survive to its expiry weeks later. A **durable** ledger table is required —
   the ledger cannot read outcomes off the pruned snapshots.
2. **Nothing has expired yet.** The snapshots only go back to today (2026-07-24);
   the earliest candidate expiry is 2026-08-21. So the ledger **starts empty and
   fills as candidates expire**, exactly like the IV-Rank 252-observation gate.
   Building it now matters because it starts the clock.

## Implementation

- **`candidate_ledger`** (migration, applied to production): durable, not pruned.
  `UNIQUE (candidate_key, expiry)` so each candidate is captured once at first
  sighting (its entry). Outcome columns are nullable until resolved.
- **Pure engine** `server/src/domain/scanner/ledger.cjs`:
  - `evaluateOutcome(entry, underlyingAtExpiry)`: for a single-expiry defined-risk
    structure, payoff at expiry = entry_cash + Σ(BUY:+intrinsic / SELL:−intrinsic).
    Returns win/loss + realized_pnl + return_on_risk. **Multi-expiry structures
    (calendars/diagonals) → `not_evaluable`** (the far leg needs repricing; never
    guessed); a missing underlying close → `no_price`.
  - `aggregateLedger(resolved)`: win rate by strategy family, POP calibration
    buckets (predicted vs actual win rate), overall win rate — computed over
    win/loss rows only, with `not_evaluable`/`no_price` counted and surfaced so
    coverage is honest.
- **`routes/ledger.js`**: `captureLedger` (batch → ledger, `credit`→positive /
  `debit`→negative entry_cash, POP dropped when the engine flagged it
  `unavailable`), `evaluateLedger` (resolves expired rows against
  `price_history`'s close on/after expiry), `GET /api/scanner/ledger`. Capture +
  evaluate are wired best-effort into `materializeScannerCandidates.runMaterialization`,
  so the ledger accumulates every scan cycle and never fails a batch.

## Verification

- Unit tests (8, `test/ledger.test.js`): leg intrinsic; credit put spread max
  profit above / max loss below; long call = intrinsic − debit; long straddle on
  a big move; calendar → not_evaluable; missing close → no_price; aggregate win
  rate + POP calibration excluding unscored; empty-safe. Server suite 211/211.
- Live seed (2026-07-24): migration applied; `captureLedger` on the latest batch
  captured **4,735** candidates across 6 families; `evaluateLedger` resolved **0**
  (earliest expiry 2026-08-21). Single-expiry evaluable ≈ 1,240 (single_leg 455,
  iron 430, credit_vertical 146, straddle_strangle 111, combo 98); time_spread
  3,495 will settle as `not_evaluable`.

## Remaining

Frontend "模型记录" page (mostly "accumulating" until late Aug, then win-rate /
calibration tables). A fixed-N-day-horizon evaluation (in addition to at-expiry).
POP is currently mostly `unavailable` (strategies with no static-breakeven model),
so calibration waits on usable POP.

## Files

- `server/src/migrate.js` — `candidate_ledger` table + partial indexes.
- `server/src/domain/scanner/ledger.cjs` — evaluate + aggregate engine.
- `server/src/routes/ledger.js` — capture / evaluate / serve; `server/src/index.js`
  mount (`/api/scanner`, `requireEntitlement('scanner')`).
- `server/src/jobs/materializeScannerCandidates.js` — best-effort capture+evaluate.
- `server/test/ledger.test.js` — 8 tests.
