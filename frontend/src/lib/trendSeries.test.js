import assert from 'node:assert/strict';
import test from 'node:test';

import { dailySpread, weeklySpread } from './trendSeries.js';

test('dailySpread is zero for a flat series and length-aligned', () => {
  const s = dailySpread([100, 100, 100, 100]);
  assert.equal(s.length, 4);
  assert.ok(s.every(v => Math.abs(v) < 1e-9));
});

test('dailySpread is positive when price is above its trailing mean', () => {
  const s = dailySpread([100, 100, 100, 100, 110]);
  assert.ok(s.at(-1) > 0);
});

test('weeklySpread returns a value per daily bar', () => {
  const bars = Array.from({ length: 15 }, (_, i) => ({
    date: `2026-05-${String(4 + i).padStart(2, '0')}`, close: 100 + i,
  }));
  const w = weeklySpread(bars);
  assert.equal(w.length, bars.length);
  assert.ok(w.every(v => Number.isFinite(v)));
});

test('weeklySpread is constant within a week (same value across a week block)', () => {
  // Two full ISO weeks, Mon-Fri each
  const week1 = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
  const week2 = ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15'];
  const bars = [...week1, ...week2].map((date, i) => ({ date, close: 100 + i }));
  const w = weeklySpread(bars);
  // all indices in week1 share one value; week2 share another
  const w1 = new Set(w.slice(0, 5));
  const w2 = new Set(w.slice(5, 10));
  assert.equal(w1.size, 1);
  assert.equal(w2.size, 1);
});

test('weeklySpread degrades to fixed chunks without dates', () => {
  const bars = Array.from({ length: 12 }, (_, i) => ({ close: 100 + i }));
  const w = weeklySpread(bars);
  assert.equal(w.length, 12);
  assert.ok(w.every(v => Number.isFinite(v)));
});

test('weeklySpread handles empty input', () => {
  assert.deepEqual(weeklySpread([]), []);
});
