const test = require('node:test');
const assert = require('node:assert/strict');
const { pullbackStructure } = require('../src/domain/scanner/pullbackStructure.cjs');

const base = { state: 'S2', symbol: 'AAPL', spot: 335, support: 330, putWall: 328, rsi14: 31, mfi14: 25, ivRank: 68 };

test('a full pullback-to-support structure is reported with its inputs named', () => {
  const result = pullbackStructure(base);
  assert.equal(result.status, 'present');
  const keys = result.confirmations.map(c => c.key);
  assert.ok(keys.includes('near_support'));
  assert.ok(keys.includes('oversold_rsi'));
  assert.ok(keys.includes('fear_priced'));
  assert.match(result.reason, /RSI 31/);
  assert.match(result.reason, /IV Rank 68/);
});

test('a downtrend is never called a pullback to support', () => {
  // The whole failure mode this guards against: in a downtrend the level below
  // is the direction of travel, not support, and calling it support is how a
  // tool talks someone into catching a falling knife.
  const result = pullbackStructure({ ...base, state: 'S5' });
  assert.equal(result.status, 'absent');
  assert.match(result.reason, /空头结构/);
  assert.deepEqual(result.confirmations, []);
});

test('an uptrend that is not pulling back does not qualify', () => {
  const result = pullbackStructure({ ...base, state: 'S1' });
  assert.equal(result.status, 'absent');
});

test('too few confirmations reports weak rather than claiming the structure', () => {
  // Pullback state holds, but price is far from support and nothing is oversold.
  const result = pullbackStructure({ ...base, spot: 400, support: 300, putWall: 295, rsi14: 55, mfi14: 50, ivRank: 40 });
  assert.equal(result.status, 'weak');
  assert.ok(result.confirmations.length < 2);
  assert.match(result.reason, /尚不构成/);
});

test('the nearest level below spot is chosen, and the kind is disclosed', () => {
  const result = pullbackStructure({ ...base, support: 320, putWall: 331 });
  assert.equal(result.support.kind, 'put_wall', 'Put Wall at 331 is nearer than support at 320');
  assert.equal(result.support.level, 331);
});

test('a level above spot is never treated as support', () => {
  const result = pullbackStructure({ ...base, support: 400, putWall: 401, rsi14: 31, mfi14: 15, ivRank: 68 });
  assert.equal(result.support, null);
  assert.ok(!result.confirmations.some(c => c.key === 'near_support'));
});

test('rich premium maps the thesis onto selling a put spread below support', () => {
  // The options-specific half: profit if support merely holds, loss capped, and
  // the richer the fear premium the more it collects.
  const result = pullbackStructure({ ...base, ivRank: 75 });
  assert.equal(result.premium, 'rich');
  assert.equal(result.expression.side, 'seller');
  assert.equal(result.expression.shape, 'put_spread_below_support');
});

test('cheap premium maps the same thesis onto buying the rebound', () => {
  const result = pullbackStructure({ ...base, ivRank: 25, mfi14: 15 });
  assert.equal(result.premium, 'not_rich');
  assert.equal(result.expression.side, 'buyer');
  assert.equal(result.expression.shape, 'long_call');
});

test('every positive detection carries the pullback-vs-breakdown caveat', () => {
  const result = pullbackStructure(base);
  assert.match(result.caveat, /无法区分/);
  assert.match(result.caveat, /不是底部判断/);
});

test('nothing in the output tells the user to trade', () => {
  const result = pullbackStructure(base);
  const prose = [result.reason, result.caveat, result.expression.text].join(' ');
  assert.doesNotMatch(prose, /建议买|建议卖|应该买|应该卖|抄底|入场/, `compliance: ${prose}`);
});

test('missing optional inputs degrade to fewer confirmations, not a crash', () => {
  const result = pullbackStructure({ state: 'S2', spot: 335, support: 330, rsi14: null, mfi14: null, ivRank: null });
  assert.ok(['present', 'weak'].includes(result.status));
  assert.equal(result.confirmations.length, 1);
});
