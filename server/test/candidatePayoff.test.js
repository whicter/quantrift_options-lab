const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActionableSetups, payoffForCandidate } = require('../src/domain/scanner/candidateEngine.cjs');

function contract({ expiry, dte, strike, right, bid, ask, delta, iv = 0.3, oi = 500, volume = 50 }) {
  return { expiry, dte, strike, right, bid, ask, delta, iv, openInterest: oi, volume };
}

// Probability alone misleads for buyers. A long option's POP is measured at
// strike + premium, so it is structurally sub-50% -- live SPY/QQQ long calls
// came out near 33% -- and a card showing only that number reads as a bad trade
// regardless of how good the payoff is. Payoff must travel with POP.

test('a credit structure reports an exact max profit and reward/risk', () => {
  const payoff = payoffForCandidate(
    { credit: 1.5, maxLoss: 3.5, legs: [] }, 100, { status: 'available', expected_move: 5 },
  );
  assert.equal(payoff.status, 'available');
  assert.equal(payoff.basis, 'max_profit_at_expiry');
  assert.equal(payoff.max_profit, 1.5);
  assert.equal(payoff.reward_risk, 0.429);
});

test('a long option is priced at one expected move, and says so', () => {
  // Spot 100, +1 EM = 110. A 100C costing 4 is worth 10 there -> +6 on 4 risked.
  const payoff = payoffForCandidate(
    { debit: 4, maxLoss: 4, legs: [{ right: 'C', strike: 100 }] },
    100, { status: 'available', expected_move: 10 },
  );
  assert.equal(payoff.status, 'available');
  assert.equal(payoff.basis, 'one_expected_move_in_favour', 'the reference must be disclosed, not implied');
  assert.equal(payoff.reference_price, 110);
  assert.equal(payoff.reference_profit, 6);
  assert.equal(payoff.reward_risk, 1.5);
});

test('a long put references a move down, not up', () => {
  const payoff = payoffForCandidate(
    { debit: 4, maxLoss: 4, legs: [{ right: 'P', strike: 100 }] },
    100, { status: 'available', expected_move: 10 },
  );
  assert.equal(payoff.reference_price, 90);
  assert.equal(payoff.reference_profit, 6);
});

test('a reference payoff that loses money is reported honestly, not floored at zero', () => {
  // A far OTM call: even a full expected move leaves it under water.
  const payoff = payoffForCandidate(
    { debit: 4, maxLoss: 4, legs: [{ right: 'C', strike: 115 }] },
    100, { status: 'available', expected_move: 10 },
  );
  assert.equal(payoff.reference_profit, -4);
  assert.ok(payoff.reward_risk < 0, 'a negative reference payoff must stay negative');
});

test('no expected move means no fabricated payoff', () => {
  const payoff = payoffForCandidate(
    { debit: 4, maxLoss: 4, legs: [{ right: 'C', strike: 100 }] },
    100, { status: 'unavailable' },
  );
  assert.equal(payoff.status, 'unavailable');
  assert.equal(payoff.reason, 'expected_move_unavailable');
});

test('undefined-risk structures report no reward/risk rather than dividing by nothing', () => {
  const payoff = payoffForCandidate({ credit: 2, maxLoss: null, legs: [] }, 100, { status: 'available' });
  assert.equal(payoff.status, 'unavailable');
  assert.equal(payoff.reason, 'undefined_risk');
});

test('payoff is attached to real candidates alongside pop', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 98, right: 'C', bid: 5.0, ask: 5.1, delta: 0.55 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 98, right: 'P', bid: 3.0, ask: 3.1, delta: -0.45 }),
  ];
  const [candidate] = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.ok(candidate, 'expected a long call candidate');
  assert.ok(candidate.payoff, 'payoff must be attached');
  assert.ok(candidate.pop, 'pop must still be attached');
});

test('a butterfly flags that its peak needs an exact pin, a vertical does not', () => {
  // Both report a max profit, but only one of them is reachable across the same
  // region POP measures. Live SPY 2026-07-30 showed a 5-wide fly at "13.3:1"
  // beside POP 8% -- factually consistent, but it reads as a great trade.
  const fly = payoffForCandidate(
    { strategy: 'Iron Butterfly', credit: 4.65, maxLoss: 0.35, legs: [] },
    740, { status: 'available', expected_move: 46 },
  );
  assert.equal(fly.peak_requires_pin, true);
  assert.equal(fly.basis, 'max_profit_requires_pin_at_expiry');

  const vertical = payoffForCandidate(
    { strategy: 'Bull Put Spread', credit: 0.28, maxLoss: 0.72, legs: [] },
    740, { status: 'available', expected_move: 46 },
  );
  assert.equal(vertical.peak_requires_pin, false);
  assert.equal(vertical.basis, 'max_profit_at_expiry');
});
