const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const queryResults = [];
const pool = { async query(sql, params) { return queryResults.shift() || { rows: [], rowCount: 0, sql, params }; } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

const { normalizeDestination, normalizeRules, createSubscription, unsubscribe } = require('../src/routes/alerts');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('normalizes bounded scanner alert rules', () => {
  assert.deepEqual(normalizeRules({ symbols: ['aapl', 'AAPL', 'bad symbol'], min_iv_rank: '50', gamma_regime: 'positive', unusual_only: 1 }), {
    symbols: ['AAPL'], min_iv_rank: 50, gamma_regime: 'positive', unusual_only: true,
  });
  assert.throws(() => normalizeRules({ min_iv_rank: 101 }), /invalid/);
});

test('validates email and push destinations', () => {
  assert.deepEqual(normalizeDestination('email', { email: ' Test@Example.com ' }), { email: 'test@example.com' });
  assert.throws(() => normalizeDestination('email', { email: 'bad' }), /invalid/);
  assert.throws(() => normalizeDestination('web_push', { endpoint: 'http://unsafe', keys: {} }), /invalid/);
});

test('subscription requires consent and returns a non-address unsubscribe token', async () => {
  const denied = responseRecorder();
  await createSubscription({ body: { channel: 'email', destination: { email: 'a@b.com' }, consent: false } }, denied);
  assert.equal(denied.statusCode, 400);

  queryResults.push({ rows: [{ id: 1, channel: 'email', active: true }] });
  const accepted = responseRecorder();
  await createSubscription({ body: { channel: 'email', destination: { email: 'a@b.com' }, rules: {}, consent: true } }, accepted);
  assert.equal(accepted.statusCode, 201);
  assert.match(accepted.body.unsubscribe_token, /^[a-f0-9]{48}$/);
  assert.equal(JSON.stringify(accepted.body).includes('a@b.com'), false);
});

test('unsubscribe is token based and idempotent', async () => {
  queryResults.push({ rows: [{ id: 1 }], rowCount: 1 });
  const res = responseRecorder();
  await unsubscribe({ params: { token: 'a'.repeat(48) } }, res);
  assert.equal(res.body.status, 'unsubscribed');
});
