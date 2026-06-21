# IV Collector

Daily IV data collection from Tastytrade API → Railway PostgreSQL.

## Setup (Mac Studio)

```bash
cd /path/to/quantrift_options-lab/collector

# Create virtualenv
python3 -m venv venv
source venv/bin/activate
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
python collect.py
```

## Cron Setup (4:30pm ET = 8:30pm UTC, adjust for DST)

```cron
30 20 * * 1-5 cd /Users/congrenhan/Documents/quantrift_options-lab/collector && /Users/congrenhan/Documents/quantrift_options-lab/collector/venv/bin/python collect.py >> /Users/congrenhan/Documents/quantrift_options-lab/collector/logs/collect.log 2>&1
```

Create logs directory:
```bash
mkdir -p /Users/congrenhan/Documents/quantrift_options-lab/collector/logs
```

## Files

- `auth.py` — Tastytrade auth + remember-token auto-renewal
- `collect.py` — Main collector (Tastytrade → PostgreSQL)
- `requirements.txt` — Python dependencies
- `.env.example` — Environment variable template
