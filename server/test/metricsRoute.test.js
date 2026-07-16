const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const metricsPath = require.resolve('../src/routes/metrics');

const queries = [];
const queryResults = [];
const refreshCalls = [];
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    assert.ok(queryResults.length > 0, 'unexpected database query');
    return queryResults.shift();
  },
};

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
require.cache[refreshPath] = {
  id: refreshPath,
  filename: refreshPath,
  loaded: true,
  exports: {
    enqueueRefreshJob: async (job) => {
      refreshCalls.push(job);
      return 'queued';
    },
  },
};
delete require.cache[metricsPath];
const { sendMetrics } = require(metricsPath);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => {
  queries.length = 0;
  queryResults.length = 0;
  refreshCalls.length = 0;
});

test('metrics query merges derived HV and ATM IV with provider fallback provenance', async () => {
  queryResults.push({ rows: [{
    symbol: 'DERIVED1',
    date: '2026-07-15',
    iv30: 0.3,
    hv30: 0.2,
    iv_rank: 55,
    iv_percentile: 60,
    iv_hv_diff: 0.1,
    source: 'hybrid',
    provider_source: 'tastytrade',
    iv_source: 'polygon_derived',
    hv_source: 'polygon_derived',
    iv_rank_source: 'tastytrade',
    iv_rank_ready: false,
    iv_observation_count: 2,
    freshness: 'fresh',
    is_stale: false,
  }] });
  const res = responseRecorder();

  await sendMetrics({ query: { symbols: 'DERIVED1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.DERIVED1.hv_source, 'polygon_derived');
  assert.equal(res.body.DERIVED1.iv_rank_source, 'tastytrade');
  assert.equal(res.body.DERIVED1.iv_rank_ready, false);
  assert.match(queries[0].sql, /FROM volatility_history/);
  assert.equal(queries[0].params[2], true);
  assert.equal(refreshCalls.length, 0);
});

test('stale mixed metrics enqueue the executable metrics provider sentinel', async () => {
  queryResults.push({ rows: [{
    symbol: 'STALEMETRIC1', date: '2026-07-01', source: 'hybrid',
    freshness: 'stale', is_stale: true,
  }] });
  const res = responseRecorder();

  await sendMetrics({ query: { symbols: 'STALEMETRIC1' } }, res);

  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].provider, 'metrics_provider');
});
