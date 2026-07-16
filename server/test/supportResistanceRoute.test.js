const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/supportResistance');
const queryResults = [];
const pool = { async query() { return queryResults.shift(); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[routePath];
const { deriveCompositeMomentum, deriveFocusScore, deriveSupportResistance, sendSupportResistance } = require(routePath);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function bars(count = 60) {
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 3) * 5;
    return {
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      high: 100 + index * 0.2 + wave + 1,
      low: 100 + index * 0.2 + wave - 1,
      close: 100 + index * 0.2 + wave,
      volume: 1000 + index * 10,
      source: 'polygon',
      created_at: new Date(),
    };
  });
}

function validDailyBars(count = 90) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + index * 86400000),
    high: 100 + index * 0.25 + 1,
    low: 100 + index * 0.25 - 1,
    close: 100 + index * 0.25,
    volume: 1000 + index * 10,
    source: 'polygon_licensed',
    created_at: new Date(),
  }));
}

function intradayBars(marketDate, count = 30, rising = true) {
  const end = new Date(`${marketDate}T19:30:00Z`).getTime();
  return Array.from({ length: count }, (_, index) => ({
    bar_ts: new Date(end - (count - 1 - index) * 30 * 60000),
    close: 120 + (rising ? index : -index) * 0.1,
    source: 'polygon_licensed',
  }));
}

test('derives clustered support/resistance from real pivots', () => {
  const input = bars();
  input[input.length - 1] = { ...input[input.length - 1], high: 106, low: 104, close: 105 };
  const result = deriveSupportResistance(input);
  assert.ok(result.supports.length > 0);
  assert.ok(result.resistances.length > 0);
  assert.ok(result.supports.every(level => level.price < result.spot));
  assert.ok(result.resistances.every(level => level.price > result.spot));
});

test('focus score discloses readiness and components', () => {
  assert.equal(deriveFocusScore(bars(10)).ready, false);
  const focus = deriveFocusScore(deriveSupportResistance(bars()).bars);
  assert.equal(focus.ready, true);
  assert.ok(focus.score >= 0 && focus.score <= 100);
  assert.ok(Number.isFinite(focus.components.rsi14));
});

test('composite momentum weights fresh 30m, daily and weekly real bars', () => {
  const daily = validDailyBars();
  const marketDate = daily.at(-1).date.toISOString().slice(0, 10);
  const result = deriveCompositeMomentum(daily, intradayBars(marketDate));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.weights, { '30m': 0.30, '1d': 0.40, '1w': 0.30 });
  assert.ok(result.score > 50);
  assert.ok(result.timeframes['1w'].observations >= 12);
});

test('composite momentum marks lagging intraday bars stale and discloses dates', () => {
  const daily = validDailyBars();
  const result = deriveCompositeMomentum(daily, intradayBars('2026-03-01'));
  assert.equal(result.status, 'stale');
  assert.equal(result.reason, 'intraday_market_date_lags_daily');
  assert.notEqual(result.latest_daily_date, result.latest_intraday_market_date);
});

test('composite momentum fails closed when a timeframe is incomplete', () => {
  assert.equal(deriveCompositeMomentum(validDailyBars(20), intradayBars('2026-01-20')).reason, 'requires_60_daily_bars');
  assert.equal(deriveCompositeMomentum(validDailyBars(), intradayBars('2026-03-31', 10)).reason, 'requires_26_regular_session_30m_bars');
});

test('route returns missing instead of fabricated levels for short history', async () => {
  queryResults.push({ rows: bars(4) }, { rows: [] });
  const res = responseRecorder();
  await sendSupportResistance({ params: { symbol: 'TEST' } }, res);
  assert.equal(res.body.status, 'missing');
  assert.deepEqual(res.body.support, []);
  assert.deepEqual(res.body.resistance, []);
});

test('route serializes PostgreSQL Date values as ISO dates', async () => {
  const input = bars();
  input.forEach((bar, index) => { bar.date = new Date(Date.UTC(2026, 0, index + 1)); });
  queryResults.push({ rows: input }, { rows: [] });
  const res = responseRecorder();
  await sendSupportResistance({ params: { symbol: 'TEST' } }, res);
  assert.match(res.body.latest_date, /^2026-\d{2}-\d{2}$/);
});
