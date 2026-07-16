const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/volumeProfile');
const queryResults = [];
const queries = [];
const pool = { async query(sql, values) { queries.push({ sql, values }); return queryResults.shift(); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[routePath];
const { deriveVolumeProfile, sendVolumeProfile } = require(routePath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function bars() {
  return [
    { high: 102, low: 100, close: 101, volume: 100 },
    { high: 103, low: 101, close: 102, volume: 300 },
    { high: 104, low: 102, close: 103, volume: 200 },
  ];
}

test('volume profile aggregates real bar volume into bounded price nodes', () => {
  const profile = deriveVolumeProfile(bars(), 4);
  assert.equal(profile.status, 'ready');
  assert.equal(profile.bar_count, 3);
  assert.equal(profile.total_volume, 600);
  assert.equal(profile.nodes.reduce((sum, node) => sum + node.volume, 0), 600);
  assert.equal(profile.high_volume_nodes[0].volume, 300);
  assert.equal(profile.bin_count, 4);
});

test('volume profile fails closed for missing volume bars', () => {
  const profile = deriveVolumeProfile([{ high: 100, low: 99, close: 99.5, volume: 0 }]);
  assert.equal(profile.status, 'missing');
  assert.equal(profile.reason, 'requires_2_30m_bars_with_volume');
});

test('route uses 30m history with bounded days and bins', async () => {
  queryResults.push({ rows: bars() });
  const res = responseRecorder();
  await sendVolumeProfile({ params: { symbol: 'aapl' }, query: { interval: '30m', days: '20', bins: '40' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.symbol, 'AAPL');
  assert.equal(res.body.days, 20);
  assert.match(queries.at(-1).sql, /FROM price_history_30m/);
  assert.deepEqual(queries.at(-1).values, ['AAPL', 20]);
});

test('route rejects unsupported profile parameters', async () => {
  const res = responseRecorder();
  await sendVolumeProfile({ params: { symbol: 'AAPL' }, query: { interval: 'day' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid interval');
});
