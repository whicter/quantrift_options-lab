"""Pre-run v2. v1 had two look-ahead bugs; both are fixed and named here.

BUG 1 -- fill price. v1 detected the break with `bar.high > ORH` and then filled
at ORH. ORH sits BELOW that bar's high, so every fill was at or under the price
that triggered it. Worse, a resting buy limit at ORH does not fill on an upward
break through ORH -- price is leaving that level, not returning to it. v2 fills
at the OPEN OF THE NEXT BAR, which is the first price actually obtainable after
a signal you could only have seen once the bar closed.

BUG 2 -- RSI timestamp. `resample('5min').last()` labels each bin by its LEFT
edge, so the bar stamped 10:00 holds the close of 10:04. Forward-filling that
onto 1-minute bars handed 10:00-10:03 an RSI built from data up to 10:04. v2
shifts the 5-minute series by one bar before reindexing, so a decision at time t
sees only 5-minute bars that had already closed.

Together these produced 78% hit rates and t-statistics near 9.
"""
import gzip
import numpy as np
import pandas as pd

SRC = ('/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/research/'
       'minute-bars/SPY_1m_2024-09-01_2026-08-26.csv.gz')
OOS_START = pd.Timestamp('2026-01-01', tz='America/New_York')

with gzip.open(SRC, 'rt') as fh:
    df = pd.read_csv(fh, parse_dates=['ts_utc'])
df['ts'] = df['ts_utc'].dt.tz_convert('America/New_York')
df = df.set_index('ts').sort_index()
df['date'] = df.index.date
rth = df.between_time('09:30', '15:59').copy()


def wilder_rsi(close, period=14):
    d = close.diff()
    ag = d.clip(lower=0).ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    al = (-d).clip(lower=0).ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    return 100 - 100 / (1 + ag / al.replace(0, np.nan))


parts = []
for _, day in rth.groupby('date'):
    five = day['close'].resample('5min').last().dropna()
    r = wilder_rsi(five)
    # Stamp each RSI value at the moment the bar it summarises has CLOSED.
    r.index = r.index + pd.Timedelta(minutes=5)
    parts.append(r)
rsi5 = pd.concat(parts).sort_index()
rth['rsi5'] = rsi5.reindex(rth.index, method='ffill')

sessions = [(d, g) for d, g in rth.groupby('date') if len(g) >= 300]
print(f'RTH bars={len(rth):,}  full sessions={len(sessions)}')


def build(or_minutes, rsi_gate):
    out = []
    for day, g in sessions:
        or_end = g.index[0] + pd.Timedelta(minutes=or_minutes)
        opening, rest = g[g.index < or_end], g[g.index >= or_end]
        if opening.empty or len(rest) < 70:
            continue
        orh, orl = opening['high'].max(), opening['low'].min()
        idx = rest.index
        for i in range(len(rest) - 1):
            bar = rest.iloc[i]
            rsi = bar['rsi5']
            if pd.isna(rsi):
                continue
            side = 1 if (bar['high'] > orh and rsi >= rsi_gate) else (
                   -1 if (bar['low'] < orl and rsi <= 100 - rsi_gate) else 0)
            if side == 0:
                continue
            entry = rest.iloc[i + 1]['open']          # first obtainable price
            t_entry = idx[i + 1]
            fwd = rest[rest.index > t_entry]
            if fwd.empty:
                break
            def r(m):
                w = fwd[fwd.index <= t_entry + pd.Timedelta(minutes=m)]
                return np.nan if w.empty else side * (w['close'].iloc[-1] / entry - 1)
            out.append({'date': day, 'ts': t_entry, 'side': side, 'entry': entry,
                        'r15': r(15), 'r30': r(30), 'r60': r(60),
                        'rclose': side * (fwd['close'].iloc[-1] / entry - 1)})
            break
    return pd.DataFrame(out)


def show(sig, label):
    cells = []
    for h in ('r30', 'r60', 'rclose'):
        x = sig[h].dropna()
        if len(x) < 20:
            cells.append('         --           ')
            continue
        m, sd = x.mean(), x.std(ddof=1)
        t = m / (sd / np.sqrt(len(x)))
        cells.append(f'{m*1e4:>8.2f}bp {(x>0).mean()*100:>4.1f}% t={t:>5.2f}')
    print(f'{label:<16}{len(sig):>5}   ' + ''.join(cells))


print('\n' + '=' * 100)
print(f'{"OR/RSI  split":<16}{"n":>5}   ' + ''.join(f'{h:>22}' for h in ('r30', 'r60', 'rclose')))
print('=' * 100)
for or_m, gate in [(15, 50), (15, 55), (15, 60), (30, 50), (30, 55), (30, 60)]:
    sig = build(or_m, gate)
    if sig.empty:
        continue
    sig['ts'] = pd.to_datetime(sig['ts'])
    show(sig[sig['ts'] < OOS_START], f'{or_m}m/RSI{gate:<3.0f} IS')
    show(sig[sig['ts'] >= OOS_START], f'{or_m}m/RSI{gate:<3.0f} OOS')
    sig.to_csv(f'/tmp/zdte2_{or_m}_{int(gate)}.csv', index=False)
print('=' * 100)

# Null model: same clock times, same session set, direction assigned by coin
# flip with a fixed seed. If the real signal cannot beat this, it is not a signal.
rng = np.random.default_rng(7)
ref = build(30, 55)
null = []
for _, row in ref.iterrows():
    g = dict(sessions)[row['date']]
    fwd = g[g.index > row['ts']]
    if fwd.empty:
        continue
    side = rng.choice([-1, 1])
    entry = fwd['open'].iloc[0]
    w = fwd[fwd.index <= row['ts'] + pd.Timedelta(minutes=30)]
    null.append(side * (w['close'].iloc[-1] / entry - 1))
null = pd.Series(null).dropna()
print(f'\ncoin-flip null at the same times: n={len(null)} mean={null.mean()*1e4:>6.2f}bp '
      f'hit={(null>0).mean()*100:.1f}% sd={null.std()*1e4:.1f}bp')
