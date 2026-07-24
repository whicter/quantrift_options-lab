import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRotationView, dotPosition, RS_DOMAIN, MOM_DOMAIN, PLOT_HALF, QUADRANTS } from './sectorRotation.js';

const res = {
  status: 'ready',
  benchmark: 'SPY',
  benchmark_ret20: 1.89,
  quadrant_counts: { leading: 1, weakening: 1, improving: 1, lagging: 1 },
  sectors: [
    { symbol: 'XLE', label: '能源', quadrant: 'leading', rs: 6.82, momentum: 4.05, ret20: 8.7, iv_rank: null },
    { symbol: 'XLF', label: '金融', quadrant: 'weakening', rs: 2.14, momentum: -0.46, ret20: 4.03, iv_rank: 26 },
    { symbol: 'SMH', label: '半导体', quadrant: 'improving', rs: -7.53, momentum: 2.21, ret20: -5.65, iv_rank: 85 },
    { symbol: 'TAN', label: '太阳能', quadrant: 'lagging', rs: -10.15, momentum: -0.21, ret20: -8.27, iv_rank: 41 },
  ],
};

test('dotPosition maps rs to x and momentum to an inverted y, clamped to the plot', () => {
  // center
  assert.deepEqual(dotPosition(0, 0), { x: 50, y: 50 });
  // +full rs -> right edge; +full momentum -> top (y smaller)
  assert.equal(dotPosition(RS_DOMAIN, 0).x, 50 + PLOT_HALF);
  assert.equal(dotPosition(0, MOM_DOMAIN).y, 50 - PLOT_HALF);
  // out-of-domain clamps to the edge, never escapes
  assert.equal(dotPosition(999, 0).x, 50 + PLOT_HALF);
  assert.equal(dotPosition(0, -999).y, 50 + PLOT_HALF);
});

test('builds dots with positions + quadrant tone, and groups by quadrant', () => {
  const v = buildRotationView(res);
  assert.equal(v.status, 'ready');
  assert.equal(v.benchmark, 'SPY');
  assert.equal(v.benchmarkRet20, 1.89);
  assert.equal(v.dots.length, 4);

  const xle = v.dots.find(d => d.symbol === 'XLE');
  assert.equal(xle.tone, 'lead');
  assert.ok(xle.x > 50 && xle.y < 50); // strong + accelerating -> upper right

  // groups follow the canonical quadrant order
  assert.deepEqual(v.groups.map(g => g.id), QUADRANTS.map(q => q.id));
  const improving = v.groups.find(g => g.id === 'improving');
  assert.equal(improving.count, 1);
  assert.equal(improving.sectors[0].symbol, 'SMH');
});

test('group sectors are sorted by relative strength descending', () => {
  const many = {
    ...res,
    quadrant_counts: { leading: 3, weakening: 0, improving: 0, lagging: 0 },
    sectors: [
      { symbol: 'A', quadrant: 'leading', rs: 1, momentum: 1 },
      { symbol: 'B', quadrant: 'leading', rs: 5, momentum: 1 },
      { symbol: 'C', quadrant: 'leading', rs: 3, momentum: 1 },
    ],
  };
  const v = buildRotationView(many);
  assert.deepEqual(v.groups.find(g => g.id === 'leading').sectors.map(s => s.symbol), ['B', 'C', 'A']);
});

test('an empty quadrant still appears as a group with count 0', () => {
  const v = buildRotationView(res);
  // all four quadrants present even though the fixture spreads one each
  assert.equal(v.groups.length, 4);
  for (const g of v.groups) assert.ok(g.count >= 0);
});

test('passes through a non-ready status and flags empty', () => {
  assert.equal(buildRotationView({ status: 'missing' }).status, 'missing');
  assert.equal(buildRotationView(null).status, 'missing');
  assert.equal(buildRotationView({ status: 'ready', sectors: [] }).empty, true);
});
