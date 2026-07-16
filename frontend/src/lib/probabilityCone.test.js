import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProbabilityCone } from './probabilityCone.js';

test('calculates a one-standard-deviation price range from weighted IV and longest DTE', () => {
  const cone = calculateProbabilityCone({
    spot: 100,
    legs: [
      { iv: 0.2, dte: 30, qty: 1 },
      { iv: 0.4, dte: 45, qty: 3 },
    ],
  });

  assert.equal(cone.dte, 45);
  assert.ok(Math.abs(cone.averageIv - 0.35) < 1e-12);
  assert.ok(cone.lower < 100);
  assert.ok(cone.upper > 100);
});

test('returns null without a valid spot or time-bearing IV legs', () => {
  assert.equal(calculateProbabilityCone({ spot: 0, legs: [{ iv: 0.2, dte: 30 }] }), null);
  assert.equal(calculateProbabilityCone({ spot: 100, legs: [{ iv: 0.2, dte: 0 }] }), null);
});
