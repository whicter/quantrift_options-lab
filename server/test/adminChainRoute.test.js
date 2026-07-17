const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
let queryResults = [];
const pool = {
  async query() {
    return queryResults.shift() || { rows: [] };
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

const { sendAdminChain, diagnostics } = require('../src/routes/adminChain');
const { requireAdminToken } = require('../src/lib/adminAuth');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function request(params = {}, query = {}, headers = {}) {
  const lookup = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { params, query, get: name => lookup[String(name).toLowerCase()] || '' };
}

test.beforeEach(() => { queryResults = []; });

test('admin chain requires a token and fails closed when unset', () => {
  const saved = process.env.ADMIN_API_TOKEN;
  delete process.env.ADMIN_API_TOKEN;
  const res = responseRecorder();
  let nexted = false;
  requireAdminToken(request(), res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 503);
  if (saved !== undefined) process.env.ADMIN_API_TOKEN = saved;
});

test('a wrong token is rejected with 401', () => {
  process.env.ADMIN_API_TOKEN = 'secret-token';
  const res = responseRecorder();
  let nexted = false;
  requireAdminToken(request({}, {}, { 'x-admin-token': 'wrong' }), res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
  delete process.env.ADMIN_API_TOKEN;
});

test('returns the raw chain with recomputed diagnostics', async () => {
  queryResults.push(
    { rows: [{ id: 7, symbol: 'AAPL', source: 'polygon_licensed', provider_status: 'ok', snapshot_ts: '2026-07-17T15:00:00Z', underlying_price: 210, contract_count: 3 }] },
    { rows: [
      { expiry: new Date('2026-08-21'), strike: 210, right: 'C', bid: 2, ask: 2.1, open_interest: 500, delta: 0.5, gamma: 0.02 },
      { expiry: new Date('2026-08-21'), strike: 210, right: 'P', bid: 1.9, ask: 2.0, open_interest: 400, delta: -0.5, gamma: 0.02 },
      { expiry: new Date('2026-08-21'), strike: 220, right: 'C', bid: null, ask: null, open_interest: null, delta: null, gamma: null },
    ] },
  );
  const res = responseRecorder();
  await sendAdminChain(request({ symbol: 'aapl' }), res);

  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.snapshot.source, 'polygon_licensed');
  assert.equal(res.body.contracts.length, 3);
  // The third contract has no quote, no OI and no Greeks.
  assert.equal(res.body.diagnostics.quoted_contract_count, 2);
  assert.equal(res.body.diagnostics.has_usable_quotes, true);
  assert.equal(res.body.diagnostics.missing_greeks_count, 1);
  assert.equal(res.body.diagnostics.missing_oi_count, 1);
});

test('a chain with no usable quotes is reported explicitly', () => {
  const diag = diagnostics([
    { expiry: new Date('2026-08-21'), strike: 210, right: 'C', bid: null, ask: null, open_interest: 100, delta: 0.5, gamma: 0.02 },
  ]);
  // The state that blocks strategy legs must be visible, not implied.
  assert.equal(diag.has_usable_quotes, false);
  assert.equal(diag.quoted_contract_count, 0);
});

test('missing snapshot returns a missing status rather than an error', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendAdminChain(request({ symbol: 'ZZZZ' }), res);
  assert.equal(res.body.status, 'missing');
  assert.deepEqual(res.body.contracts, []);
});

test('an invalid symbol is rejected before any query', async () => {
  const res = responseRecorder();
  await sendAdminChain(request({ symbol: 'not a symbol!' }), res);
  assert.equal(res.statusCode, 400);
});

test('the contract limit is clamped to a bounded range', async () => {
  queryResults.push(
    { rows: [{ id: 1, symbol: 'AAPL', snapshot_ts: '2026-07-17T15:00:00Z' }] },
    { rows: [] },
  );
  const res = responseRecorder();
  await sendAdminChain(request({ symbol: 'AAPL' }, { limit: '999999' }), res);
  assert.equal(res.body.limit, 5000);
});
