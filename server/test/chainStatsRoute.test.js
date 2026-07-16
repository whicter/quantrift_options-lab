const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const optionsPath = require.resolve('../src/routes/options');
const chainPath = require.resolve('../src/routes/chain');
const queryResults = [];
const pool = { async query() { return queryResults.shift(); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
require.cache[optionsPath] = {
  id: optionsPath, filename: optionsPath, loaded: true,
  exports: { sendChainSnapshot() {} },
};
delete require.cache[chainPath];
const { deriveChainStats, sendChainStats } = require(chainPath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const snapshot = { id: 7, underlying_price: 101, source: 'ib_internal', snapshot_ts: new Date().toISOString() };
const contracts = [
  { expiry: '2026-08-21', strike: 100, option_right: 'C', iv: 0.30, delta: 0.55, open_interest: 100 },
  { expiry: '2026-08-21', strike: 100, option_right: 'P', iv: 0.34, delta: -0.45, open_interest: 120 },
  { expiry: '2026-08-21', strike: 105, option_right: 'C', iv: 0.29, delta: 0.35, open_interest: 80 },
  { expiry: '2026-09-18', strike: 100, option_right: 'C', iv: 0.32, delta: 0.56, open_interest: 90 },
  { expiry: '2026-09-18', strike: 100, option_right: 'P', iv: 0.36, delta: -0.44, open_interest: 95 },
];

test('derives ATM term structure and call/put skew from actual contracts', () => {
  const result = deriveChainStats(snapshot, contracts);
  assert.equal(result.term_structure.length, 2);
  assert.equal(result.term_structure[0].atm_iv, 0.32);
  assert.equal(result.skew.expiry, '2026-08-21');
  assert.equal(result.skew.points[0].put_iv, 0.34);
  assert.equal(result.iv_contract_count, 5);
});

test('serializes PostgreSQL Date expiries as sortable ISO dates', () => {
  const dated = contracts.map(row => ({ ...row, expiry: new Date(`${row.expiry}T00:00:00Z`) }));
  const result = deriveChainStats(snapshot, dated);
  assert.equal(result.term_structure[0].expiry, '2026-08-21');
  assert.equal(result.term_structure[1].expiry, '2026-09-18');
});

test('route returns explicit missing when no IV snapshot exists', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendChainStats({ params: { symbol: 'MISS' } }, res);
  assert.equal(res.body.status, 'missing');
  assert.deepEqual(res.body.term_structure, []);
});

test('route returns source and derived arrays', async () => {
  queryResults.push({ rows: [snapshot] }, { rows: contracts });
  const res = responseRecorder();
  await sendChainStats({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.source, 'ib_internal');
  assert.equal(res.body.term_structure.length, 2);
});
