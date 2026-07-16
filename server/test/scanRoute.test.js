const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const scanPath = require.resolve('../src/routes/scan');

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
delete require.cache[scanPath];
const { sendScan } = require(scanPath);

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

test('scanner selects the latest usable quote snapshot separately from positioning', async () => {
  queryResults.push({ rows: [{
    symbol: 'QUOTE1',
    iv_rank: 60,
    quote_source: 'ib_internal',
    quote_snapshot_ts: '2026-07-15T20:00:00.000Z',
    quote_freshness: 'stale',
    option_contracts: [{ expiry: '2026-08-21', bid: 1, ask: 1.1 }],
    freshness: 'fresh',
    is_stale: false,
  }] });
  const res = responseRecorder();

  await sendScan({ query: { scanKey: 'quote-test' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].quote_source, 'ib_internal');
  assert.equal(res.body[0].quote_freshness, 'stale');
  assert.match(queries[0].sql, /latest_quote_chain AS/);
  assert.match(queries[0].sql, /quoted\.bid IS NOT NULL/);
  assert.match(queries[0].sql, /America\/New_York/);
  assert.match(queries[0].sql, /underlying_dollar_volume/);
  assert.match(queries[0].sql, /market_cap >= \$28/);
  assert.doesNotMatch(queries[0].sql, /expiry::date - CURRENT_DATE/);
  assert.equal(queries[0].params[26], 1440);
  assert.equal(refreshCalls.length, 0);
});

test('universe filters are bound without provider calls', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendScan({ query: {
    marketCapMin: '1000000000', priceMin: '10', minDollarVolume: '5000000',
    optionable: 'true', sector: 'Technology', earningsMode: 'exclude', earningsDays: '14',
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(queries[0].params[27], 1000000000);
  assert.equal(queries[0].params[29], 10);
  assert.equal(queries[0].params[32], 5000000);
  assert.equal(queries[0].params[33], 'true');
  assert.equal(queries[0].params[34], 'Technology');
  assert.equal(queries[0].params[35], 'exclude');
  assert.equal(refreshCalls[0].jobType, 'scanner_materialize');
});
