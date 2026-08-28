"""Family sweep: is ANY level-break + RSI variant distinguishable from noise?

The post names its levels only as "key levels", so testing one interpretation
would leave the result arguable. This sweeps the four level sets an intraday
trader actually marks, both directions (continuation and fade), with and without
the RSI gate. Same fixed entry rule as prerun2 (next bar's open) and the same
lagged RSI, so every cell is measured the same way.

Reporting the whole grid is the point. Picking the best cell out of 48 and
calling it an edge is what the multiple-comparisons trap looks like; with 48
cells you expect roughly two at |t|>2 from pure noise.
"""
import gzip
import numpy as np
import pandas as pd

SRC = ('/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/research/'
       'minute-bars/SPY_1m_2024-09-01_2026-08-26.csv.gz')
OOS = pd.Timestamp('2026-01-01', tz='America/New_York')

with gzip.open(SRC, 'rt') as fh:
    df = pd.read_csv(fh, parse_dates=['ts_utc'])
df['ts'] = df['ts_utc'].dt.tz_convert('America/New_York')
df = df.set_index('ts').sort_index()
df['date'] = df.index.date

rth = df.between_time('09:30', '15:59').copy()
overnight = df.between_time('18:00', '09:29')


def wilder_rsi(c, p=14):
    d = c.diff()
    ag = d.clip(lower=0).ewm(alpha=1/p, adjust=False, min_periods=p).mean()
    al = (-d).clip(lower=0).ewm(alpha=1/p, adjust=False, min_periods=p).mean()
    return 100 - 100 / (1 + ag / al.replace(0, np.nan))


parts = []
for _, day in rth.groupby('date'):
    r = wilder_rsi(day['close'].resample('5min').last().dropna())
    r.index = r.index + pd.Timedelta(minutes=5)   # stamp at bar close, not open
    parts.append(r)
rth['rsi5'] = pd.concat(parts).sort_index().reindex(rth.index, method='ffill')

days = sorted({d for d, g in rth.groupby('date') if len(g) >= 300})
by_day = {d: g for d, g in rth.groupby('date')}

prior = {}
for i in range(1, len(days)):
    p = by_day[days[i - 1]]
    prior[days[i]] = (p['high'].max(), p['low'].min())

on_lv = {}
for d in days:
    w = overnight[overnight.index.date == d]
    w = w[w.index.time < pd.Timestamp('09:30').time()]
    if len(w):
        on_lv[d] = (w['high'].max(), w['low'].min())


def levels(kind, day, g):
    if kind == 'OR15':
        o = g[g.index < g.index[0] + pd.Timedelta(minutes=15)]
        return (o['high'].max(), o['low'].min(), g.index[0] + pd.Timedelta(minutes=15))
    if kind == 'OR30':
        o = g[g.index < g.index[0] + pd.Timedelta(minutes=30)]
        return (o['high'].max(), o['low'].min(), g.index[0] + pd.Timedelta(minutes=30))
    if kind == 'PDHL' and day in prior:
        return (*prior[day], g.index[0] + pd.Timedelta(minutes=5))
    if kind == 'ONHL' and day in on_lv:
        return (*on_lv[day], g.index[0] + pd.Timedelta(minutes=5))
    return None


def build(kind, gate, fade):
    out = []
    for day in days:
        g = by_day[day]
        lv = levels(kind, day, g)
        if lv is None:
            continue
        hi, lo, start = lv
        rest = g[g.index >= start]
        if len(rest) < 70 or not np.isfinite(hi) or not np.isfinite(lo):
            continue
        for i in range(len(rest) - 1):
            b = rest.iloc[i]
            rsi = b['rsi5']
            if gate is not None and pd.isna(rsi):
                continue
            up = b['high'] > hi and (gate is None or rsi >= gate)
            dn = b['low'] < lo and (gate is None or rsi <= 100 - gate)
            if not (up or dn):
                continue
            side = (1 if up else -1) * (-1 if fade else 1)
            entry = rest.iloc[i + 1]['open']
            t = rest.index[i + 1]
            fwd = rest[rest.index > t]
            if fwd.empty:
                break
            w30 = fwd[fwd.index <= t + pd.Timedelta(minutes=30)]
            out.append({'ts': t,
                        'r30': side * (w30['close'].iloc[-1] / entry - 1),
                        'rclose': side * (fwd['close'].iloc[-1] / entry - 1)})
            break
    return pd.DataFrame(out)


def stat(x):
    x = x.dropna()
    if len(x) < 25:
        return None
    m, sd = x.mean(), x.std(ddof=1)
    return m * 1e4, (x > 0).mean() * 100, m / (sd / np.sqrt(len(x))), len(x)


print(f'{"level":<7}{"dir":<6}{"RSI":<6}{"n":>5} | '
      f'{"IS r30":>21}{"OOS r30":>21}{"OOS to-close":>21}')
print('-' * 92)
best = []
for kind in ('OR15', 'OR30', 'PDHL', 'ONHL'):
    for fade in (False, True):
        for gate in (None, 55, 60):
            s = build(kind, gate, fade)
            if s.empty:
                continue
            s['ts'] = pd.to_datetime(s['ts'])
            i_, o_ = s[s['ts'] < OOS], s[s['ts'] >= OOS]
            cells = []
            for part, col in ((i_, 'r30'), (o_, 'r30'), (o_, 'rclose')):
                st = stat(part[col])
                cells.append('          --         ' if st is None else
                             f'{st[0]:>7.2f}bp {st[1]:>4.1f}% t={st[2]:>5.2f}')
                if st and col == 'r30' and part is o_:
                    best.append((abs(st[2]), kind, 'fade' if fade else 'cont', gate, st))
            print(f'{kind:<7}{"fade" if fade else "cont":<6}{str(gate):<6}{len(s):>5} | '
                  + ''.join(cells))
print('-' * 92)
best.sort(reverse=True)
print(f'largest |t| among {len(best)} out-of-sample cells: '
      f'{best[0][1]}/{best[0][2]}/RSI{best[0][3]} t={best[0][4][2]:.2f}')
print('With this many cells, |t| ~ 2 is the noise floor, not a finding.')
