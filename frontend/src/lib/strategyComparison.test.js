import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStrategyComparison } from './strategyComparison.js';

test('builds a single DTE comparison summary', () => {
  const summary = buildStrategyComparison({
    id: 'bull-call', name: 'Bull Call Spread', zh: '牛市看涨价差', tag: 'bullish', lvl: 'novice',
    legs: [{ dir: 1, type: 'call', K: 100, qty: 1, dte: 45 }, { dir: -1, type: 'call', K: 110, qty: 1, dte: 45 }],
    notes: { iv: 'IV < 40', tp: '50%', sl: '50%' },
  });

  assert.equal(summary.dte, '45 DTE');
  assert.deepEqual(summary.legs[0], { action: 'LONG', type: 'CALL', strike: 100, quantity: 1, dte: 45 });
});

test('preserves an actual DTE range for calendar strategies', () => {
  const summary = buildStrategyComparison({
    id: 'calendar', name: 'Calendar', zh: '日历价差', tag: 'neutral', lvl: 'intermediate',
    legs: [{ dir: -1, type: 'call', K: 100, qty: 1, dte: 30 }, { dir: 1, type: 'call', K: 100, qty: 1, dte: 60 }],
    notes: { iv: 'Near IV > far IV', tp: '25%', sl: '50%' },
  });

  assert.equal(summary.dte, '30-60 DTE');
});
