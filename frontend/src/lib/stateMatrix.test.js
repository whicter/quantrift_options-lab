import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStateMatrixView, compactSignal } from './stateMatrix.js';

const STATES = [
  { id: 'S1', label: '强势上行', tone: 'bull' },
  { id: 'S2', label: '上行·回调中', tone: 'bull-soft' },
  { id: 'S3', label: '区间突破', tone: 'bull' },
  { id: 'S6', label: '区间/中性', tone: 'neutral' },
  { id: 'S4', label: '下行·企稳试探', tone: 'bear-soft' },
  { id: 'S5', label: '空头', tone: 'bear' },
  { id: 'S0', label: '高波动/事件', tone: 'warn' },
  { id: 'insufficient', label: '数据不足', tone: 'muted' },
];

const liveish = {
  status: 'ready',
  universe_count: 5,
  thresholds: { ivrHigh: 80, rvolBreakout: 1.5, momBand: 1.5 },
  states: STATES,
  symbols: [
    { symbol: 'AMD', state: 'S1', reasons: ['多头排列'], iv_rank: 61, ext50: 5.3, ret20: 8, rvol: 1 },
    { symbol: 'XLU', state: 'S1', reasons: ['多头排列'], iv_rank: 28, ext50: 1.2, ret20: 3, rvol: 1 },
    { symbol: 'TSLA', state: 'S5', reasons: ['空头排列'], iv_rank: 55, ext50: -9, ret20: -14, rvol: 1 },
    { symbol: 'SMH', state: 'S0', reasons: ['IV Rank 84 ≥ 80'], iv_rank: 84, ext50: 2, ret20: 1, rvol: 1.2 },
    { symbol: 'THIN', state: 'insufficient', reasons: ['历史不足 200 根日线'] },
  ],
};

test('groups symbols into canonical-ordered buckets, zero-filling empty states', () => {
  const v = buildStateMatrixView(liveish);
  assert.equal(v.status, 'ready');
  assert.equal(v.total, 5);
  // buckets follow the states metadata order
  assert.deepEqual(v.buckets.map(b => b.id), STATES.map(s => s.id));
  const s1 = v.buckets.find(b => b.id === 'S1');
  assert.equal(s1.count, 2);
  assert.deepEqual(s1.symbols.map(s => s.symbol), ['AMD', 'XLU']);
  // a state with no members is still present, reading 0
  assert.equal(v.buckets.find(b => b.id === 'S3').count, 0);
});

test('distribution segments exclude insufficient and carry percentage of total', () => {
  const v = buildStateMatrixView(liveish);
  assert.ok(!v.segments.some(s => s.id === 'insufficient'));
  assert.ok(!v.segments.some(s => s.id === 'S3')); // empty states dropped from the bar
  const s1 = v.segments.find(s => s.id === 'S1');
  assert.equal(s1.count, 2);
  assert.equal(s1.pct, 40); // 2 of 5
  // segments are in canonical order
  assert.deepEqual(v.segments.map(s => s.id), ['S1', 'S5', 'S0']);
});

test('compactSignal describes the state trigger without prescribing an action', () => {
  assert.equal(compactSignal({ state: 'S0', iv_rank: 84 }), 'IVR 84');
  assert.equal(compactSignal({ state: 'S0', iv_rank: 40, rvol: 3.1 }), 'RVol 3.1×');
  assert.equal(compactSignal({ state: 'S1', ext50: 5.3, ret20: 8 }), '+5% vs MA50');
  assert.equal(compactSignal({ state: 'S1', ext50: 1, ret20: 8 }), '20日 +8%');
  assert.equal(compactSignal({ state: 'S5', ret20: -14 }), '20日 -14%');
  assert.equal(compactSignal({ state: 'S6' }), 'MA 交织');
  // never an imperative
  for (const s of ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
    const label = compactSignal({ state: s, iv_rank: 50, ext50: 2, ret20: 1, rvol: 1 });
    for (const bad of ['买', '卖', '入场', '止损', 'buy', 'sell']) assert.ok(!label.includes(bad));
  }
});

test('per-symbol view carries reasons for the tooltip and a compact signal', () => {
  const v = buildStateMatrixView(liveish);
  const amd = v.buckets.find(b => b.id === 'S1').symbols[0];
  assert.equal(amd.signal, '+5% vs MA50');
  assert.deepEqual(amd.reasons, ['多头排列']);
  assert.equal(amd.ivRank, 61);
});

test('passes through a non-ready status without throwing', () => {
  assert.equal(buildStateMatrixView({ status: 'missing' }).status, 'missing');
  assert.equal(buildStateMatrixView(null).status, 'missing');
});
