const assert = require('node:assert/strict');
const test = require('node:test');

const {
  toPublicAnalyzeCandidate,
  toPublicEnvironment,
  toPublicStructure,
} = require('../src/domain/analyze/publicCandidateDto.cjs');

test('public environment keeps state labels and drops decision inputs and rationale', () => {
  const dto = toPublicEnvironment({
    status: 'available',
    premium: 'rich',
    favours: 'seller',
    signalsAgree: true,
    ivRank: 72,
    gammaFavours: 'seller',
    reason: 'IV Rank 72 and positive gamma favour the seller',
    inputs: ['IV Rank 72', 'dealer positive gamma'],
  });

  assert.deepEqual(dto, {
    status: 'available',
    premium: 'rich',
    favours: 'seller',
    signalsAgree: true,
  });
});

test('public pullback structure keeps only the high-level result', () => {
  const dto = toPublicStructure({
    status: 'present',
    reason: 'RSI and support confirmations passed',
    confirmations: [{ key: 'oversold_rsi', text: 'RSI 31 <= 35' }],
    support: { kind: 'put_wall', level: 330, distance_pct: 1.8 },
    expression: {
      side: 'seller',
      shape: 'put_spread_below_support',
      text: 'sell a put spread below support',
    },
    caveat: 'not a bottom call',
  });

  assert.deepEqual(dto, { status: 'present', favours: 'seller' });
});

test('non-present internal structures do not reveal weak or missing-rule details', () => {
  assert.equal(toPublicStructure({
    status: 'weak',
    reason: 'only one of two confirmations passed',
    confirmations: [{ key: 'near_support' }],
  }), null);
  assert.equal(toPublicStructure({ status: 'unavailable', reason: 'needs 200 bars' }), null);
});

test('public candidate is allowlisted and omits ranking, provenance and payoff mechanics', () => {
  const dto = toPublicAnalyzeCandidate({
    strategy: 'Long Call',
    summary: '45 DTE',
    structure: 'Buy 100C',
    dte: 45,
    directionConflict: true,
    directionNote: 'internal direction rationale',
    gammaNote: 'internal gamma rationale',
    score: 88.4,
    pricing: 'internal pricing explanation',
    credit: null,
    debit: 4,
    maxLoss: 4,
    minOpenInterest: 500,
    totalVolume: 1200,
    avgSpreadPct: 0.08,
    expectedMove: { status: 'available', expected_move: 10, input_snapshot_ts: 'secret-ts' },
    pop: {
      status: 'available',
      probability: 0.34,
      breakevens: [104],
      input_snapshot_ts: 'secret-ts',
    },
    payoff: {
      status: 'available',
      basis: 'one_expected_move_in_favour',
      reward_risk: 1.5,
      reference_price: 110,
      reference_profit: 6,
      max_loss: 4,
      peak_requires_pin: false,
    },
    legs: [{
      action: 'BUY', dte: 45, strike: 100, right: 'C', delta: 0.52,
      bid: 3.9, ask: 4, contractSymbol: 'TESTC100',
    }],
  });

  assert.deepEqual(dto, {
    strategy: 'Long Call',
    structure: 'Buy 100C',
    dte: 45,
    directionConflict: true,
    credit: null,
    debit: 4,
    maxLoss: 4,
    pop: { status: 'available', probability: 0.34 },
    payoff: { status: 'available', reward_risk: 1.5, peak_requires_pin: false },
    legs: [{ action: 'BUY', dte: 45, strike: 100, right: 'C', delta: 0.52 }],
  });

  const serialized = JSON.stringify(dto);
  for (const privateField of [
    'score', 'reason', 'gammaNote', 'directionNote', 'inputs', 'confirmations',
    'support', 'expression', 'basis', 'reference_price', 'reference_profit',
    'expectedMove', 'input_snapshot_ts', 'bid', 'ask', 'contractSymbol',
  ]) {
    assert.equal(serialized.includes(privateField), false, `${privateField} must remain backend-only`);
  }
});
