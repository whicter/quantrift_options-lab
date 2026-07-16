# Data Collectors

Daily data collection into Railway PostgreSQL.

- `collect.py`: IV / HV / earnings metrics from Tastytrade → `iv_history`
- `collect_prices.py`: daily OHLCV from a provider adapter → `price_history`
- `collect_options.py`: bounded option-chain snapshots from provider adapter → `option_chain_snapshots` / `option_contract_snapshots`
- `materialize_oi_delta.py`: contract-level OI delta from consecutive option snapshots → `option_oi_delta_snapshots`
- `materialize_scan.py`: latest IV/price/GEX snapshots → `scanner_results_snapshots`
- `run_refresh_worker.py`: consumes queued `provider_fetch_jobs` with budget checks

## Setup (Mac Studio)

```bash
cd /path/to/quantrift_options-lab/collector

# Create virtualenv
/opt/homebrew/bin/python3.11 -m venv venv311
source venv311/bin/activate
pip install -r requirements.txt

# Configure env
cp .env.example .env
# Edit .env with your credentials
```

## First Login (get remember-token)

```bash
python auth.py --login
# Follow prompts: email, password, security question, OTP
# remember-token is saved to .env automatically
```

## Test Collection

```bash
venv311/bin/python collect.py
```

Scheduled price history uses `PRICE_PROVIDER=polygon`. Each run upserts up to 400 adjusted daily bars into `price_history` and 35 calendar days of 30-minute bars into `price_history_30m`. Stocks REST requests from both price and option collectors share the cross-process `POLYGON_STOCK_REQUEST_DELAY=16` pacer so the watchlist stays below the observed four-request-per-minute ceiling. `ib_internal` and Stooq remain explicit daily-only fallbacks and are not scheduled.

Collector health checks run inside `run_collector_daemon.py` every 300 seconds by default. They evaluate option coverage, 24h failed jobs, snapshot age and completeness, then persist deduplicated events in `collector_health_alerts`. Configure `ALERT_WEBHOOK_URL` or SMTP variables for external delivery; without them alerts remain visible in PM2 logs. Set `COLLECTOR_HEALTH_CHECK_ENABLED=false` to disable the check without changing collection.

Scanner user alerts run immediately after scanner materialization. `evaluate_scanner_alerts.py` reads active rules and the latest materialized batch, inserts a unique delivery outbox row, then uses generic SMTP or VAPID Web Push. Without channel secrets deliveries are `blocked`. It never calls a market-data provider.

```bash
venv311/bin/python collect_prices.py
```

Option-chain snapshots use `OPTION_PROVIDER=ib_internal` for Phase 3D internal validation. Keep collection bounded while using IB Gateway:

```bash
OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=240 OPTION_MAX_CONTRACTS_PER_EXPIRATION=80 venv311/bin/python collect_options.py
```

For the tastytrade transitional path, use `tt_internal`. It collects option-chain metadata from REST and merges delayed/live DXLink events when available:

- underlying `Quote` / `Trade`
- option `Quote`
- option `Trade`
- option `Summary` / open interest
- option `Greeks`
- option `TheoPrice`
- option `Profile` in raw contract metadata

```bash
OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=240 OPTION_MAX_CONTRACTS_PER_EXPIRATION=80 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py
```

Probe tastytrade chain metadata without writing to PostgreSQL:

```bash
OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py
```

Probe tastytrade DXLink fields without writing to PostgreSQL:

```bash
OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 TT_DXLINK_TIMEOUT=12 venv311/bin/python debug_tastytrade_dxlink.py
```

Compute GEX / Wall / Gamma Flip from the latest persisted option-chain snapshot:

```bash
GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py
```

The GEX job reads PostgreSQL only. It does not call IB, tastytrade, or any other provider. It writes:

- `gex_snapshots`
- `gex_by_strike_snapshots`

Materialize OI delta / unusual activity from consecutive persisted option snapshots:

```bash
venv311/bin/python materialize_oi_delta.py
```

The OI delta job reads PostgreSQL only. It writes `option_oi_delta_snapshots`. A contract's first observed snapshot is treated as `baseline`; it is not marked unusual until a previous snapshot exists for comparison.

Materialize scanner cache rows from existing snapshots:

```bash
venv311/bin/python materialize_scan.py
```

The scanner materializer reads PostgreSQL only. It does not call IB, tastytrade, or any external provider. It writes one row per watchlist symbol to `scanner_results_snapshots`, which is what `/api/scan` reads in Phase 3C.

Process queued refresh jobs:

```bash
venv311/bin/python run_refresh_worker.py
```

The worker supports:

- `symbol_metrics_snapshot`: refreshes one symbol's IV/HV/earnings metrics.
- `option_chain_snapshot`: refreshes one option-chain snapshot with the configured supported internal provider, then attempts GEX, OI delta and scanner materialization.
- `scanner_materialize`: refreshes `scanner_results_snapshots` only.

The worker records provider budget usage in `provider_request_usage`. If a licensed provider adapter is not configured, `licensed_options_provider` jobs fail closed and keep the error in `provider_fetch_jobs.last_error`.

Safety defaults:

- `GEX_MAX_MISSING_RATIO=0.25`
- `GEX_LOCAL_GAMMA_WINDOW_PCT=1`
- `GEX_GAMMA_FLIP_GRID_PCT=10`
- `GEX_GAMMA_FLIP_GRID_STEPS=81`

If option quotes, Greeks, or OI are empty, inspect the raw IB tick payload before changing the schema or API:

```bash
OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 IB_OPTION_CLIENT_ID=44 venv311/bin/python debug_ib_option_ticks.py
```

The diagnostic output prints raw `tickPrice`, `tickSize`, `tickOptionComputation`, and IB error codes per contract. Use it to distinguish parser issues from IB Gateway connection, market-data subscription, or delayed-data issues.

Default option-chain scope:

- Symbols: `watchlist.txt` by default; `OPTION_SYMBOLS=NBIS,PLTR` narrows a targeted run.
- DTE buckets: `OPTION_DTE_BUCKETS=0-14,15-29,30-45,46-60,61-90`
- Expirations: `OPTION_MAX_EXPIRATIONS_PER_BUCKET=2`; Polygon performs one bounded 30–45 DTE supplement when initial pagination lacks that bucket, so near-term contracts cannot consume the ATM-IV history window.
- Contracts: IB `reqContractDetails` returns the actual contracts for each selected expiry/right. The collector filters those returned contracts around spot and never creates expiry x strike x right combinations locally.
- Contract caps: `OPTION_MAX_CONTRACTS=240` global safety cap and `OPTION_MAX_CONTRACTS_PER_EXPIRATION=80` per-expiration cap.
- Source label: `ib_internal`
- Delayed snapshot grace: `IB_OPTION_SNAPSHOT_GRACE_SECONDS=2`
- API behavior: server reads PostgreSQL snapshots only; user requests never call IB Gateway synchronously.
- tastytrade source label: `tt_internal`
- tastytrade current status: chain metadata + DXLink quote/trade/OI/Greeks/TheoPrice when `TT_COLLECT_DXLINK=true`.

For explicit development/backfill only, Stooq can be selected without changing the scheduled default:

```bash
PRICE_PROVIDER=stooq SYMBOLS=AAPL venv311/bin/python collect_prices.py
```

## Watchlist

The watchlist is an ingestion seed, not the scanner product boundary. `sync_universe.py` persists it together with every known database symbol in `symbol_universe`; `materialize_scan.py` reads that registry. `collect_prices.py` also supports `SYMBOLS=AAPL,SPY` for targeted tests/backfills and `SYMBOLS=watchlist` for an explicit full run.

`collect_options.py` defaults to the full watchlist. Use `OPTION_SYMBOLS` for a bounded backfill or diagnostic run.

Format:

```text
# One symbol per line
AAPL
SPY
QQQ
PLTR
```

Blank lines and `#` comments are ignored. Symbols are uppercased and duplicates are skipped.

## Mac Studio Runtime

PM2 executes the current repository directly. There is no copied runtime directory, wrapper sync, cron entry, or LaunchAgent.

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab
pm2 start collector/ecosystem.config.cjs
pm2 save
pm2 status quantrift-options-collector quantrift-options-prices
pm2 logs quantrift-options-collector --lines 50 --nostream
```

- `quantrift-options-collector`: long-running `run_collector_daemon.py`; every 300 seconds it selects at most two missing/old watchlist symbols, enqueues option refreshes, processes jobs every 60 seconds, and materializes scanner rows every 300 seconds.
- Auto-refresh uses `polygon_licensed`. A recent failed attempt gets a 30-minute cooldown, so provider failures do not create a request storm.
- `quantrift-options-prices`: runs `collect_prices.py` at `13:35 America/Los_Angeles` Monday-Friday.
- Both processes use this repository's `collector/venv311` and `collector/.env`.
- `IB_MARKET_DATA_TYPE=3` accepts delayed market data for the current pipeline.

## Files

- `auth.py` — Tastytrade auth + remember-token auto-renewal
- `collect.py` — IV collector (Tastytrade → PostgreSQL)
- `collect_prices.py` — OHLCV collector (provider adapter → PostgreSQL)
- `collect_options.py` — bounded option-chain snapshot collector
- `derive_volatility.py` — Polygon-only HV30/60/90 and 30–45 DTE ATM IV history; IV Rank remains not-ready before 252 market-day observations
- `materialize_oi_delta.py` — contract-level OI delta materializer
- `materialize_scan.py` — scanner cache materializer, PostgreSQL snapshot input only
- `run_refresh_worker.py` — queued refresh worker and provider budget gate
- `evaluate_scanner_alerts.py` — idempotent materialized-scanner email/web-push evaluator
- `sync_universe.py` — seed/upsert persistent scanner universe from watchlist and existing data tables
- `run_collector_daemon.py` — persistent worker/materializer loop used by PM2
- `schedule_option_refresh.py` — bounded watchlist coverage scheduler with stale selection and retry cooldown
- `ecosystem.config.cjs` — direct-repository PM2 process definitions
- `providers/` — provider adapters; scheduled prices use `polygon`, while `ib_internal` and `stooq` remain explicit fallbacks
- `common.py` — shared watchlist loader
- `watchlist.txt` — Collector symbol list
- `requirements.txt` — Python dependencies
- `.env.example` — Environment variable template

## Current Status

- First successful Railway write: 2026-07-14
- Rows written: 21
- Source: `tastytrade`
- Cron installed on Mac Studio: `30 13 * * 1-5`
- Price history pipeline implemented: provider adapter → `price_history` → `/api/prices/:symbol`
- Option positioning schema/API implemented: Polygon provider adapter → `option_chain_snapshots` → `/api/options/:symbol/snapshot`
- Derived volatility runtime verified at 67/67 HV and 67/67 ATM coverage. DTE/observation dates use `America/New_York`, not UTC date truncation.
- Analyze downstream derivatives are live: `/api/sr/:symbol` consumes persisted daily OHLCV for S/R and Focus Score; `/api/chain/stats/:symbol` consumes only actual persisted contracts with IV for skew and term structure. The collector does not write synthetic levels or option legs.
- On-demand refresh is live: `/api/analyze/:symbol` can enqueue a targeted Polygon price job and option snapshot job; the worker persists both timeframes, derives volatility, and reuses the normal GEX path. Recent non-retryable metrics failures are reported as blockers rather than repeatedly queued.
- Market/Weekly consumers are live: `/api/market/regime` reads regular-session 30M bars plus daily SPY/QQQ data; `/api/weekly/:symbol` reads persisted price/GEX/by-strike/OI-delta history. Collector gaps remain explicit and are never expanded into mock weekdays or money flow.
- Heartbeat support is live in the daemon: every `HEARTBEAT_SECONDS` it calls `send_heartbeat.py`. Configure `HEARTBEAT_URL`, `HEARTBEAT_TOKEN`, and `HEARTBEAT_NODE_ID=mac-studio`; absent URL/token returns `disabled` without interrupting collection. Railway owns timeout detection and incident resolution.
- Tastytrade metrics cutover is automatic per symbol: `collect.py` filters `iv_rank_ready=true` symbols before authentication, and queued metrics jobs return `already_ready`. Current runtime is 0/67 ready; do not force the 252-market-day threshold.
- Cloud metrics cron artifacts are `Dockerfile.metrics` and `railway.metrics.json`. Configure Railway to use `/collector/railway.metrics.json`; inject DB/TT variables in the service and never copy `.env`. The weekday 22:30 UTC job runs `collect.py` once and exits.
- IB Gateway cloud evaluation artifacts live in `ops/ib-gateway/`. The candidate is fixed-egress VPS only, with paper/read-only defaults, secret-file password and loopback API ports; a 72-hour soak and manual 2FA precede any collector move.
- Product identity is separate from collectors: Clerk sessions map to PostgreSQL `users`/`subscriptions`; collectors never receive Clerk or Stripe credentials.
- Portfolio valuation reads collector-persisted option snapshots through the API. Collectors do not own positions and must not fabricate missing marks for portfolio consumers.
- Billing and entitlements stay in the API database boundary. Collectors never receive Clerk/Stripe credentials and continue materializing data independently of subscriber count.
- The P3 account/portfolio/billing schema is applied in shared Railway PostgreSQL; this does not change collector scheduling or grant collectors access to product identities.
- Frontend lint cleanup has no collector runtime impact; collector verification remains the Python test suite plus PM2/runtime evidence.
- Analyze OI density consumes persisted `open_interest` across nonexpired expiries. Collectors must preserve null OI as missing and must not derive it from GEX or quote volume.
