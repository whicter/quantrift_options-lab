# Data Collectors

Daily data collection into Railway PostgreSQL.

- `collect.py`: IV / HV / earnings metrics from Tastytrade → `iv_history`
- `collect_prices.py`: daily OHLCV from a provider adapter → `price_history`
- `collect_options.py`: bounded option-chain snapshots from provider adapter → `option_chain_snapshots` / `option_contract_snapshots`

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

Price history uses `PRICE_PROVIDER=ib_internal` by default. This requires local IB Gateway and `ibapi`.

```bash
venv311/bin/python collect_prices.py
```

Option-chain snapshots use `OPTION_PROVIDER=ib_internal` for Phase 3D internal validation. This is not licensed product data and should stay bounded while using IB Gateway:

```bash
OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=40 venv311/bin/python collect_options.py
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
OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=40 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py
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

- Symbols: `AAPL,SPY,QQQ,PLTR`
- DTE: 7-60 days
- Strikes: spot +/- 15%, capped by `OPTION_MAX_STRIKES_PER_SIDE`
- Source label: `ib_internal`
- Delayed snapshot grace: `IB_OPTION_SNAPSHOT_GRACE_SECONDS=2`
- API behavior: server reads PostgreSQL snapshots only; user requests never call IB Gateway synchronously.
- tastytrade source label: `tt_internal`
- tastytrade current status: chain metadata + DXLink quote/trade/OI/Greeks/TheoPrice when `TT_COLLECT_DXLINK=true`.

For explicit development/backfill only, Stooq can be selected without changing production defaults:

```bash
PRICE_PROVIDER=stooq SYMBOLS=AAPL venv311/bin/python collect_prices.py
```

## Watchlist

IV and price collectors read symbols from `watchlist.txt`. `collect_prices.py` also supports `SYMBOLS=AAPL,SPY` for targeted tests/backfills.

`collect_options.py` intentionally defaults to `OPTION_SYMBOLS=AAPL,SPY,QQQ,PLTR` instead of the full watchlist to avoid IB pacing and runaway chain requests during the internal transition.

Format:

```text
# One symbol per line
AAPL
SPY
QQQ
PLTR
```

Blank lines and `#` comments are ignored. Symbols are uppercased and duplicates are skipped.

## Cron Setup

Mac Studio crontab uses `TZ=America/Los_Angeles`. Run after US market close at 4:30pm ET / 1:30pm PT:

```cron
30 13 * * 1-5 cd /Users/congrenhan/Documents/quantrift_options-lab/collector && /Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python collect.py >> /Users/congrenhan/Documents/quantrift_options-lab/collector/logs/collect.log 2>&1
```

Add a separate cron entry for price history after confirming IB Gateway availability and clientId:

```cron
35 13 * * 1-5 cd /Users/congrenhan/Documents/quantrift_options-lab/collector && /Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python collect_prices.py >> /Users/congrenhan/Documents/quantrift_options-lab/collector/logs/collect_prices.log 2>&1
```

Create logs directory:
```bash
mkdir -p /Users/congrenhan/Documents/quantrift_options-lab/collector/logs
```

## Files

- `auth.py` — Tastytrade auth + remember-token auto-renewal
- `collect.py` — IV collector (Tastytrade → PostgreSQL)
- `collect_prices.py` — OHLCV collector (provider adapter → PostgreSQL)
- `collect_options.py` — bounded option-chain snapshot collector
- `providers/` — provider adapters; `ib_internal` is default for internal IB adapters, `stooq` is explicit price dev/backfill
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
- Option positioning schema/API implemented: provider adapter → `option_chain_snapshots` → `/api/options/:symbol/snapshot`
- IB option-chain adapter is internal only and must be replaced by a licensed provider before public product use.
