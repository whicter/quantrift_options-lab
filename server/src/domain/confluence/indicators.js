const RETRACEMENT_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];
const EXTENSION_RATIOS = [1.272, 1.618];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function closes(rows) {
  return (rows || []).map(row => finiteNumber(row.close)).filter(value => value != null);
}

function simpleMovingAverage(values, period) {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

function exponentialMovingAverageSeries(values, period) {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const series = Array(values.length).fill(null);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  series[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = ((values[index] - current) * multiplier) + current;
    series[index] = current;
  }
  return series;
}

function exponentialMovingAverage(values, period) {
  return exponentialMovingAverageSeries(values, period).at(-1) ?? null;
}

function trueRange(bar, previousClose) {
  const high = finiteNumber(bar?.high);
  const low = finiteNumber(bar?.low);
  if (high == null || low == null || high < low) return null;
  if (previousClose == null) return high - low;
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

function wilderAtrSeries(rows, period = 14) {
  if (!Number.isInteger(period) || period <= 0) return [];
  const bars = (rows || []).map(row => ({
    date: row?.date ?? null,
    high: finiteNumber(row?.high),
    low: finiteNumber(row?.low),
    close: finiteNumber(row?.close),
  }));
  if (bars.length < period || bars.some(bar => bar.high == null || bar.low == null || bar.close == null)) return [];

  const ranges = bars.map((bar, index) => trueRange(bar, index ? bars[index - 1].close : null));
  if (ranges.some(range => range == null)) return [];

  const series = Array(bars.length).fill(null);
  let atr = ranges.slice(0, period).reduce((sum, range) => sum + range, 0) / period;
  series[period - 1] = atr;
  for (let index = period; index < ranges.length; index += 1) {
    atr = ((atr * (period - 1)) + ranges[index]) / period;
    series[index] = atr;
  }
  return series.map((value, index) => value == null ? null : { date: bars[index].date, value });
}

function wilderAtr(rows, period = 14) {
  return wilderAtrSeries(rows, period).at(-1)?.value ?? null;
}

function fibonacciLevels(lowValue, highValue) {
  const low = finiteNumber(lowValue);
  const high = finiteNumber(highValue);
  if (low == null || high == null || high <= low) return [];
  const range = high - low;
  const retracements = RETRACEMENT_RATIOS.map(ratio => ({
    kind: 'retracement', ratio,
    label: `Fib ${(ratio * 100).toFixed(1)}%`,
    price: low + (range * ratio),
  }));
  const extensions = EXTENSION_RATIOS.flatMap(ratio => ([
    { kind: 'extension_up', ratio, label: `Fib ${(ratio * 100).toFixed(1)}% up`, price: low + (range * ratio) },
    { kind: 'extension_down', ratio, label: `Fib ${(ratio * 100).toFixed(1)}% down`, price: high - (range * ratio) },
  ]));
  return [...retracements, ...extensions];
}

function fibonacciAnchors(rows, { longLookback = 250, shortLookback = 90 } = {}) {
  const bars = (rows || []).map(row => ({ high: finiteNumber(row?.high), low: finiteNumber(row?.low) }))
    .filter(bar => bar.high != null && bar.low != null && bar.high >= bar.low);
  const buildAnchor = (lookback, name) => {
    const window = bars.slice(-lookback);
    if (window.length < 2) return null;
    const low = Math.min(...window.map(bar => bar.low));
    const high = Math.max(...window.map(bar => bar.high));
    if (high <= low) return null;
    return { name, lookback: window.length, low, high, levels: fibonacciLevels(low, high) };
  };
  return {
    long: buildAnchor(longLookback, '250d'),
    short: buildAnchor(shortLookback, '90d'),
  };
}

function movingAverageLevels(rows) {
  const values = closes(rows);
  return {
    ema20: exponentialMovingAverage(values, 20),
    ema50: exponentialMovingAverage(values, 50),
    ema100: exponentialMovingAverage(values, 100),
    sma200: simpleMovingAverage(values, 200),
  };
}

module.exports = {
  RETRACEMENT_RATIOS,
  EXTENSION_RATIOS,
  simpleMovingAverage,
  exponentialMovingAverageSeries,
  exponentialMovingAverage,
  trueRange,
  wilderAtrSeries,
  wilderAtr,
  fibonacciLevels,
  fibonacciAnchors,
  movingAverageLevels,
};
