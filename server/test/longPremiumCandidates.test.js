const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActionableSetups } = require('../src/domain/scanner/candidateEngine.cjs');

function contract({ expiry, dte, strike, right, bid, ask, delta, iv = 0.3, oi = 500, volume = 50 }) {
  return { expiry, dte, strike, right, bid, ask, delta, iv, openInterest: oi, volume };
}

// Buyers and sellers need different delta bands. Delta approximates the
// risk-neutral probability of finishing in the money, so the seller-convention
// band (0.05-0.50) applied to a buyer restricts it to strikes with <=50% chance
// of finishing ITM -- which is why every Long Call / Long Put recommendation
// came out near 30% POP regardless of symbol or market (observed live on QQQ
// 31.8% and SPY 30.8%, 2026-07-30) and why the ledger's first real outcomes
// showed single_leg at 0% win rate / -1.0 average return on risk.

test('a buyer can hold an in-the-money strike, which the OTM-only filter used to remove', () => {
  const contracts = [
    // 95C with spot 100 is ITM -- previously excluded outright by strike >= spot.
    contract({ expiry: '2026-08-29', dte: 45, strike: 95, right: 'C', bid: 7.0, ask: 7.2, delta: 0.65 }),
  ];
  const calls = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.equal(calls.length, 1, 'an ITM long call must be a candidate');
  assert.equal(calls[0].legs[0].strike, 95);
  assert.equal(calls[0].debit, 7.2, 'still priced at the ask');
});

test('a seller is still restricted to out-of-the-money strikes', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 95, right: 'C', bid: 7.0, ask: 7.2, delta: 0.65 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 1.0, ask: 1.1, delta: 0.20 }),
  ];
  const shorts = buildActionableSetups(contracts, { price_close: 100 }, { allowUndefinedRisk: true }, ['Short Call']);
  assert.ok(shorts.length >= 1);
  assert.ok(shorts.every(s => s.legs[0].strike >= 100), 'a short call must stay OTM');
});

test('lottery-ticket deltas are excluded from buyer candidates', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 130, right: 'C', bid: 0.10, ask: 0.15, delta: 0.05 }),
  ];
  const calls = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.equal(calls.length, 0, 'a 0.05-delta long call is below the buyer band');
});

test('deep-ITM stock proxies are excluded from buyer candidates', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 60, right: 'C', bid: 40.0, ask: 40.5, delta: 0.95 }),
  ];
  const calls = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.equal(calls.length, 0, 'a 0.95-delta long call is above the buyer band');
});

test('buyer ranking responds to delta, instead of the old flat score', () => {
  // Same expiry, spread, OI and volume, so every other scoring dimension ties.
  // Previously long candidates took a constant deltaFit of 12, making these two
  // indistinguishable; the one nearer the buyer delta target must now win.
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 98, right: 'C', bid: 5.0, ask: 5.1, delta: 0.55 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 108, right: 'C', bid: 5.0, ask: 5.1, delta: 0.36 }),
  ];
  const calls = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].legs[0].delta, 0.55, 'the candidate nearer the 0.55 target ranks first');
  assert.ok(calls[0].score > calls[1].score, 'scores must actually differ');
});

test('an explicit user delta filter still overrides the buyer default', () => {
  // The Scanner must stay able to ask for exactly what it asked for.
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.9, ask: 1.0, delta: 0.15 }),
  ];
  const defaulted = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  assert.equal(defaulted.length, 0, 'outside the default buyer band');

  const requested = buildActionableSetups(
    contracts, { price_close: 100 }, { deltaMin: 0.10, deltaMax: 0.25 }, ['Long Call'],
  );
  assert.equal(requested.length, 1, 'an explicit delta filter wins over the default');
});
