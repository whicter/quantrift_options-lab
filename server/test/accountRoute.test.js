const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';

const dbPath = require.resolve('../src/db');
const queryResults = [];
const pool = { async query() { return queryResults.shift() || { rows: [] }; } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

const { requestUserId, requireAuthenticatedUser } = require('../src/lib/auth');
const { PLANS, ensureAccount } = require('../src/routes/account');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('auth guard returns JSON 401 and accepts Clerk user identity', () => {
  assert.equal(requestUserId({ auth: { userId: 'user_123' } }), 'user_123');
  const denied = responseRecorder();
  requireAuthenticatedUser({ auth: {} }, denied, () => assert.fail('must not continue'));
  assert.equal(denied.statusCode, 401);
  let continued = false;
  requireAuthenticatedUser({ auth: { userId: 'user_123' } }, responseRecorder(), () => { continued = true; });
  assert.equal(continued, true);
});

test('new account receives a free subscription and bounded entitlements', async () => {
  queryResults.push(
    { rows: [{ id: 7, clerk_user_id: 'user_123', email: null, display_name: null }] },
    { rows: [] },
    { rows: [{ plan: 'free', status: 'active', current_period_end: null, cancel_at_period_end: false }] },
  );
  const account = await ensureAccount('user_123');
  assert.equal(account.subscription.plan, 'free');
  assert.deepEqual(account.entitlements, ['learn', 'delayed_analysis']);
  assert.equal(account.entitlements.includes('scanner'), false);
});

test('plan catalog separates free and paid products', () => {
  assert.deepEqual(PLANS.map(plan => plan.id), ['free', 'pro']);
  assert.equal(PLANS.find(plan => plan.id === 'pro').entitlements.includes('portfolio'), true);
});
