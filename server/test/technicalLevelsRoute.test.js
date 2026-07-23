const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/technicalLevels');
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
delete require.cache[routePath];

const {
  calculateAtr,
  chooseAnchoredVwapAnchor,
  clusterConfluence,
  deriveAnchoredVwap,
  deriveMovingAverages,
  deriveOptionStructure,
  deriveVolumeProfile,
  deriveWeeklyStructure,
  sendTechnicalLevels,
} = require(routePath);

function dailyBars(count = 250) {
  const start = Date.UTC(2025, 0, 1);
  const dates = [];
  for (let offset = 0; dates.length < count; offset += 1) {
    const date = new Date(start + offset * 86400000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date);
  }
  return dates.map((date, index) => {
    const close = 100 + index * 0.5;
    return {
      date,
      open: close - 0.5,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + index,
      source: 'polygon_licensed',
      created_at: new Date(date.getTime() + 3600000),
    };
  });
}

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

test('derives 50/100/200 DMA and ATR from real daily bars', () => {
  const bars = dailyBars();
  const averages = deriveMovingAverages(bars);
  assert.equal(averages.dma50, 212.25);
  assert.equal(averages.dma100, 199.75);
  assert.equal(averages.dma200, 174.75);
  assert.equal(calculateAtr(bars), 4);
});

test('volume profile uses 30m typical-price bins and identifies POC', () => {
  const rows = [
    { bar_ts: '2026-07-20T14:00:00Z', high: 101, low: 99, close: 100, volume: 1000 },
    { bar_ts: '2026-07-20T14:30:00Z', high: 101.2, low: 99.8, close: 100.1, volume: 2000 },
    { bar_ts: '2026-07-20T15:00:00Z', high: 103, low: 101, close: 102, volume: 500 },
  ];
  const profile = deriveVolumeProfile(rows, 100);
  assert.equal(profile.status, 'ready');
  assert.equal(profile.approximation, '30m_bar_typical_price');
  assert.equal(profile.poc.price, 100.5);
  assert.equal(profile.poc.volume, 2000);
  assert.equal(profile.bar_count, 3);
});

test('high-volume swing low becomes the anchored VWAP origin', () => {
  const bars = dailyBars(90);
  bars[60] = {
    ...bars[60],
    low: 80,
    high: 90,
    close: 88,
    volume: 100000,
  };
  bars[59] = { ...bars[59], low: 95 };
  bars[61] = { ...bars[61], low: 96 };
  const anchor = chooseAnchoredVwapAnchor(bars);
  assert.equal(anchor.date, bars[60].date.toISOString().slice(0, 10));
  assert.equal(anchor.type, 'high_volume_swing_low');

  const intraday = [
    { bar_ts: `${anchor.date}T14:00:00Z`, high: 90, low: 88, close: 89, volume: 100 },
    { bar_ts: `${anchor.date}T14:30:00Z`, high: 92, low: 90, close: 91, volume: 300 },
  ];
  const anchored = deriveAnchoredVwap(intraday, anchor);
  assert.equal(anchored.status, 'ready');
  assert.equal(anchored.value, 90.5);
});

test('weekly aggregation returns moving averages and confirmed pivots', () => {
  const bars = dailyBars();
  bars[100] = { ...bars[100], low: 70 };
  const weekly = deriveWeeklyStructure(bars);
  assert.equal(weekly.status, 'ready');
  assert.ok(weekly.bar_count >= 40);
  assert.ok(Number.isFinite(weekly.moving_averages.ma40));
  assert.ok(Array.isArray(weekly.supports));
});

test('confluence clusters support and resistance separately around spot', () => {
  const items = [
    { type: 'volume_poc', price: 99, weight: 30, side: 'support' },
    { type: 'dma100', price: 98, weight: 16, side: 'support' },
    { type: 'anchored_vwap', price: 101, weight: 22, side: 'resistance' },
    { type: 'weekly_ma4', price: 102, weight: 14, side: 'resistance' },
  ];
  const result = clusterConfluence(items, 100, 4);
  assert.equal(result.supports.length, 1);
  assert.equal(result.resistances.length, 1);
  assert.equal(result.supports[0].evidence_count, 2);
  assert.equal(result.resistances[0].evidence_count, 2);
  assert.ok(result.supports[0].high <= 100);
  assert.ok(result.resistances[0].low > 100);
});

test('option structure distinguishes OI walls from GEX walls and fails closed', () => {
  const missing = deriveOptionStructure(100, null, []);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.gex.status, 'missing');
  assert.equal(missing.oi.status, 'missing');

  const ready = deriveOptionStructure(100, {
    snapshot_ts: new Date().toISOString(),
    source: 'polygon_licensed',
    global_gex: 123,
    gamma_regime: 'positive',
    call_wall: 110,
    put_wall: 95,
  }, [
    { strike: 95, option_right: 'P', open_interest: 500, snapshot_ts: new Date().toISOString(), source: 'polygon_licensed' },
    { strike: 105, option_right: 'C', open_interest: 700, snapshot_ts: new Date().toISOString(), source: 'polygon_licensed' },
  ]);
  assert.equal(ready.gex.call_wall, 110);
  assert.equal(ready.oi.call_wall.price, 105);
  assert.equal(ready.oi.put_wall.price, 95);
});

test('API returns technical levels while keeping missing options explicit', async () => {
  const daily = dailyBars();
  const intraday = Array.from({ length: 40 }, (_, index) => ({
    bar_ts: new Date(Date.UTC(2026, 6, 20, 14, index * 30)),
    open: index < 30 ? 220 : 230,
    high: index < 30 ? 221 : 231,
    low: index < 30 ? 219 : 229,
    close: index < 30 ? 220 : 230,
    volume: index < 30 ? 1000 : 600,
    source: 'polygon_licensed',
  }));
  queryResults.push(
    { rows: daily },
    { rows: intraday },
    { rows: [] },
    { rows: [] },
  );
  const res = responseRecorder();
  await sendTechnicalLevels({ params: { symbol: 'TEST' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.options.status, 'missing');
  assert.ok(res.body.supports.length > 0);
  assert.ok(res.body.resistances.length > 0);
  assert.match(queries[1].sql, /America\/New_York/);
  assert.match(queries[3].sql, /open_interest/);
});

test('API rejects malformed symbols before querying', async () => {
  const res = responseRecorder();
  await sendTechnicalLevels({ params: { symbol: "GOOG' OR 1=1" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queries.length, 0);
});

test('API preserves the missing-data contract for SPY and GOOG', async () => {
  for (const symbol of ['SPY', 'GOOG']) {
    queryResults.push({ rows: [] }, { rows: [] });
    const res = responseRecorder();
    await sendTechnicalLevels({ params: { symbol } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.symbol, symbol);
    assert.equal(res.body.status, 'missing');
    assert.equal(res.body.reason, 'no_daily_price_history');
    assert.deepEqual(res.body.supports, []);
    assert.deepEqual(res.body.resistances, []);
  }
});
