"""Pull SPY 1-minute bars for the 0DTE pre-run and park them on X9_Pro.

Pacing is declared here on purpose. This is a bypass script: it does not go
through PolygonHttpClient and therefore shares neither the PM2 env nor the
global `provider_rate_limits` budget the collectors coordinate on. The breadth
backfill (2026-08-15) was the last script to learn that the hard way. Two pages
per second would be enough to penalise the production collector's stocks scope,
so this sleeps 2s between pages -- roughly 20 pages for two years, 40s total.
"""
import gzip
import os
import sys
import time
from datetime import datetime, timezone

import requests

sys.path.insert(0, '/Users/congrenhan/Documents/quantrift_options-lab/collector')
from collector_runtime import load_collector_env  # noqa: E402

load_collector_env('collect.py')

KEY = os.environ['POLYGON_API_KEY']
OUT_DIR = '/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/research/minute-bars'
SYMBOL = sys.argv[1] if len(sys.argv) > 1 else 'SPY'
START = sys.argv[2] if len(sys.argv) > 2 else '2024-09-01'
END = sys.argv[3] if len(sys.argv) > 3 else '2026-08-26'
PAGE_SLEEP = 2.0

# X9_Pro is exFAT and unmounted writes land silently on the boot disk (see the
# volume README). Refuse rather than write into a shadowed directory.
if not os.path.ismount('/Volumes/X9_Pro'):
    raise SystemExit('X9_Pro is not mounted; refusing to write to a shadowed path')

os.makedirs(OUT_DIR, exist_ok=True)
url = (f'https://api.polygon.io/v2/aggs/ticker/{SYMBOL}/range/1/minute/{START}/{END}')
params = {'apiKey': KEY, 'limit': 50000, 'adjusted': 'true', 'sort': 'asc'}

rows = []
page = 0
while url:
    for attempt in range(6):
        resp = requests.get(url, params=params, timeout=90)
        if resp.status_code == 429:
            wait = 20 * (attempt + 1)
            print(f'  429, backing off {wait}s', flush=True)
            time.sleep(wait)
            continue
        break
    resp.raise_for_status()
    body = resp.json()
    batch = body.get('results') or []
    rows.extend(batch)
    page += 1
    first = datetime.fromtimestamp(batch[0]['t'] / 1000, timezone.utc) if batch else None
    last = datetime.fromtimestamp(batch[-1]['t'] / 1000, timezone.utc) if batch else None
    print(f'page {page}: {len(batch):>6} bars  {first} -> {last}', flush=True)
    url = body.get('next_url')
    params = {'apiKey': KEY} if url else params
    if url:
        time.sleep(PAGE_SLEEP)

out = os.path.join(OUT_DIR, f'{SYMBOL}_1m_{START}_{END}.csv.gz')
with gzip.open(out, 'wt', encoding='utf-8') as fh:
    fh.write('ts_utc,open,high,low,close,volume,vwap,trades\n')
    for r in rows:
        ts = datetime.fromtimestamp(r['t'] / 1000, timezone.utc).isoformat()
        fh.write(f"{ts},{r['o']},{r['h']},{r['l']},{r['c']},{r.get('v','')},"
                 f"{r.get('vw','')},{r.get('n','')}\n")

print(f'\nwrote {len(rows):,} bars -> {out}')
print(f'size: {os.path.getsize(out)/1e6:.1f} MB')
