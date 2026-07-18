const assert = require('node:assert/strict');
const test = require('node:test');

const {
  exponentialMovingAverage,
  exponentialMovingAverageSeries,
  fibonacciAnchors,
  fibonacciLevels,
  movingAverageLevels,
  wilderAtr,
  wilderAtrSeries,
} = require('../src/domain/confluence/indicators');

function bars(count = 250) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return { date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, high: close + 2, low: close - 1, close };
  });
}

test('Wilder ATR seeds from the first fourteen true ranges then smooths', () => {
  const input = [
    { high: 12, low: 10, close: 11 },
    { high: 13, low: 11, close: 12 },
    { high: 15, low: 12, close: 14 },
  ];
  const series = wilderAtrSeries(input, 2);
  assert.equal(series.length, 3);
  assert.equal(series[0], null);
  assert.equal(series[1].value, 2);
  assert.equal(series[2].value, 2.5);
  assert.equal(wilderAtr(input, 2), 2.5);
});

test('EMA is seeded with an SMA and has no value before its lookback', () => {
  assert.deepEqual(exponentialMovingAverageSeries([1, 2], 3), []);
  assert.deepEqual(exponentialMovingAverageSeries([1, 2, 3, 4], 3), [null, null, 2, 3]);
  assert.equal(exponentialMovingAverage([1, 2, 3, 4], 3), 3);
});

test('moving average levels expose the specified EMA and SMA periods without fabrication', () => {
  const levels = movingAverageLevels(bars());
  assert.ok(levels.ema20 > 0);
  assert.ok(levels.ema50 > 0);
  assert.ok(levels.ema100 > 0);
  assert.ok(levels.sma200 > 0);
  assert.equal(movingAverageLevels(bars(19)).ema20, null);
  assert.equal(movingAverageLevels(bars(199)).sma200, null);
});

test('Fibonacci levels include canonical retracements and two-sided extensions', () => {
  const levels = fibonacciLevels(100, 200);
  assert.equal(levels.find(level => level.label === 'Fib 50.0%').price, 150);
  assert.equal(levels.find(level => level.label === 'Fib 127.2% up').price, 227.2);
  assert.equal(levels.find(level => level.label === 'Fib 127.2% down').price, 72.8);
  assert.deepEqual(fibonacciLevels(100, 100), []);
});

test('Fibonacci anchors retain both fixed 250-day and 90-day windows', () => {
  const result = fibonacciAnchors(bars());
  assert.equal(result.long.lookback, 250);
  assert.equal(result.short.lookback, 90);
  assert.equal(result.long.low, 99);
  assert.equal(result.long.high, 351);
  assert.equal(result.short.low, 259);
  assert.equal(result.short.high, 351);
});
