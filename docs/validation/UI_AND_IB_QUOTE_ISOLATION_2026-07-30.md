# UI Theme, Scanner Density, and IB Quote Isolation Validation — 2026-07-30

## Scope

This record covers the final 2026-07-30 state of:

- dark/light semantic color hierarchy for Analyze and Scanner;
- complete, elastic Scanner headers and soft-indented detail lines;
- removal of truncated or duplicated strategy facts and unexplained internal copy;
- isolation of market-wide Polygon/GEX refresh from user-requested IB strategy quotes;
- PM2 configuration, operator documentation, and regression coverage for both lanes.

No database migration is required. Existing snapshots and jobs remain additive.

## UI contract

Dark and light modes consume the same semantic roles for page background,
surface, muted surface, strong border, primary/secondary text, and status
accents. Section boundaries and metric accents are stronger in both modes while
the existing Quantrift visual identity remains intact.

Scanner columns stretch elastically, but every header remains fully visible.
Positioning and strategy details are split into atomic, wrapping lines with a
soft bullet indent; ellipsis and truncation are not used for those facts.

Presentation rules:

- expiry and DTE share one line;
- OI and spread share one line;
- Gamma sign and net GEX share one line;
- Debit or Credit appears once;
- each remaining strategy fact receives its own line;
- snapshot-delay and community-sample diagnostics are not default product copy;
- unavailable POP identifies the missing model/input instead of printing a
  generic `不可用`.

## Data-flow contract

```text
market-wide scheduler
  -> option_chain_snapshot / polygon_licensed
  -> persist structural chain
  -> compute GEX + OI delta + scanner derivations
  -> complete even when bid/ask is absent

Analyze request needing executable strategy legs
  -> option_quote_snapshot / ib_internal / priority 90
  -> dedicated quantrift-options-quote-worker
  -> persist quote-bearing chain
  -> rematerialize scanner candidates
  -> do not compute or overwrite GEX/OI delta
```

The primary worker claims every supported refresh job except
`option_quote_snapshot`, with batch size 10 and bounded in-process concurrency
3. The quote worker claims only `option_quote_snapshot`, with batch size 1 and
concurrency 1. An IB timeout therefore occupies only the requested symbol's
quote lane and cannot consume a Polygon/GEX slot.

Background scheduling no longer writes `require_quotes`. Analyze can request a
follow-up quote job after a missing Polygon chain is persisted, or immediately
when a structural chain already exists without usable bid/ask. Active refresh
jobs are deduplicated regardless of age.

## Automated verification

Executed from the repository on 2026-07-30:

- Frontend `npm run verify`: ESLint passed; 96/96 tests passed; Vite production
  build passed; `check-dist` scanned 8 files with no source maps or secret
  patterns. Vite emitted the existing non-blocking large-chunk warning.
- Server `npm test`: 244/244 tests passed after rebasing onto the latest
  candidate-ranking changes already present on `origin/master`.
- Collector `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'`
  from `collector/`: 289/289 tests passed.

The regression assertions cover full Scanner labels, atomic detail splitting,
Gamma grouping, pricing deduplication, Analyze quote enqueue behavior, active
job deduplication, lane-specific claiming, Polygon completion before quote
enqueue, quote persistence without GEX recomputation, and PM2 runtime defaults.

## Deployment boundary

Code and local automated validation are complete. This record does not claim
that the new PM2 process is already running on the Mac Studio.

After pulling the commit on the Mac Studio:

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab
pm2 startOrReload collector/ecosystem.config.cjs --update-env
pm2 save
pm2 status quantrift-options-collector quantrift-options-quote-worker
```

Acceptance requires the primary collector online as one PM2 app, the quote
worker online as one PM2 app, and the saved process list updated from the
previous seven Quantrift apps to all eight current apps. Editing
`ecosystem.config.cjs` or pushing Git alone does not change the Mac Studio
runtime.

## Production smoke

1. Analyze a symbol whose latest Polygon chain has no usable bid/ask.
2. Confirm one active `option_quote_snapshot` with provider `ib_internal` and
   priority 90.
3. While that IB request is deliberately slow or unavailable, confirm new
   `option_chain_snapshot` jobs continue to succeed through
   `polygon_licensed`.
4. Confirm the quote job does not create a GEX snapshot sourced from IB.
5. Confirm dark and light Scanner modes show complete column titles and
   wrapping positioning/candidate facts without duplicate Debit/Credit.

## Rollback

Delete the dedicated PM2 quote worker and revert the code commit. Existing
Polygon/GEX and quote-bearing snapshots may remain; no destructive schema
rollback is needed. Any queued `option_quote_snapshot` jobs can be marked
failed or consumed after the forward fix is restored.
