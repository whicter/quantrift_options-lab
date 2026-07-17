const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActionableSetup, buildActionableSetups } = require('../src/domain/scanner/candidateEngine.cjs');

function contract({ expiry, dte, strike, right, bid, ask, delta, iv, oi = 500, volume = 50 }) {
  return { expiry, dte, strike, right, bid, ask, delta, iv, openInterest: oi, volume };
}

test('single-best selector prefers the stronger 45 DTE setup over a 2 DTE setup', () => {
  const contracts = [
    contract({ expiry: '2026-07-17', dte: 2, strike: 105, right: 'C', bid: 1.2, ask: 1.3, delta: 0.22 }),
    contract({ expiry: '2026-07-17', dte: 2, strike: 110, right: 'C', bid: 0.5, ask: 0.6, delta: 0.10 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.22 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.9, ask: 1.0, delta: 0.12 }),
  ];
  const result = buildActionableSetup('Bear Call Spread', contracts, { price_close: 100 });
  assert.equal(result.status, 'ready');
  assert.equal(result.dte, 45);
  assert.equal(result.expiry, '2026-08-29');
  assert.equal(result.credit, 1);
});

test('unrestricted enumeration keeps qualifying short and medium DTE possibilities', () => {
  const contracts = [
    contract({ expiry: '2026-07-17', dte: 2, strike: 105, right: 'C', bid: 1.2, ask: 1.3, delta: 0.22 }),
    contract({ expiry: '2026-07-17', dte: 2, strike: 110, right: 'C', bid: 0.5, ask: 0.6, delta: 0.10 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.22 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.9, ask: 1.0, delta: 0.12 }),
  ];
  const results = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Bear Call Spread']);
  assert.deepEqual(new Set(results.map(result => result.dte)), new Set([2, 45]));
});

test('selector rejects a spread with non-positive executable credit', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 0.4, ask: 0.5, delta: -0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 85, right: 'P', bid: 0.5, ask: 0.6, delta: -0.10 }),
  ];
  const result = buildActionableSetup('Bull Put Spread', contracts, { price_close: 100 });
  assert.equal(result.status, 'missing');
});

test('short-term override allows a 2 DTE candidate', () => {
  const contracts = [
    contract({ expiry: '2026-07-17', dte: 2, strike: 105, right: 'C', bid: 1.2, ask: 1.3, delta: 0.22 }),
    contract({ expiry: '2026-07-17', dte: 2, strike: 110, right: 'C', bid: 0.5, ask: 0.6, delta: 0.10 }),
  ];
  const result = buildActionableSetup('Bear Call Spread', contracts, { price_close: 100 }, {
    dteMin: 1,
    dteMax: 14,
    deltaMin: 0.10,
    deltaMax: 0.40,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.dte, 2);
});

test('iron condor requires both spreads on the same expiry', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 2.0, ask: 2.1, delta: -0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 85, right: 'P', bid: 0.8, ask: 0.9, delta: -0.10 }),
    contract({ expiry: '2026-09-05', dte: 52, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.20 }),
    contract({ expiry: '2026-09-05', dte: 52, strike: 115, right: 'C', bid: 0.8, ask: 0.9, delta: 0.10 }),
  ];
  const result = buildActionableSetup('Iron Condor', contracts, { price_close: 100 });
  assert.equal(result.status, 'missing');
});

test('unrestricted selector returns every qualifying strategy and setup instead of one strategy per symbol', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 85, right: 'P', bid: 0.8, ask: 0.9, delta: -0.10 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 2.0, ask: 2.1, delta: -0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'P', bid: 5.0, ask: 5.2, delta: -0.50 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'C', bid: 5.0, ask: 5.2, delta: 0.50 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.8, ask: 0.9, delta: 0.10 }),
  ];
  const results = buildActionableSetups(contracts, { price_close: 100 });
  const strategies = new Set(results.map(result => result.strategy));
  assert.ok(results.length >= 3);
  assert.ok(strategies.has('Bull Put Spread'));
  assert.ok(strategies.has('Bear Call Spread'));
  assert.ok(strategies.has('Iron Condor'));
});

test('long call and long put use ask-side debit and expose finite max loss', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 1.9, ask: 2.0, delta: 0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 1.7, ask: 1.8, delta: -0.20 }),
  ];

  const calls = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Call']);
  const puts = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Long Put']);

  assert.equal(calls[0].debit, 2.0);
  assert.equal(calls[0].maxLoss, 2.0);
  assert.equal(calls[0].legs[0].action, 'BUY');
  assert.equal(puts[0].debit, 1.8);
  assert.equal(puts[0].breakevens[0], 88.2);
});

test('undefined-risk short strategies require the explicit advanced gate', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 2.0, ask: 2.1, delta: -0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.20 }),
  ];

  assert.equal(buildActionableSetups(contracts, { price_close: 100 }, {}, ['Short Strangle']).length, 0);
  const enabled = buildActionableSetups(
    contracts,
    { price_close: 100 },
    { allowUndefinedRisk: true },
    ['Short Strangle', 'Short Put', 'Short Call'],
  );

  assert.ok(enabled.some(setup => setup.strategy === 'Short Strangle' && setup.maxLoss === null));
  assert.ok(enabled.some(setup => setup.strategy === 'Short Put' && setup.maxLoss === 88));
  assert.ok(enabled.some(setup => setup.strategy === 'Short Call' && setup.maxLoss === null));
  assert.ok(enabled.every(setup => setup.legs.every(leg => leg.action === 'SELL')));
});

test('iron butterfly uses one ATM body and symmetric real wings', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 0.5, ask: 0.6, delta: -0.10 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'P', bid: 5.0, ask: 5.1, delta: -0.50 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'C', bid: 5.0, ask: 5.1, delta: 0.50 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 0.5, ask: 0.6, delta: 0.10 }),
  ];

  const results = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Iron Butterfly']);

  assert.ok(results.length > 0);
  assert.deepEqual(results[0].legs.map(leg => [leg.action, leg.right, leg.strike]), [
    ['BUY', 'P', 90], ['SELL', 'P', 100], ['SELL', 'C', 100], ['BUY', 'C', 110],
  ]);
  assert.ok(results[0].credit > 0);
  assert.ok(results[0].maxLoss > 0);
});

test('calendar and diagonal enforce near short and farther long expiries', () => {
  const contracts = [
    contract({ expiry: '2026-08-14', dte: 30, strike: 100, right: 'C', bid: 3.0, ask: 3.1, delta: 0.50 }),
    contract({ expiry: '2026-08-14', dte: 30, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.20 }),
    contract({ expiry: '2026-09-13', dte: 60, strike: 100, right: 'C', bid: 5.0, ask: 5.1, delta: 0.50 }),
  ];

  const calendar = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Calendar Spread'])[0];
  const diagonal = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Diagonal Spread'])[0];

  assert.equal(calendar.legs[0].action, 'SELL');
  assert.equal(calendar.legs[0].strike, calendar.legs[1].strike);
  assert.ok(calendar.legs[1].dte > calendar.legs[0].dte);
  assert.equal(diagonal.legs[0].strike, 110);
  assert.equal(diagonal.legs[1].strike, 100);
  assert.ok(diagonal.legs[1].dte > diagonal.legs[0].dte);
});

test('jade lizard only emits when total credit removes upside call-spread risk', () => {
  const contracts = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 5.0, ask: 5.1, delta: -0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.20 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.8, ask: 0.9, delta: 0.10 }),
  ];

  const results = buildActionableSetups(contracts, { price_close: 100 }, {}, ['Jade Lizard']);

  assert.ok(results.length > 0);
  assert.equal(results[0].legs.length, 3);
  assert.ok(results[0].credit >= 5);
  assert.equal(results[0].riskType, 'defined-upside');
});

test('expected move and POP declare inputs for credit, debit and iron-condor candidates', () => {
  const complete = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 85, right: 'P', bid: 0.8, ask: 0.9, delta: -0.1, iv: 0.27 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 90, right: 'P', bid: 2.0, ask: 2.1, delta: -0.2, iv: 0.29 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'C', bid: 5.0, ask: 5.2, delta: 0.5, iv: 0.3 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 100, right: 'P', bid: 5.0, ask: 5.2, delta: -0.5, iv: 0.32 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.2, iv: 0.28 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.8, ask: 0.9, delta: 0.1, iv: 0.25 }),
  ];
  const candidates = buildActionableSetups(complete, { price_close: 100 }, {}, ['Bear Call Spread', 'Long Call', 'Iron Condor']);
  const byStrategy = strategy => candidates.find(candidate => candidate.strategy === strategy);
  for (const strategy of ['Bear Call Spread', 'Long Call', 'Iron Condor']) {
    const available = byStrategy(strategy);
    assert.ok(available, `${strategy} candidate should exist`);
    assert.equal(available.expectedMove.status, 'available');
    assert.equal(available.expectedMove.model_version, 'expected-move-v1-atm-iv-sqrt-time');
    assert.equal(available.expectedMove.time_convention, 'calendar_days');
    assert.equal(available.expectedMove.standard_deviation, 1);
    assert.equal(available.pop.status, 'available');
    assert.equal(available.pop.model_version, 'pop-v1-lognormal-breakeven');
    assert.ok(available.pop.probability > 0 && available.pop.probability < 1);
  }

  const unavailable = buildActionableSetups(complete.map(row => ({ ...row, iv: null })), { price_close: 100 }, {}, ['Bear Call Spread'])[0];
  assert.equal(unavailable.expectedMove.status, 'unavailable');
  assert.equal(unavailable.pop.status, 'unavailable');
  assert.equal(unavailable.pop.reason, 'expected_move_unavailable');

  const missingQuote = [
    contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.2, iv: 0.28 }),
    contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.8, ask: null, delta: 0.1, iv: 0.25 }),
  ];
  assert.equal(buildActionableSetups(missingQuote, { price_close: 100 }, {}, ['Bear Call Spread']).length, 0);
});
