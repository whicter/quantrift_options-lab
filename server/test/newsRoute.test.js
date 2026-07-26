const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/news');
const queryResults = [];
const queries = [];
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    assert.ok(queryResults.length, 'unexpected database query');
    return queryResults.shift();
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[routePath];
const { sendNews } = require(routePath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => { queryResults.length = 0; queries.length = 0; });

test('rejects an invalid symbol', async () => {
  const res = responseRecorder();
  await sendNews({ params: { symbol: '../etc' }, query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('a quiet symbol with no recent headlines is a normal empty result, not an error', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendNews({ params: { symbol: 'QUIET1' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 0);
  assert.equal(res.body.latest_published_at, null);
  assert.deepEqual(res.body.items, []);
});

test('returns real headline rows ordered newest-first with symbol and window echoed back', async () => {
  const rows = [
    { published_at: '2026-07-26T18:00:00.000Z', provider_code: 'DJ-N', article_id: 'a2', headline: 'Newer', source: 'ib_internal' },
    { published_at: '2026-07-26T16:01:00.000Z', provider_code: 'DJ-N', article_id: 'a1', headline: 'Older', source: 'ib_internal' },
  ];
  queryResults.push({ rows });
  const res = responseRecorder();
  await sendNews({ params: { symbol: 'aapl' }, query: { limit: '10', hours: '24' } }, res);
  assert.equal(res.body.symbol, 'AAPL');
  assert.equal(res.body.window_hours, 24);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.latest_published_at, rows[0].published_at);
  assert.deepEqual(res.body.items, rows);
  assert.match(queries[0].sql, /FROM news_articles/);
  assert.deepEqual(queries[0].params, ['AAPL', 24, 10]);
});

test('a missing news_articles table degrades to an empty payload instead of a 500', async () => {
  const err = new Error('relation "news_articles" does not exist');
  err.code = '42P01';
  queryResults.push(Promise.reject(err));
  const res = responseRecorder();
  await sendNews({ params: { symbol: 'AAPL' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.items, []);
});
