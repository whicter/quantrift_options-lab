"""Pre-run for the SPY 0DTE opening-range + RSI method.

WHAT THIS TESTS, AND WHAT IT CANNOT
-----------------------------------
It tests the only claim the method makes that is cheap to falsify: that after
an opening-range break with RSI agreeing, SPY continues in that direction more
than it otherwise would, at the same time of day.

It cannot validate the strategy. A 0DTE option position's P&L is dominated by
theta, IV, and a bid/ask spread that is 1-3% of premium -- none of which the
underlying's path captures. So this screen can only REJECT: no directional edge
in the underlying means the option overlay cannot rescue it, because the overlay
only subtracts. Surviving it earns the right to pay for option data, nothing
more.

The baseline is time-of-day matched. Intraday returns have strong time-of-day
structure, so comparing a 10:05 signal against an all-hours mean would
manufacture an edge out of the shape of the trading day.
"""
import gzip
import sys
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
df['tod'] = df.index.time

rth = df.between_time('09:30', '15:59')
print(f'bars={len(df):,}  RTH bars={len(rth):,}  sessions={rth["date"].nunique()}')


def wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return 100 - 100 / (1 + rs)


# RSI(14) on 5-minute bars, computed per session so the overnight gap never
# enters a delta. Carrying it across the close would inject a jump into the
# smoothing that no intraday trader sees.
rsi_parts = []
for _, day in rth.groupby('date'):
    five = day['close'].resample('5min').last().dropna()
    rsi_parts.append(wilder_rsi(five))
rsi5 = pd.concat(rsi_parts).sort_index()
rth = rth.copy()
rth['rsi5'] = rsi5.reindex(rth.index, method='ffill')

sessions = []
for day, g in rth.groupby('date'):
    if len(g) < 300:              # half-days have a different opening range
        continue
    sessions.append((day, g))
print(f'full sessions kept: {len(sessions)}')


def build(or_minutes: int, rsi_gate: float) -> pd.DataFrame:
    """One signal row per session: the first OR break after the OR closes."""
    out = []
    for day, g in sessions:
        or_end = g.index[0] + pd.Timedelta(minutes=or_minutes)
        opening = g[g.index < or_end]
        rest = g[g.index >= or_end]
        if opening.empty or len(rest) < 60:
            continue
        orh, orl = opening['high'].max(), opening['low'].min()

        for ts, bar in rest.iterrows():
            rsi = bar['rsi5']
            if pd.isna(rsi):
                continue
            side = None
            if bar['high'] > orh and rsi >= rsi_gate:
                side = 1
            elif bar['low'] < orl and rsi <= 100 - rsi_gate:
                side = -1
            if side is None:
                continue
            entry = orh if side == 1 else orl      # fill at the level, not the extreme
            fwd = rest[rest.index > ts]
            if fwd.empty:
                break
            def ret_at(minutes):
                w = fwd[fwd.index <= ts + pd.Timedelta(minutes=minutes)]
                return np.nan if w.empty else side * (w['close'].iloc[-1] / entry - 1)
            out.append({
                'date': day, 'ts': ts, 'side': side, 'entry': entry,
                'or_minutes': or_minutes, 'rsi_gate': rsi_gate, 'rsi': rsi,
                'r15': ret_at(15), 'r30': ret_at(30), 'r60': ret_at(60),
                'rclose': side * (fwd['close'].iloc[-1] / entry - 1),
                'mfe': side * ((fwd['high'].max() if side == 1 else -fwd['low'].min()) / entry
                               - (1 if side == 1 else -1)),
                'mae': side * ((fwd['low'].min() if side == 1 else -fwd['high'].max()) / entry
                               - (1 if side == 1 else -1)),
            })
            break                                   # one signal per session
    return pd.DataFrame(out)


def baseline(signals: pd.DataFrame, horizon: int) -> tuple[float, float]:
    """Time-of-day matched unconditional |return| mean and sd, direction-free.

    For each signal's clock time, take every session's move over the same window
    and the same sign convention drawn at random-but-fixed 50/50, which is just
    the absolute move scaled -- so instead we report the mean SIGNED move for a
    coin-flip entry, which is 0 by construction, and the sd, which is the honest
    yardstick for whether the conditional mean is large.
    """
    sds = []
    for _, row in signals.iterrows():
        moves = []
        for day, g in sessions:
            w = g[(g.index.time >= row['ts'].time())]
            if w.empty:
                continue
            start = w['close'].iloc[0]
            wend = w[w.index <= w.index[0] + pd.Timedelta(minutes=horizon)]
            moves.append(wend['close'].iloc[-1] / start - 1)
        if moves:
            sds.append(np.std(moves))
    return 0.0, float(np.mean(sds)) if sds else np.nan


def summarize(sig: pd.DataFrame, label: str) -> dict:
    row = {'label': label, 'n': len(sig)}
    for col in ('r15', 'r30', 'r60', 'rclose'):
        x = sig[col].dropna()
        if len(x) < 20:
            row[col] = None
            continue
        mean, sd = x.mean(), x.std(ddof=1)
        t = mean / (sd / np.sqrt(len(x))) if sd > 0 else np.nan
        row[col] = {'mean_bps': mean * 1e4, 'hit': (x > 0).mean(), 't': t, 'n': len(x)}
    return row


GRID = [(15, 50), (15, 55), (15, 60), (30, 50), (30, 55), (30, 60)]
print('\n' + '=' * 104)
print(f'{"OR/RSI":<10}{"split":<6}{"n":>5}   ' + ''.join(f'{h:>22}' for h in ('r30', 'r60', 'rclose')))
print('=' * 104)
rows = []
for or_m, gate in GRID:
    sig = build(or_m, gate)
    if sig.empty:
        continue
    sig['ts'] = pd.to_datetime(sig['ts'])
    is_ = sig[sig['ts'] < OOS_START]
    oos = sig[sig['ts'] >= OOS_START]
    for label, part in (('IS', is_), ('OOS', oos)):
        s = summarize(part, label)
        cells = []
        for h in ('r30', 'r60', 'rclose'):
            c = s[h]
            cells.append('        --            ' if not c else
                         f"{c['mean_bps']:>8.2f}bp {c['hit']*100:>4.1f}% t={c['t']:>5.2f}")
        print(f'{or_m}m/RSI{gate:<3.0f} {label:<6}{s["n"]:>5}   ' + ''.join(cells))
        rows.append((or_m, gate, label, s))
    sig.to_csv(f'/tmp/zdte_sig_{or_m}_{int(gate)}.csv', index=False)

print('=' * 104)
_, sd30 = baseline(build(30, 55).head(40), 30)
print(f'\ntime-of-day matched sd of a 30-minute SPY move: {sd30*1e4:.1f} bp')
print('A conditional mean must be large relative to THIS, not to zero.')
