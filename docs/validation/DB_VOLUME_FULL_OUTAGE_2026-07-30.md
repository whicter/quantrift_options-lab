# Production Outage — Postgres Volume Full — 2026-07-30

## Symptom

Every data-backed page hung: Analyze stuck on 「分析中...」, `/market` stuck on
「加载状态矩阵...」, Scanner stuck on 「扫描中...」. No error was ever shown —
the pages spun indefinitely.

## Root cause

Railway Postgres `postgres-volume` reached **100% of its 5.00 GB capacity** and
the database deployment crashed (Railway showed "Crashed 1 day ago", i.e. around
2026-07-29 03:17 UTC — the timestamp of the last successful option snapshot).

Layer by layer, verified live rather than assumed:

- TCP to `tokaido.proxy.rlwy.net:13705` **succeeded** and the host pinged fine,
  so it was not a network fault.
- Postgres accepted the socket then closed it immediately
  (`server closed the connection unexpectedly`), consistently across retries.
- The Railway edge was healthy: an unknown route (`/api/health`) returned 404 in
  **1 second**, while every database-backed route hung for **~300 seconds** and
  then returned 502 (Railway's gateway timeout). So the Node service was up and
  blocking on the connection pool, not crashed.
- Railway's volume panel confirmed it: **"Volume Is Full — postgres-volume is at
  100% capacity", Max Size 5.00 GB.**

**Not caused by the R3.2 news work.** The `quantrift-news` PM2 entry had been
added to `ecosystem.config.cjs` but never started (`pm2 reload` was never run),
so it had never executed. The last manual DB writes from that work were
2026-07-26; the crash was 2026-07-29.

The real filler is ordinary operation: the option-snapshot pipeline at 303
symbols on a 7-day retention window. Measured after recovery:

| table | rows | size |
|---|---|---|
| `option_contract_snapshots` | 1,407,666 | 1983 MB |
| `option_oi_delta_snapshots` | 949,095 | 921 MB |
| `scanner_results_snapshots` | 405,172 | 895 MB |
| `scanner_candidate_snapshots` | — | 155 MB |
| everything else | — | ~250 MB |

Retention was **working correctly** — `option_chain_snapshots` spanned exactly
7 days (07-22 → 07-29). The steady state simply exceeded a 5 GB volume with no
headroom.

## Fix

`Live resize` 5 GB → 50 GB (Pro plan default; the plan upgrade alone only raises
the *ceiling*, the volume stays at its provisioned size until resized manually),
then redeploy the Postgres service.

## Post-recovery findings

**1. Data was intact.** All eight irreplaceable fact tables read cleanly
(full `count(*)` scans, which would surface most corruption). Nothing lost.

**2. `ANALYZE` was the difference between a broken and a working site.** After
recovery `/api/scan` took **27.3 s**. The crash had reset the planner statistics
(`pg_stat_user_tables.n_live_tup` read 0 for every table), so the query planner
was choosing plans blind. A single `ANALYZE` (10 s) took the same endpoint to
**1.0 s** — a 27× improvement with no schema, index or query change.

**3. A bytes-per-row bloat estimate was wrong.** From `1983 MB / 1.4M rows ≈
1.4 KB/row` this record initially concluded the table was ~85% dead tuples. The
actual dead-tuple ratio was **4.3%** — the table is genuinely that large (≈20
NUMERIC columns plus indexes), autovacuum is healthy, and `VACUUM FULL` was
**not** needed. Always read `n_dead_tup`; never infer bloat from average row
width, which cannot distinguish a wide row from a dead one.

**4. The irreplaceable data is only ~3% of the database.** 127 MB of fact tables
versus 4.2 GB total. Backing up what actually matters is cheap:
**9.4 MB gzipped.**

## Code changes made

- **`frontend/src/lib/api.js`** — added an `AbortController` deadline (30 s
  default, 60 s for `/api/scan`). `getJson` previously had no timeout, so a
  backend that accepts the connection but never answers left every fetch pending
  forever, making each page's `.catch(...)` branch unreachable. **This is why the
  UI spun instead of reporting an outage**; the pages already had honest error
  states, they were simply never reached.
- **`frontend/src/index.css`** — `.market-page` / `.ledger-page` used 36 px top
  padding under a 44 px `position: fixed` navbar, clipping their first line of
  content (other pages already compensated: home 44 px, analyze/scan 68 px).
  Also removed `.scan-alerts`' extra 24 px horizontal margin, which indented it
  relative to `.scan-page`'s own gutter.
- **`frontend/src/pages/Scan.jsx`** — the scan-pool card rendered
  `{universeCount || '...'}` followed by a separate `个已接入数据的标的`,
  producing the fragment 「...个已接入数据的标的」 whenever the count was
  unavailable, and could not distinguish a slow load from an outage. Now tracks
  the failure separately and renders a whole sentence.
- **`collector/backup_facts.py`** (new) — gzipped-CSV logical backup of the
  irreplaceable tables only, via `COPY` (no `pg_dump` binary exists locally, and
  the server is Postgres 18 which an older client-side `pg_dump` refuses).
  Wired into `ecosystem.config.cjs` as `quantrift-backup-facts`, daily 02:15 PT,
  keeping 14 runs.

## Backup contents and verification

First run wrote **9.4 MB** across 8 tables. Row counts and column headers were
verified against the live database, not merely assumed from a successful exit:

| table | rows | why it cannot be rebuilt |
|---|---|---|
| `candidate_ledger` | 23,342 | Point-in-time record of what the model recommended, scored at expiry. You cannot go back and ask the model what it thought. |
| `volatility_history` | 74,883 | The 252-observation IV Rank series. Rebuildable from Polygon but ~3 min/symbol ⇒ ~15 h for the universe, plus API spend. |
| `iv_history` | 683 | as above |
| `price_history` | 105,514 | Daily bars are cheap to refetch. |
| `price_history_30m` | 187,065 | The 30m provider lookback is finite; bars older than that window are unrecoverable. |
| `news_articles` | 49 | IB `tickNews` pushes only current headlines — no historical replay. |
| `external_flow_events` | 0 | WebSocket stream, no backfill endpoint. |
| `symbol_universe` | 303 | Rebuilding from `watchlist.txt` loses disable reasons and on-demand registrations. |

Deliberately **not** backed up: `option_contract_snapshots`,
`option_oi_delta_snapshots`, `scanner_results_snapshots`,
`scanner_candidate_snapshots`, `gex_*`. These are rematerialized continuously and
pruned on a retention window — worthless hours later, and 97% of the volume.

## Cost / sizing notes (verified against Railway docs)

- Volume limits are **per volume** (one volume per service), not a pool shared
  across projects. `quantrift-lab` and `kestrel.camp` resize independently.
- Billing is on **actual usage**, ~$0.15/GB·month, and the Pro plan's $20 fee
  includes $20 of usage across *all* resources (compute + storage + egress).
  So "under 1000 GB is free" is false; ~50–100 GB of storage alone would start
  exceeding the included allowance.
- 50 GB was chosen over the 1 TB maximum deliberately: the ceiling is the
  cost circuit-breaker. At 50 GB a runaway bug caps exposure at ~$7.50/month;
  at 1 TB the same bug runs to ~$150/month before anything stops it. Volumes
  grow on demand but generally cannot shrink.

## Pre-existing defects found by reading the recovery logs (all fixed 2026-07-30)

These were **not** outage damage — they were failing before the crash too. The
outage just made someone read the logs.

**1. Duplicate-key crash destroyed whole snapshots.** GME hit
`duplicate key value violates unique constraint
option_contract_snapshots_snapshot_id_expiry_strike_option__key`, key
`(19393, 2026-10-16, 20.0000, C)` — the provider returned the same contract
twice inside one chain. Because the whole chain is written in **one
`execute_values` call**, a single duplicated row aborted the entire symbol's
snapshot: every contract lost, not just the repeated one. `collect_options.py::persist_snapshot`
now dedupes on the table's own unique key `(expiry, strike, right)`, keeps the
first occurrence, and **logs a warning with the drop count** so a provider that
starts duplicating heavily stays visible rather than being silently trimmed.
Covered by `tests/test_persist_snapshot_dedupe.py` (3 cases, including that a
same-strike put and a same-strike different-expiry call are *not* duplicates).

**2. Five invalid tickers, verified live before touching anything.** All were
checked against both Polygon reference and options-contracts endpoints rather
than inferred from a single job error:

| symbol | reference | option contracts | action |
|---|---|---|---|
| `BRK` | **404** | 0 | disabled — not a tradable ticker |
| `BRK.A` | 200 | **0** | left alone (not in the universe) |
| `BRK.B` | 200 | 1+ | **kept enabled** — the correct Berkshire line, already in `watchlist.txt` |
| `KPK` / `LSL` / `LTV` / `TITI` | **404** | 0 | disabled — delisted/nonexistent |

`BRK` was never in `watchlist.txt`: `sync_universe.py` adopted it because it had
appeared in a history table, and that script **only ever adds/activates**, so it
could never leave on its own and had to be disabled explicitly. This is distinct
from the `occ_ticker` dotted-symbol bug — that symbol was mis-encoded, this one
is simply wrong. `KPK`/`LSL`/`LTV`/`TITI` were removed from `watchlist.txt`
*and* disabled in `symbol_universe`, since removal from the seed file alone does
not stop scanning. Scan-enabled universe: 303 → **296**.

**3. Two zombie jobs** stranded in `running` since 2026-07-26 (TITI, BABA) were
reclaimed as `failed` with an explicit reason.

## Still open (needs the Railway UI, cannot be done from code)

**Volume alert thresholds.** Alerts were *enabled* but did not warn in time —
the volume filled and the site was down for over a day before anyone noticed.
Thresholds should be set to **70% / 85%**. With 50 GB provisioned this should
never fire, which is exactly the point.

## Note on `tickNews` delivery being intermittent

While verifying the R3.2 news collector after the reload, repeated subscriptions
returned **inconsistent** results: identical calls minutes apart returned 10
headlines, then 0, then 5. A reqId-range hypothesis was tested and **disproved**
— subscribing the same symbol at reqId `0` and reqId `4000` on one connection
returned 5 headlines each, so low reqIds are not the cause. The delivery of the
seed burst is simply not guaranteed per subscription.

This is **tolerable by design and does not need a fix**: `news_articles` is an
accumulating table deduped on `(symbol, provider_code, article_id)`, and the
collector runs every 5 minutes, so a run that receives nothing costs nothing and
the next run picks the headlines up. A live end-to-end run confirmed it working:
`{'universe': 296, 'fetched': 11, 'written': 1, 'symbols_with_news': 3}` — 11
headlines received, 10 already known, 1 genuinely new. Worth remembering that
neither IB news path (`reqHistoricalNews` cache, `tickNews` push) offers a
delivery guarantee; the accumulating-dedupe design is what makes either usable.

## PM2 note

`quantrift-news` and `quantrift-backup-facts` existed only in
`ecosystem.config.cjs` and had **never run** — the config was edited but
`pm2 reload` was never issued. Both are now started, and `pm2 save` was run so
the LaunchAgent's `pm2 resurrect` restores all seven Quantrift apps rather than
the previously saved five. Editing `ecosystem.config.cjs` alone changes nothing
at runtime.

## Verification

- Production endpoints after recovery + `ANALYZE`: `/api/status/data` 200 (0.32 s),
  `/api/market/state-matrix` 200 (2.06 s), `/api/news/AAPL` 200 (1.20 s),
  `/api/scan` 200 (**1.04 s**, down from 27.34 s).
- Collector resumed writing option snapshots (first post-recovery write: `IHI`).
- Collector suite 287/287; frontend lint + 95/95 + build + `check:dist` clean.
