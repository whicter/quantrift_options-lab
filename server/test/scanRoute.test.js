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
    price_close: 100,
    option_contracts: [
      { expiry: '2026-08-21', dte: 36, strike: 110, right: 'C', bid: 2, ask: 2.1, delta: 0.2, openInterest: 500, volume: 50 },
      { expiry: '2026-08-21', dte: 36, strike: 115, right: 'C', bid: 0.8, ask: 0.9, delta: 0.1, openInterest: 500, volume: 50 },
    ],
    freshness: 'fresh',
    is_stale: false,
  }] });
  const res = responseRecorder();

  await sendScan({ query: { scanKey: 'quote-test' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].quote_source, 'ib_internal');
  assert.equal(res.body[0].quote_freshness, 'stale');
  assert.equal(res.body[0].concrete_setup.strategy, 'Bear Call Spread');
  assert.equal(res.body[0].concrete_setup.expected_move.status, 'unavailable');
  assert.equal(res.body[0].concrete_setup.expected_move.input_snapshot_ts, '2026-07-15T20:00:00.000Z');
  assert.equal(res.body[0].concrete_setup.pop.status, 'unavailable');
  assert.equal(res.body[0].concrete_setup.pop.input_snapshot_ts, '2026-07-15T20:00:00.000Z');
  assert.equal('option_contracts' in res.body[0], false);
  assert.deepEqual(Object.keys(res.body[0].concrete_setup.legs[0]).sort(), [
    'action', 'ask', 'bid', 'delta', 'dte', 'expiry', 'right', 'strike',
  ]);
  assert.match(queries[0].sql, /latest_quote_chain AS/);
  assert.match(queries[0].sql, /latest_community_batch AS/);
  assert.match(queries[0].sql, /latest_rows\.source AS source/);
  assert.match(queries[0].sql, /latest_rows\.snapshot_ts AS snapshot_ts/);
  assert.match(queries[0].sql, /NOW\(\) - latest_rows\.snapshot_ts/);
  assert.doesNotMatch(queries[0].sql, /iv_hv_diff, earnings_date, source,/);
  assert.match(queries[0].sql, /community_mention_count/);
  assert.match(queries[0].sql, /COALESCE\(mention_count, 0\)/);
  assert.match(queries[0].sql, /latest_community_batch community_batch ON TRUE/);
  assert.match(queries[0].sql, /quoted\.bid IS NOT NULL/);
  assert.match(queries[0].sql, /'iv', c\.iv/);
  assert.match(queries[0].sql, /America\/New_York/);
  assert.match(queries[0].sql, /underlying_dollar_volume/);
  assert.match(queries[0].sql, /market_cap >= \$28/);
  assert.doesNotMatch(queries[0].sql, /expiry::date - CURRENT_DATE/);
  assert.equal(queries[0].params[26], 1440);
  assert.equal(queries[0].params[37], 90);
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
