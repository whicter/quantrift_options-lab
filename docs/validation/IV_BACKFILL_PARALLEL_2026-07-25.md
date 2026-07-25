# IV Backfill: Parallelization + 429 Retry (2026-07-25)

## Trigger

After the watchlist restore (293 symbols), 120 needed IV history backfill. The
user asked how long it would take and whether the architecture could speed it up.

## Measured baseline

From the running serial job: **4.02 min/symbol** (19 symbols in 76.4 min).
120 symbols → **~7.3 hours** serial.

## Bottleneck analysis

`backfill_iv_history.py` is a **bypass path**: unlike the main collector it does
**not** use the shared `provider_rate_limits` PostgreSQL gate. `PolygonHistory._get`
was a bare `session.get()` — no pacer, no retry. So the cost is pure sequential
HTTP round-trips: per trading day it walks expiries × up to 5 strikes × call+put,
so ~1,500 requests per symbol over 275 days, issued one at a time.

Three options evaluated:

| Option | Verdict |
|---|---|
| Polygon grouped daily aggregates (all option closes for a date in one call) | ❌ Not available — `/v2/aggs/grouped/.../options/{date}` returns HTTP 400: valid market types are stocks, fx, crypto only |
| Parallelize across symbols | ✅ Adopted — symbols are fully independent, no shared state, upserts keyed by (symbol, date) |
| Per-contract range caching | 💡 Deferred — `option_close` fetches `/range/1/day/{d}/{d}` (one day per call), but the same contract is re-queried across many consecutive as-of dates; fetching the full range once per contract would cut requests ~6x. Requires restructuring the per-day flow; not attempted while a long job was in flight. |

## Finding: no 429 handling at all (real robustness gap)

Launching 6 workers killed two of them within 20 seconds with
`429 Too Many Requests`. CLAUDE.md's note that "Polygon paid plans allow
unlimited API calls" is about the absence of a **monthly quota** — a per-second
rate limit still applies. Serial execution happened to stay under it, which is
why this went unnoticed.

The blast radius was worse than a slow-down: the 429 surfaced from
`underlying_closes`, which runs *before* the per-day `try/except`, so it killed
the **entire symbol** rather than degrading a single day.

## Fix

`_get` now retries 429 and 5xx with exponential backoff, honoring `Retry-After`
when present, bounded by `IV_BACKFILL_MAX_RETRIES` (5),
`IV_BACKFILL_BACKOFF_BASE_SECONDS` (2), `IV_BACKFILL_BACKOFF_MAX_SECONDS` (30).
Non-retryable statuses still raise immediately. This also hardens the serial
path — the earlier CRCL run lost a day to a transient read timeout.

## Verification

- Unit tests +5: retry-429-then-succeed, `Retry-After` honored, 5xx retried,
  gives up after max retries, non-retryable raises without sleeping.
  Collector suite **277/277**.
- Runtime: 6 workers → 2 crashed in <20s. After the fix, **3 workers run clean,
  zero crashes**. 3-way parallel projects to ~2.5h vs ~7.3h serial.
- Deliberately chose 3 workers over 6 so backoff has headroom rather than
  relying on retry to absorb a sustained overload.

## Result-checking discipline

Per the `occ_ticker` lesson (same day), completion is verified by
`computed`/`written` counts, not exit codes. Two distinct zero-cases exist and
mean different things:

- `days: 275, computed: 0` → **bug** (every request failed; this is how the
  dotted-ticker `occ_ticker` defect hid).
- `days: 0, computed: 0` → **legitimately no data** — the symbol has no
  underlying price history in the window (e.g. `ACAC`, a delisted SPAC).

## Files

- `collector/backfill_iv_history.py` — retry/backoff in `_get`, `time` import,
  `MAX_RETRIES`/`BACKOFF_*` constants.
- `collector/tests/test_backfill_iv_history.py` — `RetryBackoffTest` (5 cases).
