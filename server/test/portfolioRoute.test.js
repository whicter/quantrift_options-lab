const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const accountPath = require.resolve('../src/routes/account');
require.cache[accountPath] = { id: accountPath, filename: accountPath, loaded: true, exports: { ensureAccount: async () => ({ user: { id: 1 } }) } };

const { normalizePositionInput, buildPortfolio } = require('../src/routes/portfolio');

test('normalizes a bounded real option position', () => {
  const input = normalizePositionInput({
    symbol: ' aapl ', strategy_name: 'Bull Put Spread', quantity: 2,
    legs: [
      { expiry: '2026-08-21', strike: 300, option_right: 'p', side: 'short', quantity: 1, entry_price: 4.2 },
      { expiry: '2026-08-21', strike: 295, option_right: 'P', side: 'long', quantity: 1, entry_price: 2.1 },
    ],
  });
  assert.equal(input.symbol, 'AAPL');
  assert.equal(input.legs[0].option_right, 'P');
  assert.equal(input.legs[0].side, 'short');
  assert.throws(() => normalizePositionInput({ symbol: 'AAPL', strategy_name: 'x', legs: [] }), /invalid legs/);
});

test('portfolio valuation uses signed contract multiplier and actual marks', () => {
  const common = {
    position_id: 1, symbol: 'AAPL', strategy_name: 'Bull Put Spread', status: 'open', position_quantity: 2,
    opened_at: '2026-07-15T00:00:00Z', closed_at: null, notes: null, expiry: '2026-08-21', option_right: 'P',
    leg_quantity: 1, snapshot_ts: '2026-07-15T20:00:00Z', quote_source: 'polygon_licensed',
  };
  const result = buildPortfolio([
    { ...common, leg_id: 11, strike: 300, side: 'short', entry_price: 4, current_mark: 3, delta: -0.3, gamma: 0.02, theta: -0.08, vega: 0.12 },
    { ...common, leg_id: 12, strike: 295, side: 'long', entry_price: 2, current_mark: 1.5, delta: -0.2, gamma: 0.015, theta: -0.05, vega: 0.09 },
  ]);
  assert.equal(result.positions[0].entry_value, -400);
  assert.equal(result.positions[0].market_value, -300);
  assert.equal(result.positions[0].pnl, 100);
  assert.equal(result.summary.delta, 20);
  assert.equal(result.positions[0].priced_legs, 2);
});

test('missing quote remains unpriced instead of using entry price as current value', () => {
  const result = buildPortfolio([{
    position_id: 2, symbol: 'QQQ', strategy_name: 'Long Call', status: 'open', position_quantity: 1,
    opened_at: '2026-07-15T00:00:00Z', leg_id: 21, expiry: '2026-08-21', strike: 730,
    option_right: 'C', side: 'long', leg_quantity: 1, entry_price: 5, current_mark: null,
  }]);
  assert.equal(result.positions[0].priced_legs, 0);
  assert.equal(result.positions[0].pricing_complete, false);
  assert.equal(result.summary.pricing_complete, false);
  assert.equal(result.summary.unpriced_legs, 1);
  assert.equal(result.positions[0].market_value, 0);
  assert.equal(result.positions[0].pnl, 0);
});
