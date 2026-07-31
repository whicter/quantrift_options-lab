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

test('replaces internal server reasons with a generic unavailable state', () => {
  const result = toAnalyzeRecommendation({ status: 'missing', reason: '没有满足流动性门槛的完整策略腿' });
  assert.equal(result.recommendation, null);
  assert.equal(result.unavailableReason, '当前没有可用的策略候选。');
});

test('internal candidate rationale is not carried into the display adapter', () => {
  const withGamma = toAnalyzeRecommendation({
    status: 'ready',
    candidate: {
      strategy: 'Long Call', pricing: 'Debit $200 · Max loss $200', dte: 45,
      credit: null, debit: 2, maxLoss: 2, pop: { status: 'unavailable' },
      directionConflict: false, directionNote: null,
      gammaNote: '负 Gamma 环境：做市商对冲往往放大波动，利于做多 Gamma',
      legs: [{ action: 'BUY', right: 'C', strike: 105, delta: 0.3, dte: 45 }],
    },
  });
  assert.equal('reason' in withGamma.recommendation, false);
  assert.equal('directionNote' in withGamma.recommendation, false);
  assert.equal('gammaNote' in withGamma.recommendation, false);
});

test('buyer and seller are both mapped, each carrying its own payoff', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: { strategy: 'Long Call', legs: [], pop: null, dte: 30, debit: 5, maxLoss: 5 },
    environment: { status: 'available', premium: 'rich', favours: 'seller', signalsAgree: true, reason: 'IV Rank 72...' },
    buyer: {
      strategy: 'Long Call', dte: 30, debit: 15.18, maxLoss: 15.18, legs: [],
      pop: { status: 'available', probability: 0.35 },
      payoff: { status: 'available', basis: 'one_expected_move_in_favour', reward_risk: 1.148, reference_price: 772.61, reference_profit: 17.43, max_loss: 15.18 },
    },
    seller: {
      strategy: 'Bull Put Spread', dte: 30, credit: 0.28, maxLoss: 0.72, legs: [],
      pop: { status: 'available', probability: 0.51 },
      payoff: { status: 'available', basis: 'max_profit_at_expiry', reward_risk: 0.389, max_profit: 0.28, max_loss: 0.72 },
    },
  });

  assert.equal(result.buyer.kind, 'buyer');
  assert.equal(result.buyer.shapeLabel, '低胜率 · 高赔付');
  assert.equal(result.buyer.pop, 35);
  assert.equal(result.buyer.payoff.rewardRisk, 1.148);
  assert.equal('basis' in result.buyer.payoff, false);
  assert.equal('referencePrice' in result.buyer.payoff, false);
  assert.equal('referenceProfit' in result.buyer.payoff, false);

  assert.equal(result.seller.kind, 'seller');
  assert.equal(result.seller.shapeLabel, '高胜率 · 有限赔付');
  assert.equal(result.seller.pop, 51);
  assert.equal(result.seller.payoff.rewardRisk, 0.389);

  assert.equal(result.environment.favours, 'seller');
  assert.equal('reason' in result.environment, false);
});

test('a missing side stays null so the card can say so instead of padding', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: { strategy: 'Long Call', legs: [], pop: null, dte: 30, debit: 5, maxLoss: 5 },
    buyer: null,
    seller: null,
  });
  assert.equal(result.buyer, null);
  assert.equal(result.seller, null);
});

test('a pin-dependent peak is flagged so the ratio is not shown unqualified', () => {
  // Live SPY 2026-07-30: a 5-wide iron butterfly showed 13.3:1 beside POP 8%.
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: { strategy: 'Iron Butterfly', legs: [], pop: null, dte: 62, credit: 4.65, maxLoss: 0.35 },
    seller: {
      strategy: 'Iron Butterfly', dte: 62, credit: 4.65, maxLoss: 0.35, legs: [],
      pop: { status: 'available', probability: 0.08 },
      payoff: { status: 'available', basis: 'max_profit_requires_pin_at_expiry', peak_requires_pin: true, reward_risk: 13.286, max_profit: 4.65, max_loss: 0.35 },
    },
  });
  assert.equal(result.seller.payoff.peakRequiresPin, true);
});

test('an unavailable environment is null, not a fabricated neutral reading', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: { strategy: 'Long Call', legs: [], pop: null, dte: 30, debit: 5, maxLoss: 5 },
    environment: { status: 'unavailable', reason: 'IV Rank 尚未就绪' },
  });
  assert.equal(result.environment, null);
});

test('only a structure that actually holds is surfaced', () => {
  // weak/absent/unavailable are withheld: a half-met structure shown at all
  // reads as a signal, and the caveat only means something attached to a
  // positive detection.
  for (const status of ['weak', 'absent', 'unavailable']) {
    const result = toAnalyzeRecommendation({
      status: 'ready',
      candidate: { strategy: 'Long Call', legs: [], pop: null, dte: 30, debit: 5, maxLoss: 5 },
      structure: { status, reason: 'x', confirmations: [] },
    });
    assert.equal(result.structure, null, `${status} must not surface`);
  }
});

test('a present structure carries only the high-level display result', () => {
  const result = toAnalyzeRecommendation({
    status: 'ready',
    candidate: { strategy: 'Long Call', legs: [], pop: null, dte: 30, debit: 5, maxLoss: 5 },
    structure: {
      status: 'present',
      favours: 'seller',
      reason: 'AAPL 处于上行趋势中的回调：...',
      caveat: '回调与破位在事前无法区分...',
      expression: { side: 'seller', shape: 'put_spread_below_support', text: '权利金偏贵时...' },
      support: { kind: 'put_wall', level: 330, distance_pct: 1.8 },
    },
  });
  assert.equal(result.structure.favours, 'seller');
  assert.deepEqual(Object.keys(result.structure), ['favours']);
});
