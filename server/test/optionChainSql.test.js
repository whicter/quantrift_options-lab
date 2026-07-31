const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executableQuotePredicate,
  LATEST_QUOTED_CHAIN_CTE,
  QUOTED_CONTRACT_SAMPLES_CTE,
} = require('../src/repositories/optionChainSql');

test('quoted-chain SQL requires an executable non-crossed quote', () => {
  assert.equal(
    executableQuotePredicate('c'),
    'c.bid IS NOT NULL\n      AND c.ask IS NOT NULL\n      AND c.ask > 0\n      AND c.ask >= c.bid'
  );
  assert.match(LATEST_QUOTED_CHAIN_CTE, /quoted\.bid IS NOT NULL/);
  assert.match(LATEST_QUOTED_CHAIN_CTE, /quoted\.ask > 0/);
  assert.match(LATEST_QUOTED_CHAIN_CTE, /quoted\.ask >= quoted\.bid/);
});

test('contract sample SQL keeps the candidate-engine field contract', () => {
  for (const field of ['expiry', 'dte', 'strike', 'right', 'bid', 'ask', 'mark', 'openInterest', 'delta', 'gamma', 'iv', 'contractSymbol']) {
    assert.match(QUOTED_CONTRACT_SAMPLES_CTE, new RegExp(`'${field}'`));
  }
});
