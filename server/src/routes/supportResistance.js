const express = require('express');
const pool = require('../db');

const router = express.Router();

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toDateString(value) {
  return value?.toISOString?.().slice(0, 10) || String(value).slice(0, 10);
}

function newYorkDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function movingAverage(values, period) {
  return values.length < period ? null : average(values.slice(-period));
}

function calculateRsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function boundedContribution(value, multiplier, limit) {
  return Math.max(-limit, Math.min(limit, value * multiplier));
}

function newYorkDateFor(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function weekKey(dateValue) {
  const date = new Date(`${toDateString(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function deriveCompositeMomentum(dailyRows, intradayRows) {
  const daily = dailyRows.map(row => ({
    date: toDateString(row.date), close: Number(row.close),
  })).filter(row => row.date && Number.isFinite(row.close));
  const intraday = intradayRows.map(row => ({
    barTs: row.bar_ts, close: Number(row.close),
  })).filter(row => row.barTs && Number.isFinite(row.close));
  const missing = reason => ({ status: 'missing', score: null, label: '数据不足', reason, weights: { '30m': 0.30, '1d': 0.40, '1w': 0.30 } });
  if (daily.length < 60) return missing('requires_60_daily_bars');
  if (intraday.length < 26) return missing('requires_26_regular_session_30m_bars');

  const dailyCloses = daily.map(row => row.close);
  const latestDaily = dailyCloses.at(-1);
  const dailyChange5 = ((latestDaily / dailyCloses.at(-6)) - 1) * 100;
  const dailyChange20 = ((latestDaily / dailyCloses.at(-21)) - 1) * 100;
  const dailyMa20 = movingAverage(dailyCloses, 20);
  const dailyMa50 = movingAverage(dailyCloses, 50);
  const dailyScore = clampScore(
    50 + (latestDaily >= dailyMa20 ? 15 : -15) + (latestDaily >= dailyMa50 ? 10 : -10)
    + boundedContribution(dailyChange5, 3, 15) + boundedContribution(dailyChange20, 1.5, 15)
  );

  const intradayCloses = intraday.map(row => row.close);
  const latestIntraday = intradayCloses.at(-1);
  const intradayChange5 = ((latestIntraday / intradayCloses.at(-6)) - 1) * 100;
  const intradayChange26 = ((latestIntraday / intradayCloses.at(-26)) - 1) * 100;
  const intradayMa13 = movingAverage(intradayCloses, 13);
  const intradayScore = clampScore(
    50 + (latestIntraday >= intradayMa13 ? 15 : -15)
    + boundedContribution(intradayChange5, 20, 20) + boundedContribution(intradayChange26, 10, 15)
  );

  const weekly = [];
  daily.forEach(row => {
    const key = weekKey(row.date);
    if (!key) return;
    if (weekly.at(-1)?.week === key) weekly[weekly.length - 1] = { week: key, close: row.close };
    else weekly.push({ week: key, close: row.close });
  });
  if (weekly.length < 12) return missing('requires_12_weekly_bars');
  const weeklyCloses = weekly.map(row => row.close);
  const latestWeekly = weeklyCloses.at(-1);
  const weeklyChange4 = ((latestWeekly / weeklyCloses.at(-5)) - 1) * 100;
  const weeklyMa4 = movingAverage(weeklyCloses, 4);
  const weeklyMa12 = movingAverage(weeklyCloses, 12);
  const weeklyScore = clampScore(
    50 + (latestWeekly >= weeklyMa4 ? 15 : -15) + (latestWeekly >= weeklyMa12 ? 10 : -10)
    + boundedContribution(weeklyChange4, 2, 20)
  );

  const dailyMarketDate = daily.at(-1).date;
  const intradayMarketDate = newYorkDateFor(intraday.at(-1).barTs);
  const stale = intradayMarketDate !== dailyMarketDate;
  const score = clampScore(intradayScore * 0.30 + dailyScore * 0.40 + weeklyScore * 0.30);
  return {
    status: stale ? 'stale' : 'ready',
    score,
    label: score >= 70 ? '多周期强势' : score >= 55 ? '多周期偏强' : score >= 45 ? '多周期中性' : score >= 30 ? '多周期偏弱' : '多周期弱势',
    reason: stale ? 'intraday_market_date_lags_daily' : null,
    weights: { '30m': 0.30, '1d': 0.40, '1w': 0.30 },
    latest_daily_date: dailyMarketDate,
    latest_intraday_market_date: intradayMarketDate,
    timeframes: {
      '30m': { score: intradayScore, change_5bar_pct: intradayChange5, change_26bar_pct: intradayChange26, ma13: intradayMa13 },
      '1d': { score: dailyScore, change_5d_pct: dailyChange5, change_20d_pct: dailyChange20, ma20: dailyMa20, ma50: dailyMa50 },
      '1w': { score: weeklyScore, change_4w_pct: weeklyChange4, ma4: weeklyMa4, ma12: weeklyMa12, observations: weekly.length },
    },
  };
}

function clusterLevels(levels, tolerancePct = 0.01) {
  const clusters = [];
  [...levels].sort((a, b) => a.price - b.price).forEach(level => {
    const cluster = clusters.find(item => Math.abs(level.price / item.price - 1) <= tolerancePct);
    if (!cluster) {
      clusters.push({ price: level.price, touches: 1, last_date: level.date });
      return;
    }
    cluster.price = ((cluster.price * cluster.touches) + level.price) / (cluster.touches + 1);
    cluster.touches += 1;
    if (String(level.date) > String(cluster.last_date)) cluster.last_date = level.date;
  });
  return clusters;
}

function deriveSupportResistance(rows, pivotWindow = 2) {
  const bars = rows.map(row => ({
    date: toDateString(row.date),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0),
  })).filter(bar => [bar.high, bar.low, bar.close].every(Number.isFinite));

  if (bars.length < pivotWindow * 2 + 1) return null;
  const highs = [];
  const lows = [];
  for (let i = pivotWindow; i < bars.length - pivotWindow; i += 1) {
    const neighborhood = bars.slice(i - pivotWindow, i + pivotWindow + 1);
    if (bars[i].high >= Math.max(...neighborhood.map(bar => bar.high))) {
      highs.push({ price: bars[i].high, date: bars[i].date });
    }
    if (bars[i].low <= Math.min(...neighborhood.map(bar => bar.low))) {
      lows.push({ price: bars[i].low, date: bars[i].date });
    }
  }

  const spot = bars[bars.length - 1].close;
  const supports = clusterLevels(lows)
    .filter(level => level.price < spot)
    .sort((a, b) => b.touches - a.touches || b.price - a.price)
    .slice(0, 3);
  const resistances = clusterLevels(highs)
    .filter(level => level.price > spot)
    .sort((a, b) => b.touches - a.touches || a.price - b.price)
    .slice(0, 3);

  return { spot, supports, resistances, bars };
}

function deriveFocusScore(bars) {
  if (!bars || bars.length < 20) {
    return { ready: false, score: null, reason: 'requires_20_daily_bars' };
  }
  const closes = bars.map(bar => bar.close);
  const volumes = bars.map(bar => bar.volume).filter(value => value > 0);
  const latest = closes[closes.length - 1];
  const ma20 = movingAverage(closes, 20);
  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const rsi14 = calculateRsi(closes);
  const change5d = closes.length >= 6 ? ((latest / closes[closes.length - 6]) - 1) * 100 : null;
  const latestVolume = bars[bars.length - 1].volume;
  const priorVolumes = bars.slice(-21, -1).map(bar => bar.volume).filter(value => value > 0);
  const latestIsIncomplete = bars[bars.length - 1].date === newYorkDate();
  const rvol = !latestIsIncomplete && latestVolume > 0 && priorVolumes.length
    ? latestVolume / average(priorVolumes)
    : null;

  let score = 50;
  score += latest >= ma20 ? 12 : -12;
  if (ma50 != null) score += latest >= ma50 ? 10 : -10;
  if (ma200 != null) score += latest >= ma200 ? 8 : -8;
  if (rsi14 != null) score += rsi14 >= 55 && rsi14 <= 70 ? 8 : rsi14 < 45 ? -8 : rsi14 > 75 ? -4 : 0;
  if (change5d != null) score += Math.max(-8, Math.min(8, change5d * 2));
  if (rvol != null) score += rvol >= 1.2 ? 4 : rvol < 0.7 ? -3 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ready: true,
    score,
    label: score >= 70 ? '强关注' : score >= 55 ? '偏强' : score >= 45 ? '中性' : score >= 30 ? '偏弱' : '弱势',
    components: { ma20, ma50, ma200, rsi14, change5d, rvol },
    volume_observations: volumes.length,
  };
}

async function sendSupportResistance(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const [dailyResult, intradayResult] = await Promise.all([
      pool.query(`SELECT date, high, low, close, volume, source, created_at
       FROM (
         SELECT date, high, low, close, volume, source, created_at
         FROM price_history
         WHERE symbol = $1
         ORDER BY date DESC
         LIMIT 250
       ) recent
       ORDER BY date ASC`,
      [symbol]),
      pool.query(`SELECT bar_ts, close, source FROM (
        SELECT bar_ts, close, source
        FROM price_history_30m
        WHERE symbol = $1
          AND (bar_ts AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
          AND (bar_ts AT TIME ZONE 'America/New_York')::time < TIME '16:00'
        ORDER BY bar_ts DESC
        LIMIT 200
      ) recent ORDER BY bar_ts ASC`, [symbol]),
    ]);
    const rows = dailyResult.rows;
    const momentum = deriveCompositeMomentum(rows, intradayResult.rows);
    const derived = deriveSupportResistance(rows);
    if (!derived) {
      return res.json({ symbol, status: 'missing', bar_count: rows.length, support: [], resistance: [], focus: deriveFocusScore([]), momentum });
    }
    const latest = rows[rows.length - 1];
    return res.json({
      symbol,
      status: 'ready',
      source: latest.source,
      snapshot_ts: latest.created_at,
      latest_date: toDateString(latest.date),
      bar_count: derived.bars.length,
      spot: derived.spot,
      support: derived.supports,
      resistance: derived.resistances,
      method: { pivot_window: 2, cluster_tolerance_pct: 1 },
      focus: deriveFocusScore(derived.bars),
      momentum,
    });
  } catch (err) {
    console.error('GET /api/sr/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendSupportResistance);

module.exports = { router, sendSupportResistance, deriveSupportResistance, deriveFocusScore, deriveCompositeMomentum };
