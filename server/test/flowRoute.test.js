const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/flow');
const queryResults = [];
const pool = {
  async query() {
    assert.ok(queryResults.length, 'unexpected database query');
    return queryResults.shift();
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[routePath];
const { sendFlow } = require(routePath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => { queryResults.length = 0; });

test('returns missing when the stream has never produced a provider heartbeat', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendFlow({ params: { symbol: 'AAPL' }, query: {} }, res);
  assert.equal(res.body.status, 'missing');
  assert.equal(res.body.freshness, 'missing');
  assert.deepEqual(res.body.items, []);
});

test('fresh provider with no symbol events is quiet rather than missing', async () => {
  queryResults.push(
    { rows: [{ source: 'unusual_whales', status: 'connected', last_message_at: new Date().toISOString() }] },
    { rows: [] },
  );
  const res = responseRecorder();
  await sendFlow({ params: { symbol: 'QUIET1' }, query: {} }, res);
  assert.equal(res.body.status, 'quiet');
  assert.equal(res.body.freshness, 'fresh');
});

test('aggregates option flow and TRF notional from real event rows', async () => {
  queryResults.push(
    { rows: [{ source: 'unusual_whales', status: 'connected', last_message_at: new Date().toISOString() }] },
    { rows: [
      { event_type: 'option_flow', premium: '50000', has_sweep: true },
      { event_type: 'dark_pool', premium: '2000000', has_sweep: false },
    ] },
  );
  const res = responseRecorder();
  await sendFlow({ params: { symbol: 'FLOW1' }, query: { limit: '10' } }, res);
  assert.equal(res.body.status, 'active');
  assert.equal(res.body.summary.option_flow_count, 1);
  assert.equal(res.body.summary.sweep_count, 1);
  assert.equal(res.body.summary.dark_pool_notional, 2000000);
  assert.equal(res.body.items.length, 2);
});

test('stale provider state does not present old events as fresh', async () => {
  queryResults.push(
    { rows: [{ source: 'unusual_whales', status: 'connected', last_message_at: new Date(Date.now() - 10 * 60000).toISOString() }] },
    { rows: [{ event_type: 'option_flow', premium: '1', has_sweep: false }] },
  );
  const res = responseRecorder();
  await sendFlow({ params: { symbol: 'STALEFLOW' }, query: {} }, res);
  assert.equal(res.body.status, 'stale');
  assert.equal(res.body.is_stale, true);
});
