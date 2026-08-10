# Local persistence audit and relocation — 2026-08-09

## Goal

Establish what this system actually persists and what it costs, then stop the
boot disk absorbing unbounded diagnostic output.

## What is persisted, and where

**Railway PostgreSQL — 2,002 MB.** Retention is complete; nothing large grows
without bound.

| table | total | heap | index | rows |
| --- | --- | --- | --- | --- |
| `option_contract_snapshots` | 818 MB | 521 | 296 | 302,651 |
| `option_oi_delta_snapshots` | 492 MB | 119 | **373** | 274,715 |
| `scanner_results_snapshots` | 411 MB | 263 | 147 | 144,607 |
| `price_history_30m` | 95 MB | 44 | 51 | 272,751 |
| `price_history` | 37 MB | 17 | 20 | 126,605 |
| remaining 19 tables | 149 MB | | | |

`option_chain_snapshots` (7 days) CASCADEs to `option_contract_snapshots`,
`option_oi_delta_snapshots` and `gex_by_strike_snapshots`, so pruning the parent
bounds all four. `scanner_results_snapshots` is 3 days; candidate batches are
kept by count. Source-fact tables (`price_history` back to 2024-09,
`volatility_history` to 2025-01) are intentionally durable and total only 132 MB.
Autovacuum is current, dead tuples 7–19%.

**166 MB of the database is index that has never been read.** On
`option_oi_delta_snapshots`:

```
_snapshot_id_contract_key_key   126 MB   16,002,758 scans   <- carries the load
_symbol_unusual                 103 MB            0 scans   <- never used
_symbol_ts                       81 MB      577,479 scans
_pkey                            63 MB            0 scans   <- never used
```

That is 8% of the whole database. Not acted on in this pass: dropping `_pkey`
needs a check for foreign keys pointing at it first.

**Local disk — 887 MB of PM2 logs**, of which `quantrift-news-error.log` was
683 MB: 5.3M lines, dominated by ibapi protocol frames logged at INFO.

```
50,326  INFO REQUEST reqMktData
49,871  INFO SENDING cancelMktData
49,871  INFO REQUEST cancelMktData
48,971  INFO ANSWER tickReqParams
48,896  INFO ANSWER marketDataType
```

The news collector subscribes and cancels market data for the whole universe in
batches every five minutes; each pair emits ~5 lines. Ten days, ~68 MB/day.
`run_quote_worker_daemon.py` already silenced these loggers for exactly this
reason; the news lane was missed.

**Local disk — 132 MB of fact backups** at `~/quantrift-backups`, alongside a
same-named set already accumulating on the external volume.

## Changes

**Source fix first.** `collect_news.py` now sets the `ibapi*` loggers to WARNING,
matching `run_quote_worker_daemon.py`. Measured after restart: 275 bytes over 9
minutes across 3 collection cycles, zero protocol lines — four orders of
magnitude below the previous rate.

**Relocation.** Local persisted data moved to
`/Volumes/X9_Pro/data_seriliazation/`, one folder per project. The volume already
held an established layout (`quantrift_options-lab/fact-backups`, `gex-history`,
`research/minute-bars`, plus `quantrift_stock` and a `stock_volatility_alert`
data lake); the existing underscore naming was adopted rather than a new one
invented. `ecosystem.config.cjs` gained a `logs(name)` helper that derives both
`out_file` and `error_file` from the app name, and `FACT_BACKUP_DIR` now points
at the external volume.

**Rotation.** New `collector/rotate_logs.py`, run hourly by
`quantrift-log-rotate`.

## Findings worth keeping

**`pm2 reload` does not rebind log paths.** After reload, `out_file`/`error_file`
in the process env held the new external paths while `pm_out_log_path` /
`pm_err_log_path` — the values PM2 actually writes to — still pointed at
`~/.pm2/logs`. Confirmed empirically: the old files were still being appended to
a minute later. PM2 resolves log paths at process creation, so `delete` + `start`
is required. Only the 11 quantrift apps were recreated; the 19 apps belonging to
other repositories were left untouched and verified healthy afterwards.

**The first archive copy was incomplete, and size comparison alone hid it.**
Copying while the processes were still writing left 8 of 22 files short by
between 52 bytes and 3.9 KB. Re-synced after the processes stopped and verified
by MD5 — comparing sizes would have passed on a same-size file with different
content, so checksums are the only acceptable evidence before deleting a source.

**One backup run on the external volume was a truncated copy.** Comparing the
two sets file by file rather than by directory name:

```
20260730T200502Z   local 9 files, external 0    entire run missing
20260730T215404Z   local 9 files, external 4    5 files missing, incl. manifest.json
                                                and candidate_ledger.csv.gz (23,430 rows)
20260731..0809     local 9, external 9          identical by checksum (11 runs)
20260804T091459Z   local 0, external 0          the backup run itself had failed
```

The 4 files that were present matched byte for byte, so this was an interrupted
copy rather than a divergent version. 14 files (9.8 MB) were backfilled and
re-verified before `~/quantrift-backups` was deleted. Had the check been by
directory listing, two `candidate_ledger` snapshots would have been lost.

**A same-named empty run exists on both sides** (`20260804T091459Z`), meaning
that backup attempt produced only a directory. Not investigated here; recorded so
a future gap in the series has an explanation.

## Rotation design

Scoped to `LOG_DIR` rather than installed as `pm2-logrotate`. That module becomes
a PM2 process rotating every log PM2 manages with no per-app exclusion, so
installing it would change log behaviour for the ib-bot and stock-alert
workloads in other repositories. This stays in one directory, needs no sudo, and
its settings travel with the code.

**Copy-then-truncate is mandatory, and the test asserts the inode.** PM2 holds an
open descriptor per log; renaming or replacing the file leaves it writing to an
inode nothing reads and the log appears to freeze. `os.truncate(path, 0)` keeps
the inode valid and PM2, which opens logs in append mode, continues at the new
end. Verified live: rotation at 22:12:27, and the collector wrote into the same
file at 22:12:27. The archive gunzips clean with a last line from 22:10:02.

The cost is a race — anything written between the copy completing and the
truncate landing is lost. Bounded by copy duration, and it only affects
diagnostic output; this would not be acceptable for anything the product reads.

**Growth rate is monitored, not just size.** The failure being prevented was
never a full disk: it was 683 MB accumulating unnoticed for ten days inside a
file whose name implied it held only errors. A size cap alone would have
truncated it quietly and left the silence intact. `rotate_logs.py` records each
file's size per run and raises an operator alert when the rate exceeds
`LOG_ROTATE_ALERT_BYTES_PER_HOUR` (20 MB/h default, against a ~8 MB/day normal
and the ~68 MB/day runaway). Hourly rather than daily because a daily sample is
too coarse to catch a rate change early.

**A missing `LOG_DIR` is reported, never created.** If X9_Pro is unmounted, macOS
will make `/Volumes/X9_Pro` an ordinary boot-disk directory for anything that
writes there, and shadow it when the volume returns. Rotation declines instead,
and a test asserts the path is not created.

## Result

```
~/quantrift-backups        132 MB  deleted after 117/117 files verified by MD5
~/.pm2/logs/quantrift-*    785 MB  deleted after 22/22 files verified by MD5
                           ------
                           917 MB  reclaimed; ~/.pm2/logs 887 MB -> 102 MB
```

The remaining 102 MB belongs to other repositories and is out of scope for this
rotation; those apps would need the same treatment in their own configs.

## Tests

`collector/tests/test_rotate_logs.py` — 10 cases: inode preserved across
rotation, archive holds pre-truncate content, prune keeps newest N and does not
touch another log's archives, absent log dir is neither created nor fatal, growth
alerting fires above threshold and stays silent for ordinary growth, for a file
rotated since the last run, for a first run with no baseline, and for corrupt
state.

collector 372 pass, server 293 pass, `scripts/scan-secrets.sh` clean.
