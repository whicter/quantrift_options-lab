import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionableSetup, buildActionableSetups } from './scanOpportunity.js';

function contract({ expiry, dte, strike, right, bid, ask, delta, oi = 500, volume = 50 }) {
  return { expiry, dte, strike, right, bid, ask, delta, openInterest: oi, volume };
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
