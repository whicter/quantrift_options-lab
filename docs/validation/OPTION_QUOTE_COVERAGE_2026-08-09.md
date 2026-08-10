# Executable option quote coverage — provider entitlement audit — 2026-08-09

## Goal

Establish, with production evidence rather than assumption, where executable
option bid/ask actually comes from, and what that implies for any product built
on `scanner_candidate_snapshots`. Triggered by a Sell Put page proposal whose
first acceptance check — "Short Put rows exist in the latest batch" — turned out
to be unverifiable on current data.

## Finding 1 — the Polygon Options plan returns no quotes at all

`PolygonOptionChainProvider` calls `GET /v3/snapshot/options/{symbol}`. On the
current plan that response carries **derived** values and omits the **raw**
market data:

| present | absent |
| --- | --- |
| `details` (type, strike, expiry, exercise style, shares_per_contract) | **`last_quote` block in its entirety** (bid, ask, bid_size, ask_size, midpoint) |
| `day` (open/high/low/close/volume/vwap/previous_close) | `last_trade` |
| `greeks` (delta, gamma, theta, vega) | `rho` |
| `implied_volatility` | `break_even_price` |
| `open_interest` | |

Polygon computes the exposed greeks and IV *from* the NBBO it holds but does not
serve at this tier. This is a deliberate tier split — derived output at the low
tier, raw market data at the high tier — not a data gap.

Confirmed directly against the quotes endpoint:

```
GET /v3/quotes/O:SPY260918C00650000  ->  HTTP 403
{"status":"NOT_AUTHORIZED","message":"You are not entitled to this data. Please upgrade your plan"}
```

**This is not a market-closed artifact.** Production evidence over a full week:

```
polygon_licensed contracts, 2026-08-02 .. 2026-08-09 : 299,883
  with bid                                            :       0

per trading day (snapshot window in ET):
  2026-08-05  00:00-22:48   26,691 contracts   0 bids
  2026-08-06  00:14-23:58   42,615 contracts   0 bids
  2026-08-07  00:01-23:55   40,243 contracts   0 bids
```

Those windows fully contain the 09:30–16:00 ET session. Zero bids have ever been
written from this source.

Related precedent already in the code: `polygon_option_chain_provider.py:47`
notes the delayed intraday minute spot is off by default "because the $29 Options
plan returns NOT_AUTHORIZED for it". The quote entitlement is the same boundary,
one endpoint over.

## Finding 2 — IB live mode DOES deliver executable quotes (corrects the 2026-07-18 record)

`docs/validation/IB_RAW_TICK_DIAGNOSTIC_2026-07-18.md` concluded that "complete
executable quote coverage remains blocked by IB API quote entitlement", based on
codes `10091`/`10167` observed **under `IB_MARKET_DATA_TYPE=3` (delayed)**.

That conclusion no longer holds. PM2 now runs `IB_MARKET_DATA_TYPE=1` (live) for
both `quantrift-options-collector` and `quantrift-options-quote-worker`, and the
one on-demand quote job that has run since produced a fully quoted chain:

```
snapshot 23608  ib_internal        2026-08-06 19:53  partial  44 rows  44 with bid  44 tradeable (bid>0, ask>0)
snapshot 25960  polygon_licensed   2026-08-09 23:09  ok       80 rows   0 with bid    0 tradeable
```

Caveats that remain true and must not be dropped:

- `provider_status='partial'` — IB returned 44 of the ~80 contracts Polygon
  covers for the same symbol.
- Quote quality on thin contracts is poor and needs filtering: observed
  `bid=0.54 / ask=1.14` (111% spread) and `iv=3.24` (324%) in the same snapshot.
- The delayed-mode finding was never wrong for delayed mode; only the
  generalisation to "IB cannot serve quotes" was.

**No code fallback may substitute `last` or a model price for bid/ask.** That rule
from the 2026-07-18 record stands unchanged and is reinforced below.

## Finding 3 — the quote plane collapsed on 2026-07-30, and the fix is a missing scheduler

`docs/ARCHITECTURE.md` §27 recorded 55 quoted symbols (54 IB, 1 TT) on 2026-07-15.
That is no longer true, and the cause is a side effect of a change that was
correct on its own terms.

`run_refresh_worker.option_provider_sequence` now returns `[primary_provider]`
alone when the primary is `polygon_licensed`, so the market-wide positioning lane
never falls back to IB. The stated reason is sound: a missing key, a timeout or a
quote-less response must not become a synchronous IB wait occupying a GEX worker
slot. But **that fallback was the only mechanism producing quote coverage at
scale.** After 2026-07-30 the quote plane depends entirely on
`analyze.js:317`, which fires only when a human opens Analyze for a symbol.
Four such jobs have ever been created.

```
before 2026-07-30   background refresh falls back to IB   -> ~55 quoted symbols
2026-07-30          background lane becomes Polygon-only  -> only mechanism removed
on-demand path      4 jobs ever, most recent 2026-08-06   -> 1 quoted symbol
```

**The infrastructure to fix this already exists and is running idle.**
`quantrift-options-quote-worker` is online with 0 restarts and has logged 101,264
lines of `No queued refresh jobs in quotes lane`. The lane partition in
`run_refresh_worker.run(queue_lane='quotes')`, the `option_quote_snapshot`
execution path, its dedupe (`INSERT ... WHERE NOT EXISTS (status IN ('queued','running'))`)
and its priority handling are all built and tested. The isolation architecture
reserved a dedicated lane and a dedicated process; nobody ever wrote the scheduler
that fills the queue.

So the remedy is a scheduler, not a new pipeline.

## Finding 3b — the candidate product has never run at universe scale

The candidate engine requires executable bid/ask to assemble a candidate. Quotes
exist only where an `option_quote_snapshot` job has run, and those are enqueued
solely from `server/src/routes/analyze.js:317` when a user opens Analyze for a
symbol. Four such jobs have ever been created, the most recent on 2026-08-06.

```
symbol_universe (scan_enabled, active)                 327
distinct symbols across ALL candidate batches, 7 days    1   (TTD)
candidates per batch                                     5
```

So `/api/scan`, `/api/v1/scanner/candidates`, `candidate_ledger` and every
downstream score have been operating over whatever one or two symbols someone
happened to open recently. Previously recorded observations such as "4,768
candidates, 59% time_spread, top three all MSFT Diagonal" describe a snapshot
taken after someone opened MSFT — they are not a full-market scan and must not be
read as one.

This ceiling is independent of the Sell Put proposal. That page was simply the
first feature whose acceptance criteria made it visible.

## Finding 4 — why `day.close` cannot stand in for a quote

Coverage is broad enough to tempt a substitution:

```
polygon_licensed contracts, last 2 days : 84,829
  volume > 0                            : 74,497 (87.8%)
  volume >= 10                          : 47,809 (56.4%)
  last price present                    : 74,497 (87.8%)
  open_interest > 0                     : 70,192 (82.7%)
```

It must not be done:

- `last` is a **transacted** price, not an **executable** one. Nothing can be
  sold at `last`.
- With no spread there is no way to evaluate execution cost. `contractEligible`'s
  `maxSpreadPct` gate and `scoreCandidate`'s `spreadFit` (20 of 100 points) both
  become inoperative.
- `payoffForCandidate` stamps `pricing_input: 'executable_bid_ask'` on every
  candidate. Substituting `last` turns that field into a false statement.
- The sampled contract above illustrates the trap: `volume: 2`, `open_interest: 1`,
  `close == previous_close == 71.43`, `change: 0` — a price that has not moved
  because nothing has traded.

## Licensing position (unchanged in substance, restated for the current phase)

`docs/wiki.md:872` and `docs/CLAUDE.md:63` bar `ib_internal`/`tt_internal` from
being the displayed source of a public or paid product. That constraint is
**deferred, not lifted**: the product owner confirmed on 2026-08-09 that the
project is not public and has no user login or billing, so IB and Tastytrade are
usable for the current internal phase. The constraint re-arms before any of
authentication, subscription, or public launch ships. Nothing in this phase may
assume the licensing question is settled.

## Consequence for planning

The next unit of work is **quote coverage over a curated list**, not more scoring
features. Concretely:

- A curated 40–60 symbol list (liquid, genuinely ownable names) is both a better
  fit for cash-secured put analysis than the 327-symbol scan universe (198 stocks
  / 122 ETFs, 64 sub-$10B names, 129 with unknown market cap) and roughly six
  times cheaper to quote.
- IB is serial by construction (fixed `IB_OPTION_CLIENT_ID=42`, one open
  `reqMktData` at a time, connect/disconnect per symbol): ~2 min/symbol healthy,
  up to ~16 min when quotes never arrive (240 contracts x `IB_OPTION_STREAM_TIMEOUT`).
  A 50-symbol sweep is ~100 min healthy — viable once or twice daily, not intraday.
- `RUNNING_JOB_TIMEOUT_MINUTES=15` is lane-agnostic, so a worst-case IB symbol is
  requeued while still running. Any batch sweep must address this.

## Files touched by the accompanying fix

None for this audit — it is an evidence record. The Phase 0 fixes recorded in
`docs/validation/LEDGER_POP_FIELD_FIX_2026-08-09.md` were made in the same
session and are prerequisites for measuring any of the above.
