const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const cachePath = require.resolve('../src/lib/cache');
const routePath = require.resolve('../src/routes/scannerCandidates');

const queryResults = [];
const queries = [];
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
// Bypass the in-process TTL cache so each test observes the mocked query path.
require.cache[cachePath] = {
  id: cachePath,
  filename: cachePath,
  loaded: true,
  exports: {
    cacheKey: (...args) => JSON.stringify(args),
    getCache: () => null,
    setCache: (_key, value) => value,
  },
};

delete require.cache[routePath];
const { sendCandidates } = require(routePath);

function recorder() {
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

test('missing batch returns empty candidates and enqueues a materialization job', async () => {
  queryResults.push({ rows: [] });
  const res = recorder();
  await sendCandidates({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.batch, null);
  assert.deepEqual(res.body.candidates, []);
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].jobType, 'scanner_candidate_materialize');
  assert.equal(refreshCalls[0].symbol, '__SCAN__');
});

test('fresh completed batch returns candidates without enqueuing a refresh', async () => {
  queryResults.push({ rows: [{
    id: 55, scan_key: 'watchlist_v1', algorithm_version: 'candidate-v1',
    source_snapshot_cutoff: '2026-07-17T18:00:00.000Z',
    universe_count: 80, candidate_count: 3,
    started_at: '2026-07-17T18:01:00.000Z', completed_at: '2026-07-17T18:02:00.000Z',
    age_seconds: 120,
  }] });
  queryResults.push({ rows: [
    { symbol: 'AAA', strategy: 'Bear Call Spread', strategy_family: 'credit_vertical', expiry: '2026-08-29', dte: 45, spot: '100.0000', score: '71.00', rank: 1, legs_json: [{ action: 'SELL', strike: 110, right: 'C' }], economics_json: { credit: 1 }, signals_json: { score: 71 }, freshness_json: { input_snapshot_ts: '2026-07-17T17:55:00.000Z' } },
    { symbol: 'BBB', strategy: 'Bull Put Spread', strategy_family: 'credit_vertical', expiry: '2026-08-29', dte: 45, spot: '50.0000', score: '64.00', rank: 2, legs_json: [], economics_json: {}, signals_json: {}, freshness_json: {} },
  ] });

  const res = recorder();
  await sendCandidates({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.batch.id, 55);
  assert.equal(res.body.batch.is_stale, false);
  assert.equal(res.body.batch.refresh_status, 'none');
  assert.equal(res.body.candidates.length, 2);
  assert.equal(res.body.candidates[0].symbol, 'AAA');
  assert.equal(res.body.candidates[0].spot, 100);
  assert.equal(res.body.candidates[0].score, 71);
  assert.equal(refreshCalls.length, 0);
});

test('stale batch still returns candidates and enqueues a refresh', async () => {
  queryResults.push({ rows: [{
    id: 56, scan_key: 'watchlist_v1', algorithm_version: 'candidate-v1',
    source_snapshot_cutoff: '2026-07-17T10:00:00.000Z',
    universe_count: 80, candidate_count: 1,
    started_at: '2026-07-17T10:01:00.000Z', completed_at: '2026-07-17T10:02:00.000Z',
    age_seconds: 9000,
  }] });
  queryResults.push({ rows: [
    { symbol: 'AAA', strategy: 'Iron Condor', strategy_family: 'iron', expiry: '2026-08-29', dte: 45, spot: '100', score: '60', rank: 1, legs_json: [], economics_json: {}, signals_json: {}, freshness_json: {} },
  ] });

  const res = recorder();
  await sendCandidates({ query: {} }, res);

  assert.equal(res.body.batch.is_stale, true);
  assert.equal(res.body.candidates.length, 1);
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].requestParams.reason, 'stale_candidate_batch');
});

test('strategy and symbol filters are passed through to the query', async () => {
  queryResults.push({ rows: [{
    id: 57, scan_key: 'watchlist_v1', algorithm_version: 'candidate-v1',
    source_snapshot_cutoff: null, universe_count: 5, candidate_count: 0,
    started_at: '2026-07-17T18:01:00.000Z', completed_at: '2026-07-17T18:02:00.000Z',
    age_seconds: 60,
  }] });
  queryResults.push({ rows: [] });

  const res = recorder();
  await sendCandidates({ query: { strategy: 'Iron Condor', symbol: 'aaa', minScore: '55', limit: '10' } }, res);

  const candidateQuery = queries[1];
  assert.match(candidateQuery.sql, /FROM scanner_candidate_snapshots/);
  assert.equal(candidateQuery.params[1], 'Iron Condor');
  assert.equal(candidateQuery.params[3], 'AAA');
  assert.equal(candidateQuery.params[4], 55);
  assert.equal(candidateQuery.params[5], 10);
});

test('invalid limit yields a 400', async () => {
  const res = recorder();
  await sendCandidates({ query: { limit: 'abc' } }, res);
  assert.equal(res.statusCode, 400);
});

test('missing tables degrade to an empty payload', async () => {
  queryResults.push(Promise.reject(Object.assign(new Error('relation does not exist'), { code: '42P01' })));
  const res = recorder();
  await sendCandidates({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { batch: null, refresh_status: 'none', candidates: [] });
});
