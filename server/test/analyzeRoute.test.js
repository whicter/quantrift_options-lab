const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const routePath = require.resolve('../src/routes/analyze');
const queryResults = [];
const refreshCalls = [];
const pool = { async query() { return queryResults.shift() || { rows: [] }; } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
require.cache[refreshPath] = {
  id: refreshPath, filename: refreshPath, loaded: true,
  exports: { enqueueRefreshJob: async job => { refreshCalls.push(job); return 'queued'; } },
};
delete require.cache[routePath];
const { sendAnalyzeStatus } = require(routePath);

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test.beforeEach(() => { queryResults.length = 0; refreshCalls.length = 0; });

test('unknown symbol is registered and enqueues the complete data bundle', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: false, has_metrics: false, has_options: false, has_gex: false,
    active_jobs: 0, queue_depth: 3,
    metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'new1' } }, res);
  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.estimated_wait, '~1-3min');
  assert.deepEqual(refreshCalls.map(call => call.jobType), [
    'price_history_snapshot', 'symbol_metrics_snapshot', 'option_chain_snapshot',
  ]);
});

test('fully covered symbol returns ready without duplicate jobs', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0,
    metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(refreshCalls.length, 0);
});

test('derived IV Rank readiness satisfies metrics without a Tastytrade job', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_derived_metrics: true, has_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.coverage.metrics_source, 'derived');
  assert.equal(refreshCalls.some(call => call.jobType === 'symbol_metrics_snapshot'), false);
});

test('recent non-retryable metrics failure is exposed without enqueue loop', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: false, has_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: true,
    metrics_last_error: 'tastytrade metrics auth unavailable: device challenge',
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'COST' } }, res);
  assert.equal(res.body.status, 'partial');
  assert.equal(res.body.refresh.metrics, 'blocked');
  assert.equal(res.body.blockers[0].field, 'metrics');
  assert.equal(refreshCalls.length, 0);
});

test('malformed ticker is rejected before persistence', async () => {
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: "SS'TS'T'X" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queryResults.length, 0);
});
