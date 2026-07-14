# IV Collector

Daily IV data collection from Tastytrade API → Railway PostgreSQL.

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

## Watchlist

`collect.py` reads symbols from `watchlist.txt`.

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

Create logs directory:
```bash
mkdir -p /Users/congrenhan/Documents/quantrift_options-lab/collector/logs
```

## Files

- `auth.py` — Tastytrade auth + remember-token auto-renewal
- `collect.py` — Main collector (Tastytrade → PostgreSQL)
- `watchlist.txt` — Collector symbol list
- `requirements.txt` — Python dependencies
- `.env.example` — Environment variable template

## Current Status

- First successful Railway write: 2026-07-14
- Rows written: 21
- Source: `tastytrade`
- Cron installed on Mac Studio: `30 13 * * 1-5`
