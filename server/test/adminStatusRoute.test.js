const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
let queryResults = [];
const pool = {
  async query(sql) {
    if (/to_regclass/.test(sql)) return { rows: [{ table_name: null }], rowCount: 1 };
    return queryResults.shift() || { rows: [], rowCount: 0 };
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

const { requireAdminToken } = require('../src/lib/adminAuth');
const { buildDataStatus, toPublicDataStatus } = require('../src/domain/status/statusReports');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function request(headers = {}) {
  const lookup = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: name => lookup[String(name).toLowerCase()] || '' };
}

test('admin routes fail closed when no admin token is configured', () => {
  delete process.env.ADMIN_API_TOKEN;
  const res = responseRecorder();
  requireAdminToken(request({ authorization: 'Bearer anything' }), res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'admin api not configured');
});

test('admin routes reject a missing or wrong token', () => {
  process.env.ADMIN_API_TOKEN = 'test-admin-token';

  const noToken = responseRecorder();
  requireAdminToken(request(), noToken, () => assert.fail('must not continue'));
  assert.equal(noToken.statusCode, 401);

  const wrongToken = responseRecorder();
  requireAdminToken(request({ authorization: 'Bearer wrong-token' }), wrongToken, () => assert.fail('must not continue'));
  assert.equal(wrongToken.statusCode, 401);

  // A wrong token of matching length must not pass the timing-safe comparison.
  const sameLength = responseRecorder();
  requireAdminToken(request({ authorization: 'Bearer test-admin-tokeX' }), sameLength, () => assert.fail('must not continue'));
  assert.equal(sameLength.statusCode, 401);
});

test('admin routes accept a correct token from either accepted header', () => {
  process.env.ADMIN_API_TOKEN = 'test-admin-token';

  let bearerPassed = false;
  requireAdminToken(request({ authorization: 'Bearer test-admin-token' }), responseRecorder(), () => { bearerPassed = true; });
  assert.equal(bearerPassed, true);

  let headerPassed = false;
  requireAdminToken(request({ 'x-admin-token': 'test-admin-token' }), responseRecorder(), () => { headerPassed = true; });
  assert.equal(headerPassed, true);
});

test('public data status exposes the symbol registry without provider internals', async () => {
  queryResults = [
    { rows: [{ symbol: 'AAPL', date: '2026-07-16', source: 'tastytrade', created_at: null }] },
  ];
  const publicReport = toPublicDataStatus(await buildDataStatus());
  const serialized = JSON.stringify(publicReport);

  assert.ok(Array.isArray(publicReport.expected_symbols));
  assert.ok(['ok', 'degraded'].includes(publicReport.status));

  for (const providerName of ['tastytrade', 'polygon_licensed', 'ib_internal', 'tt_internal']) {
    assert.equal(serialized.includes(providerName), false, `public status must not leak ${providerName}`);
  }
  for (const operationalField of ['source_counts', 'symbols', 'missing_symbols', 'stale_symbols', 'extra_symbols', 'price_history']) {
    assert.equal(operationalField in publicReport, false, `public status must not expose ${operationalField}`);
  }
});

test('admin data status retains the operational detail the public view drops', async () => {
  queryResults = [
    { rows: [{ symbol: 'AAPL', date: '2026-07-16', source: 'tastytrade', created_at: null }] },
  ];
  const report = await buildDataStatus();

  assert.deepEqual(report.source_counts, { tastytrade: 1 });
  assert.ok(Array.isArray(report.symbols));
  assert.ok(Array.isArray(report.extra_symbols));
  assert.ok(report.price_history);
});
