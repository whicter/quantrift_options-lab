import assert from 'node:assert/strict';
import test from 'node:test';

import { kalmanTrend } from './kalman.js';

test('returns empty series for empty input', () => {
  const r = kalmanTrend([]);
  assert.deepEqual(r.smooth, []);
  assert.deepEqual(r.upper, []);
});

test('output series align with the input length', () => {
  const prices = [10, 11, 12, 11, 13, 14];
  const r = kalmanTrend(prices);
  assert.equal(r.smooth.length, prices.length);
  assert.equal(r.slope.length, prices.length);
  assert.equal(r.upper.length, prices.length);
  assert.equal(r.lower.length, prices.length);
});

test('tracks a clean linear ramp with a positive slope and small error', () => {
  const prices = Array.from({ length: 40 }, (_, i) => 100 + i); // slope +1/step
  const r = kalmanTrend(prices);
  // after warm-up the smoothed level should sit near the true price
  const tailErr = Math.abs(r.smooth.at(-1) - prices.at(-1));
  assert.ok(tailErr < 2, `tail error ${tailErr}`);
  // and the estimated slope should be near +1
  assert.ok(r.slope.at(-1) > 0.7 && r.slope.at(-1) < 1.3, `slope ${r.slope.at(-1)}`);
});

test('smooths noise: filtered variance is far below raw variance around a flat mean', () => {
  // deterministic zig-zag around 100 (no RNG — scripts forbid Math.random)
  const prices = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 3 : -3));
  const r = kalmanTrend(prices);
  const tail = r.smooth.slice(30);
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const smoothVar = tail.reduce((a, v) => a + (v - mean) ** 2, 0) / tail.length;
  // raw swing variance is ~9; the filter should crush it well below the raw level
  assert.ok(smoothVar < 4, `smoothed variance ${smoothVar} not below raw swing`);
});

test('band brackets the smoothed level and respects the floor', () => {
  const prices = Array.from({ length: 20 }, (_, i) => 50 + i * 0.1);
  const r = kalmanTrend(prices, { bandFloorPct: 0.01 });
  for (let i = 0; i < prices.length; i += 1) {
    assert.ok(r.upper[i] > r.smooth[i]);
    assert.ok(r.lower[i] < r.smooth[i]);
    assert.ok((r.upper[i] - r.lower[i]) >= Math.abs(r.smooth[i]) * 0.02 * 0.99);
  }
});

test('higher process noise q tracks a step change faster', () => {
  const prices = [...Array(20).fill(100), ...Array(20).fill(120)];
  const slow = kalmanTrend(prices, { q: 0.005 });
  const fast = kalmanTrend(prices, { q: 0.2 });
  // one step after the jump, the faster filter should be closer to the new level
  const idx = 21;
  assert.ok(Math.abs(fast.smooth[idx] - 120) < Math.abs(slow.smooth[idx] - 120));
});

test('carries the prediction through a non-finite observation', () => {
  const prices = [100, 101, NaN, 103];
  const r = kalmanTrend(prices);
  assert.ok(Number.isFinite(r.smooth[2]));
  assert.ok(Number.isFinite(r.smooth[3]));
});
