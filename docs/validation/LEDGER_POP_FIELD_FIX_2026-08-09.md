# Candidate ledger — POP capture read the wrong field — fixed 2026-08-09

## Defect

`server/src/routes/ledger.js::captureLedger` selected the risk-free rate into the
ledger's `pop` column:

```sql
CASE WHEN s.signals_json->'pop'->>'status' = 'unavailable' THEN NULL
     ELSE (s.signals_json->'pop'->>'rate')::numeric END
```

`pop.rate` is `RISK_FREE_RATE`. The probability lives at `pop.probability`. Both
keys sit in the same object emitted by `popForCandidate`, one word apart.

## Production evidence

```
SELECT pop, count(*) FROM candidate_ledger WHERE pop IS NOT NULL GROUP BY pop;

  pop = 0.0450   rows = 212      <- the only value present, ever
```

Every captured row held the risk-free rate. `aggregateLedger`'s `POP_BUCKETS`
therefore placed 100% of the ledger in the `0-40` bucket, and
`actual_win_rate` was being compared against a predicted midpoint of 20% for
trades whose real predicted probability was never recorded. **POP calibration —
the ledger's stated purpose — has produced nothing usable since it shipped.**

## Fix

`pop->>'rate'` → `pop->>'probability'`, with the incident recorded inline so the
two keys are not reconfused.

## Historical rows are NOT backfilled

The true probability for those 212 rows is unrecoverable: it lived in
`scanner_candidate_snapshots.signals_json` of batches that `pruneOldBatches` has
long since CASCADE-deleted (`SCANNER_CANDIDATE_BATCH_KEEP`, then 5). Reconstructing
a probability from today's chain would be fabricating a point-in-time prediction
after the outcome is known — the exact look-ahead the ledger exists to avoid.

Instead `aggregateLedger` gained an explicit floor:

- `LEDGER_CALIBRATION_FROM_DATE` (env, unset by default) drops rows entered before
  a given date from the calibration table **only**.
- `calibration_from_date` and `calibration_excluded` are returned alongside, so a
  thin calibration can never read as a broad one.

**Scope note:** the bug corrupted the *prediction*, never the *outcome*. Win
rates, `by_family` and `overall_win_rate` over the same rows remain valid and
deliberately keep counting them. Only the predicted-vs-actual comparison is
affected.

## Two related defects fixed in the same pass

**`legs_json` carried no `iv`.** `materializeScannerCandidates.js::toLeg` projected
`{action, expiry, dte, strike, right, bid, ask, delta}`. `candidate_ledger.legs_json`
is a verbatim copy, so settling a multi-expiry structure — which requires repricing
the surviving far leg at the near expiry — had no volatility to work from. `iv` is
now carried. It is internal JSONB only; neither `candidateDto.cjs` nor
`publicCandidateDto.cjs` projects it, since a chain row is backend-only under
`docs/ANALYZE_DECISION_RULES_INTERNAL.md` §6.

Verified in production after the change:

```
TTD Long Call  {'iv': 0.745223, 'ask': 2.48, 'bid': 2.4, 'dte': 68, 'delta': 0.5846, ...}
```

**Scan-scoped jobs were swept to failed.** `collector/run_refresh_worker.py::fail_unrunnable_queued_jobs`
exempted only `scanner_materialize` from its ticker-shaped-symbol check, while the
enqueue side (`SCAN_LEVEL_JOB_TYPES` in `server/src/lib/refreshJobs.js`) already
accepted `scanner_candidate_materialize` too. Every candidate-materialize job
`routes/scannerCandidates.js` queued on a stale batch was failed with
`invalid queued refresh symbol` before it could run, so candidate batches were
only ever produced by the daemon's timer — the on-demand path had never worked.
The exemption is now a module-level `SCAN_SCOPED_JOB_TYPES` tuple passed as
`job_type = ANY(%s)`, so the next scan-scoped type cannot repeat the bug.

## Operational change

`SCANNER_CANDIDATE_BATCH_KEEP` raised 5 → 20 in `collector/ecosystem.config.cjs`.
A batch is written every scan cycle, so at 5 a bad ranking change CASCADE-drops
every known-good batch within ~25 minutes, leaving nothing to diff a regression
against. Return it to 5 once the scoring/pricing work is accepted.

## What the ledger can and cannot currently tell us

After the fix the ledger holds:

```
outcome         rows   avg RoR    entry range
(unresolved)     360         -    2026-07-30 .. 2026-08-07
not_evaluable     36         -    2026-07-30 .. 2026-08-06
no_price          11         -    2026-07-30
loss               9    -0.860    2026-07-28
win                6    +0.250    2026-07-28

by family (scored rows only):
  credit_vertical     3 win / 0 loss
  iron                3 win / 0 loss
  single_leg          0 win / 7 loss
  straddle_strangle   0 win / 2 loss
```

**15 scored trades, all entered on a single day.** They are not 15 independent
observations — every position was exposed to the same market move, so this is
closer to n=1. The clean split (every credit structure wins, every long-premium
structure loses) is what one quiet session produces; it describes 2026-07-28, not
the strategies. The asymmetry is worth noting for later (+0.25 avg on wins vs
-0.86 avg on losses is the characteristic shape of high-POP structures, and is
exactly why POP must never be presented as an expectation), but at this sample
size nothing is inferable.

`not_evaluable` at 36 of 62 resolved rows (58%) tracks the time_spread share of
the enumeration and is the multi-expiry repricing gap, not a data error.

Combined with `docs/validation/OPTION_QUOTE_COVERAGE_2026-08-09.md` — candidates
have covered exactly one symbol in seven days — the conclusion is that the
ledger's sample is limited by candidate flow, not by the ledger. Restoring flow
is the prerequisite for any claim about whether the scoring model works.

## Tests

- `server/test/ledgerCapture.test.js` — asserts the capture SQL matches
  `pop'->>'probability'` and does **not** match `pop'->>'rate'`.
- `server/test/materializeScannerCandidates.test.js` — asserts every persisted leg
  carries `iv`, with the chain value rather than a placeholder.
- `collector/tests/test_scan_scoped_job_sweep.py` — asserts the sweep exempts
  every scan-scoped type, that the list is a parameter rather than a SQL literal,
  and that it agrees with the enqueue-side allowlist.

`server` 293 pass, `collector` 338 pass, `scripts/scan-secrets.sh` clean.
