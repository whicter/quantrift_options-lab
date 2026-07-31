const { average, isoDate, number } = require('../../lib/values');
const { newYorkDate } = require('../../lib/marketTime');

function deriveMomentum(dailyRows, intradayRows) {
  const daily = dailyRows
    .map(row => ({ close: number(row.close), date: isoDate(row.date) }))
    .filter(row => row.close != null);
  const intraday = intradayRows
    .map(row => ({
      ts: row.bar_ts,
      high: number(row.high),
      low: number(row.low),
      close: number(row.close),
      volume: number(row.volume) || 0,
    }))
    .filter(row => row.high != null && row.low != null && row.close != null);
  if (daily.length < 20) return { status: 'missing', reason: 'requires_20_daily_bars' };

  const closes = daily.map(row => row.close);
  const latest = closes.at(-1);
  const ma20 = average(closes.slice(-20));
  const ma50 = closes.length >= 50 ? average(closes.slice(-50)) : null;
  const change5d = closes.length >= 6 ? ((latest / closes.at(-6)) - 1) * 100 : null;
  let dailyScore = 50 + (latest >= ma20 ? 15 : -15);
  if (ma50 != null) dailyScore += latest >= ma50 ? 10 : -10;
  if (change5d != null) dailyScore += Math.max(-15, Math.min(15, change5d * 3));
  dailyScore = Math.max(0, Math.min(100, Math.round(dailyScore)));

  let breakout = { status: 'missing', direction: 'none', reason: 'requires_21_30m_bars' };
  let intradayScore = 50;
  if (intraday.length >= 21) {
    const current = intraday.at(-1);
    const prior = intraday.slice(-21, -1);
    const priorHigh = Math.max(...prior.map(row => row.high));
    const priorLow = Math.min(...prior.map(row => row.low));
    const avgVolume = average(prior.map(row => row.volume).filter(value => value > 0));
    const volumeRatio = avgVolume ? current.volume / avgVolume : null;
    const up = current.close > priorHigh;
    const down = current.close < priorLow;
    const confirmed = (up || down) && volumeRatio != null && volumeRatio >= 1.2;
    const stale = newYorkDate(current.ts) !== daily.at(-1).date;
    breakout = {
      status: stale ? 'stale' : 'ready',
      direction: !stale && confirmed ? (up ? 'up' : 'down') : 'none',
      candidate_direction: up ? 'up' : down ? 'down' : 'none',
      confirmed: !stale && confirmed,
      close: current.close,
      prior_high: priorHigh,
      prior_low: priorLow,
      volume_ratio: volumeRatio,
      bar_ts: current.ts,
      market_date: newYorkDate(current.ts),
      rule: 'close outside prior 20 bars and volume ratio >= 1.2',
    };
    intradayScore = confirmed
      ? (up ? 80 : 20)
      : current.close >= average(prior.map(row => row.close)) ? 60 : 40;
  }

  return {
    status: 'ready',
    score: Math.round(dailyScore * 0.65 + intradayScore * 0.35),
    daily_score: dailyScore,
    intraday_score: intradayScore,
    latest_date: daily.at(-1).date,
    change_5d: change5d,
    ma20,
    ma50,
    breakout_30m: breakout,
  };
}

function deriveMarketRegime(instruments) {
  const ready = instruments.filter(item => item.momentum?.status === 'ready');
  if (!ready.length) return { status: 'missing', label: '数据不足', score: null };
  const score = Math.round(average(ready.map(item => item.momentum.score)));
  const negativeGamma = ready.filter(item => item.gex?.gamma_regime === 'negative').length;
  const highIv = ready.filter(item => number(item.iv_rank) >= 70).length;
  const adjusted = Math.max(0, Math.min(100, score - negativeGamma * 5 - highIv * 3));
  return {
    status: 'ready',
    score: adjusted,
    label: adjusted >= 65 ? 'Risk-on' : adjusted <= 35 ? 'Risk-off' : 'Mixed',
    negative_gamma_count: negativeGamma,
    high_iv_count: highIv,
  };
}

module.exports = { deriveMomentum, deriveMarketRegime };
