const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSymbol,
  isValidSymbol,
  normalizeSymbolList,
} = require('../src/lib/symbols');

test('normalizeSymbol trims and uppercases external values', () => {
  assert.equal(normalizeSymbol(' brk.b '), 'BRK.B');
  assert.equal(normalizeSymbol(null), '');
});

test('isValidSymbol preserves default and strict route policies', () => {
  assert.equal(isValidSymbol('BRK.B'), true);
  assert.equal(isValidSymbol('123'), true);
  assert.equal(isValidSymbol('A'.repeat(13)), false);
  assert.equal(isValidSymbol('A/B'), false);
  assert.equal(isValidSymbol('123', { maxLength: 10, requireLeadingLetter: true }), false);
  assert.equal(isValidSymbol('SPY', { maxLength: 10, requireLeadingLetter: true }), true);
});

test('normalizeSymbolList filters, deduplicates, and limits in input order', () => {
  assert.deepEqual(
    normalizeSymbolList([' spy ', 'QQQ', 'spy', 'A/B', 'IWM'], { limit: 2 }),
    ['SPY', 'QQQ']
  );
});
