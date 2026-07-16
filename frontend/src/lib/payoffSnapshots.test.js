import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayoffSnapshots, optionValueAtDays } from './payoffSnapshots.js';

test('creates descending, distinct intermediate DTE snapshots', () => {
  assert.deepEqual(createPayoffSnapshots(45), [
    { days: 34, label: '34 DTE' },
    { days: 23, label: '23 DTE' },
    { days: 11, label: '11 DTE' },
  ]);
});

test('does not create intermediate snapshots for one-day strategies', () => {
  assert.deepEqual(createPayoffSnapshots(1), []);
});

test('uses intrinsic value for an expired option leg', () => {
  assert.equal(optionValueAtDays({ spot: 110, strike: 100, type: 'call', days: 0, price: 4 }), 10);
  assert.equal(optionValueAtDays({ spot: 90, strike: 100, type: 'put', days: 0, price: 4 }), 10);
});
