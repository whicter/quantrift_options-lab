const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const accountPath = require.resolve('../src/routes/account');
require.cache[accountPath] = { id: accountPath, filename: accountPath, loaded: true, exports: { ensureAccount: async () => ({}) } };

const { ensureStripeCustomer, checkoutParams, mapStripeStatus, processStripeEvent, receiveWebhook } = require('../src/routes/billing');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('checkout is bound to local user and configured recurring price', () => {
  process.env.PUBLIC_APP_URL = 'https://www.quantrift.io/';
  const params = checkoutParams({ user: { id: 7 } }, 'cus_1', 'price_pro');
  assert.equal(params.mode, 'subscription');
  assert.equal(params.client_reference_id, '7');
  assert.equal(params.subscription_data.metadata.quantrift_user_id, '7');
  assert.equal(params.line_items[0].price, 'price_pro');
  assert.equal(params.success_url, 'https://www.quantrift.io/account?checkout=success');
});

test('customer creation locks subscription row and reuses the persisted customer', async () => {
  let creates = 0;
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT stripe_customer_id')) return { rows: [{ stripe_customer_id: 'cus_existing' }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const customer = await ensureStripeCustomer(
    { customers: { async create() { creates += 1; return { id: 'cus_new' }; } } },
    { user: { id: 7, clerk_user_id: 'user_7' }, subscription: {} },
    { async connect() { return connection; } }
  );
  assert.equal(customer, 'cus_existing');
  assert.equal(creates, 0);
  assert.ok(queries.some(sql => sql.includes('FOR UPDATE')));
  assert.equal(queries.at(-1), 'COMMIT');
});

test('customer creation persists one customer inside the row lock transaction', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('SELECT stripe_customer_id')) return { rows: [{ stripe_customer_id: null }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const customer = await ensureStripeCustomer(
    { customers: { async create() { return { id: 'cus_new' }; } } },
    { user: { id: 7, clerk_user_id: 'user_7' }, subscription: {} },
    { async connect() { return connection; } }
  );
  assert.equal(customer, 'cus_new');
  const update = queries.find(query => query.sql.includes('UPDATE subscriptions'));
  assert.deepEqual(update.params, ['cus_new', 7]);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('Stripe statuses map to bounded local lifecycle', () => {
  assert.equal(mapStripeStatus('active'), 'active');
  assert.equal(mapStripeStatus('unpaid'), 'past_due');
  assert.equal(mapStripeStatus('paused'), 'incomplete');
});

test('signed subscription event upgrades plan idempotently', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO stripe_webhook_events')) return { rowCount: 1, rows: [{ event_id: 'evt_1' }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const database = { async connect() { return connection; } };
  const event = {
    id: 'evt_1', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 1780000000, cancel_at_period_end: false, metadata: { quantrift_user_id: '7' } } },
  };
  assert.equal(await processStripeEvent(event, database), 'processed');
  const update = queries.find(query => query.sql.includes('UPDATE subscriptions SET plan'));
  assert.equal(update.params[0], 'pro');
  assert.equal(update.params[1], 'active');
  assert.equal(update.params[6], 7);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('duplicate webhook event does not apply subscription twice', async () => {
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('INSERT INTO stripe_webhook_events')) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const status = await processStripeEvent({ id: 'evt_dup', type: 'customer.subscription.updated', data: { object: {} } }, { async connect() { return connection; } });
  assert.equal(status, 'duplicate');
  assert.equal(queries.some(sql => sql.includes('UPDATE subscriptions SET plan')), false);
  assert.equal(queries.at(-1), 'ROLLBACK');
});

test('checkout webhook ignores malformed local user reference', async () => {
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('INSERT INTO stripe_webhook_events')) return { rowCount: 1, rows: [{ event_id: 'evt_bad_user' }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const event = {
    id: 'evt_bad_user', type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', client_reference_id: 'not-a-user' } },
  };
  assert.equal(await processStripeEvent(event, { async connect() { return connection; } }), 'processed');
  assert.equal(queries.some(sql => sql.includes('UPDATE subscriptions SET stripe_customer_id')), false);
});

test('webhook rejects invalid signature before persistence', async () => {
  const res = responseRecorder();
  const client = { webhooks: { constructEvent() { throw new Error('bad signature'); } } };
  await receiveWebhook({ body: Buffer.from('{}'), get: () => 'bad' }, res, { client, secret: 'whsec_test', database: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid webhook signature');
});
