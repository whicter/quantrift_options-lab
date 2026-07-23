import assert from 'node:assert/strict';
import test from 'node:test';
import { blankLeg, buildPositionPayload, money } from './portfolio.js';

test('builds a normalized multi-leg position payload', () => {
  const payload = buildPositionPayload({
    symbol: ' aapl ', strategy_name: 'Bull Put Spread', quantity: '2',
    legs: [
      { ...blankLeg(), side: 'short', option_right: 'P', expiry: '2026-08-21', strike: '300', entry_price: '4.2' },
      { ...blankLeg(), option_right: 'P', expiry: '2026-08-21', strike: '295', entry_price: '2.1' },
    ],
  });
  assert.equal(payload.symbol, 'AAPL');
  assert.equal(payload.quantity, 2);
  assert.equal(payload.legs[0].strike, 300);
});

test('rejects incomplete legs and formats signed money', () => {
  assert.throws(() => buildPositionPayload({ symbol: 'AAPL', strategy_name: 'Call', legs: [blankLeg()] }), /到期日/);
  assert.equal(money(-12.5), '-$12.50');
});
