import assert from 'node:assert/strict';
import test from 'node:test';

import { toAnalyzeRecommendation } from './analyzeRecommendation.js';

test('maps the server-selected candidate into the Analyze display without full contract-chain fields', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: {
      strategy: 'Bull Put Spread',
      pricing: 'Net credit $120.00 · Max loss $380.00',
      dte: 42,
      credit: 1.2,
      maxLoss: 3.8,
      pop: { status: 'available', probability: 0.684 },
      legs: [
        { action: 'SELL', right: 'P', strike: 95, delta: -0.2, dte: 42 },
        { action: 'BUY', right: 'P', strike: 90, delta: -0.1, dte: 42 },
      ],
    },
  });

  assert.equal(result.unavailableReason, null);
  assert.equal(result.recommendation.strategy, 'Bull Put Spread');
  assert.equal(result.recommendation.params.pop, 68);
  assert.equal(result.recommendation.params.premium, 120);
  assert.equal(result.recommendation.params.maxLoss, 380);
  assert.equal(result.recommendation.legs[0].label, 'PUT 95');
  assert.equal('bid' in result.recommendation.legs[0], false);
});

test('labels a debit strategy as a cost, not a $0 net credit (credit:null must stay null)', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: {
      strategy: 'Long Put',
      pricing: 'Debit $1,459 · Max loss $1,459',
      dte: 62,
      credit: null,
      debit: 14.59,
      maxLoss: 14.59,
      pop: { status: 'available', probability: 0.33 },
      legs: [{ action: 'BUY', right: 'P', strike: 750, delta: -0.42, dte: 62 }],
    },
  });

  assert.equal(result.recommendation.params.premiumLabel, '每份合约成本');
  assert.equal(result.recommendation.params.premium, 1459);
  assert.equal(result.recommendation.params.maxLoss, 1459);
});

test('preserves the server reason when no candidate satisfies the real quote filters', () => {
  const result = toAnalyzeRecommendation({ status: 'missing', reason: '没有满足流动性门槛的完整策略腿' });
  assert.equal(result.recommendation, null);
  assert.equal(result.unavailableReason, '没有满足流动性门槛的完整策略腿');
});
