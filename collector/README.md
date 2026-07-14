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

Default option-chain scope:

- Symbols: `AAPL,SPY,QQQ,PLTR`
- DTE: 7-60 days
- Strikes: spot +/- 15%, capped by `OPTION_MAX_STRIKES_PER_SIDE`
- Source label: `ib_internal`
- API behavior: server reads PostgreSQL snapshots only; user requests never call IB Gateway synchronously.

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
