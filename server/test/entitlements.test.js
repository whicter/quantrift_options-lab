const assert = require('node:assert/strict');
const test = require('node:test');

const accountPath = require.resolve('../src/routes/account');
let account = { entitlements: ['learn'] };
require.cache[accountPath] = {
  id: accountPath, filename: accountPath, loaded: true,
  exports: { ensureAccount: async () => account },
};
const authPath = require.resolve('../src/lib/auth');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: { authConfigured: () => true, requestUserId: req => req.auth?.userId || null },
};
const entitlementPath = require.resolve('../src/lib/entitlements');
delete require.cache[entitlementPath];
const { requireEntitlement } = require(entitlementPath);

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('entitlement middleware is rollout-safe while enforcement is disabled', async () => {
  process.env.AUTH_ENFORCEMENT_ENABLED = 'false';
  let continued = false;
  await requireEntitlement('scanner')({}, responseRecorder(), () => { continued = true; });
  assert.equal(continued, true);
});

test('enforced paid route rejects free plan and accepts Pro entitlement', async () => {
  process.env.AUTH_ENFORCEMENT_ENABLED = 'true';
  const denied = responseRecorder();
  await requireEntitlement('scanner')({ auth: { userId: 'user_1' } }, denied, () => assert.fail('must not continue'));
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.entitlement, 'scanner');

  account = { entitlements: ['scanner'] };
  let continued = false;
  const req = { auth: { userId: 'user_1' } };
  await requireEntitlement('scanner')(req, responseRecorder(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.clerkUserId, 'user_1');
});
