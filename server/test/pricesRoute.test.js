const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const pricesPath = require.resolve('../src/routes/prices');

const queryResults = [];
const queries = [];
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    assert.ok(queryResults.length > 0, 'unexpected database query');
    return queryResults.shift();
  },
};

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[pricesPath];
const { sendPrices } = require(pricesPath);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => {
  queryResults.length = 0;
  queries.length = 0;
});

test('daily prices remain the default API contract', async () => {
  queryResults.push({ rows: [{
    symbol: 'AAPL', date: '2026-07-14', open: 1, high: 2, low: 0.5,
    close: 1.5, volume: 100, source: 'polygon_licensed', created_at: new Date(),
  }] });
  const res = responseRecorder();

  await sendPrices({ params: { symbol: 'aapl' }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.interval, 'day');
  assert.equal(res.body.prices[0].date, '2026-07-14');
  assert.match(queries[0].sql, /FROM price_history\b/);
});

test('30m interval reads the dedicated table and exposes timestamp fields', async () => {
  const barTs = new Date('2026-07-14T13:30:00Z');
  queryResults.push({ rows: [{
    symbol: 'AAPL', bar_ts: barTs, open: 1, high: 2, low: 0.5,
    close: 1.5, volume: 50, vwap: 1.4, trade_count: 10,
    source: 'polygon_licensed', created_at: new Date(),
  }] });
  const res = responseRecorder();

  await sendPrices({ params: { symbol: 'AAPL' }, query: { interval: '30m', limit: '100' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.interval, '30m');
  assert.equal(res.body.prices[0].timestamp, barTs);
  assert.equal(res.body.prices[0].vwap, 1.4);
  assert.match(queries[0].sql, /FROM price_history_30m\b/);
});

test('invalid interval is rejected before querying', async () => {
  const res = responseRecorder();
  await sendPrices({ params: { symbol: 'AAPL' }, query: { interval: 'hour' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid interval');
  assert.equal(queries.length, 0);
});
