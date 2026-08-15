# Market breadth: publication lag and history backfill — 2026-08-15

## Goal

`market_breadth_daily` had 11 sessions (2026-07-30 onward). Two things needed
establishing before anything can be built on it: when a session actually becomes
readable, and how far back the series can be extended.

Both came out of reviewing a design note in `quantrift_stock` that proposes
reading this table as a forward data source. The work here is scoped to this
repository; nothing in that project is touched.

## Finding 1 — the table lags the market by a full session, not by hours

`MARKET_BREADTH_EOD_SETTLE_HOUR_ET=20` assumes a session is fetchable the same
evening. It is not. Measured from the collector's own logs:

```
2026-08-14 17:05 PT (20:05 ET)  requested 2026-08-14 -> 403, settled on 2026-08-13
2026-08-14 19:05 PT (22:05 ET)  requested 2026-08-14 -> 403, settled on 2026-08-13
2026-08-15 14:10 PT (17:10 ET)  manual probe: 2026-08-14 -> 200, 12,424 rows
```

So both evening runs take a 403 on the session that just closed and write the
prior one. The row available during any given session is **D-2**, not D-1.

That matters for a consumer wanting "yesterday's breadth" intraday: they are
reading the day before yesterday. Nothing here is wrong -- the walk-back added on
2026-08-09 is doing exactly its job -- but the write-up said "daily automatic"
without saying *which* day, and a feature named for `t-1` cannot be computed from
this table during `t` unless publication moves earlier.

**Probe added rather than a guess.** The publication moment sits somewhere
between 22:05 ET on D and 17:10 ET on D+1; a Saturday cannot narrow it further.
`quantrift-market-breadth` now fires at `5 3,17,19 * * 1-5` PT — 06:05 / 20:05 /
22:05 ET. `expected_market_date` already resolves any hour before the settle hour
to the previous session, so the morning fire asks for D-1 with no code change. If
Polygon has published overnight the row lands before the 09:30 open; if not, the
walk-back idempotently rewrites D-2 and nothing is harmed. The log line
distinguishes the two: a morning `settled on` with no `skipping` clause means D-1
was available.

Read it after a few sessions and the question is answered by measurement.

## Finding 2 — grouped daily is a rolling two-year window

Probed with spacing to avoid confusing rate limits for entitlement (the first
sweep returned 429s that look nothing like the 403 boundary):

```
2024-08-16  200      <- today minus two years
2024-02-16  403
2023-08-16  403
2023-08-17  403
2022-08-16  403
2021-01-04  403
2020-01-02  403
2018-05-01  403
```

Today is 2026-08-15, so the floor tracks the calendar. Any backfill bound must be
re-probed rather than hardcoded and trusted; `BREADTH_BACKFILL_START` exists for
that and the constant carries the measurement date.

## Why backfill at all

Not for the design note. For this repository's own Phase 1 exit gate, which
requires historical event validation: returns and MA20 retention over the 5/10/20
sessions after a trigger, walk-forward split, base rate disclosed. Eleven
sessions cannot support that. ~508 sessions can support a first pass, though the
number of *independent* rebound events in two years is small and that limitation
should be stated wherever the results are.

## The backfill

`collector/backfill_market_breadth.py` drives `collect_market_breadth.run()` one
session at a time.

- **Resumable by construction.** Days already stored are skipped and the writer
  is idempotent on `market_date`, so re-invoking with the same arguments
  continues. At ~2.3 min/session a full range is a ~19 hour job that will meet a
  sleep, a dropped connection or a rate-limit penalty somewhere.
- **Newest first.** If the run is cut short, what survives is contiguous with the
  data already present rather than a floating island.
- **Provider default pacing, deliberately.** The `breadth` pacing scope is our
  own bookkeeping; Polygon meters the account, so a backfill that outruns the
  shared limiter earns 429s for the option/GEX lane too. A slow backfill is a
  cost; a throttled production refresh is an outage.
- **Holidays are not modelled.** A closed session has no grouped-daily response
  and the collector's walk-back reports it. Encoding a holiday calendar would be
  a second source of truth for something the provider already answers.
- The default end is *today*, not "the day before the earliest row". The range is
  filtered against what is stored, so asking for the whole window fills every
  hole; anchoring on the earliest row stops at the first isolated session anyone
  wrote ahead of the block, which is exactly what happened during development.

Measured on historical dates: 2m08s for a single session, coverage 99.4%, so
quality does not degrade going back.

## The Databento export is deliberately not merged

`~/Downloads/XNAS-20260810-JLNA94QEHN` holds `XNAS.ITCH` `ohlcv-1d` for
ALL_SYMBOLS, 2018-05-01 → 2026-08-07, 2,079 sessions, 503 MB. It is eight years
against our two, it is already local, and it does cover NYSE-listed names --
anything that trades on Nasdaq appears in it.

It still must not go into `market_breadth_daily`:

| | this table | that export |
| --- | --- | --- |
| price | Polygon grouped daily, consolidated | XNAS.ITCH, one venue |
| universe | point-in-time common stock across XNAS/XNYS/XASE | everything traded on Nasdaq, filtered by directory |
| volume | whole market | the Nasdaq share only |

A NYSE-listed stock's advance/decline in that export is decided by its **Nasdaq
close**, not its consolidated close. Most days agree; they are still different
quantities, and the volume fields are not close at all — `advancing_volume` here
means the whole market, there it means one venue's slice.

Writing it into a table that is defined by the Polygon path and is still being
appended to daily by that same path would produce a series that cannot be
compared with itself across the join. If eight years turns out to be necessary,
the right shape is a separate table with its own stated provenance, reported
alongside — not a splice.

## State at the time of writing

Backfill running in the background, 33 sessions stored, reaching back to
2026-07-01, coverage 99%+ throughout. The morning probe is live and will produce
its first evidence on the next trading day.
