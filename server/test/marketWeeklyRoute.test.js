const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } };

const { deriveMomentum, deriveMarketRegime } = require('../src/routes/market');
const { deriveWeekly } = require('../src/routes/weekly');

function dailyBars(count = 60) {
  const start = Date.UTC(2026, 4, 17);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + index * 86400000),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
    source: 'polygon_licensed',
  }));
}

function intradayBars({ breakout = false } = {}) {
  return Array.from({ length: 21 }, (_, index) => ({
    bar_ts: new Date(Date.UTC(2026, 6, 15, 13 + Math.floor(index / 2), index % 2 ? 30 : 0)),
    high: index === 20 && breakout ? 110 : 101,
    low: 99,
    close: index === 20 && breakout ? 109 : 100,
    volume: index === 20 && breakout ? 2500 : 1000,
  }));
}

test('30m breakout requires both prior-range break and volume confirmation', () => {
  const confirmed = deriveMomentum(dailyBars(), intradayBars({ breakout: true }));
  assert.equal(confirmed.breakout_30m.direction, 'up');
  assert.equal(confirmed.breakout_30m.confirmed, true);

  const quiet = deriveMomentum(dailyBars(), intradayBars());
  assert.equal(quiet.breakout_30m.direction, 'none');
  assert.equal(quiet.breakout_30m.confirmed, false);
});

test('market regime combines momentum with gamma and IV risk penalties', () => {
  const regime = deriveMarketRegime([
    { momentum: { status: 'ready', score: 80 }, gex: { gamma_regime: 'negative' }, iv_rank: 80 },
    { momentum: { status: 'ready', score: 70 }, gex: { gamma_regime: 'positive' }, iv_rank: 40 },
  ]);
  assert.equal(regime.status, 'ready');
  assert.equal(regime.score, 67);
  assert.equal(regime.label, 'Risk-on');
});

test('weekly product uses real GEX, max pain and OI delta without synthetic history', () => {
  const prices = dailyBars(10);
  const gex = [{
    market_date: new Date(Date.UTC(2026, 6, 15)), snapshot_ts: new Date(), source: 'polygon_licensed',
    global_gex: 2000000, gamma_regime: 'positive', gamma_flip: 106, call_wall: 112,
    put_wall: 104, max_pain: 108, pcr_oi: 0.9, confidence: 'high',
    strikes: [{ strike: 100, net_gex: -10 }, { strike: 104, net_gex: -20 }, { strike: 112, net_gex: 30 }, { strike: 116, net_gex: 10 }],
  }];
  const oi = [{ market_date: new Date(Date.UTC(2026, 6, 15)), oi_delta: 1250, unusual_count: 2, confirmed_count: 10 }];
  const result = deriveWeekly('TEST', prices, gex, oi, { supports: [{ price: 103 }], resistances: [{ price: 116 }] });
  assert.equal(result.status, 'ready');
  assert.equal(result.gamma.history.length, 1);
  assert.equal(result.gamma.history[0].gex_metadata.data_state.status, 'historical');
  assert.equal(result.pinning.max_pain, 108);
  assert.equal(result.positioning.total_oi_delta, 1250);
  assert.equal(result.scenarios.up.trigger, 112);
  assert.equal(result.scenarios.up.target, 116);
});

test('weekly product fails closed when price history is too short', () => {
  const result = deriveWeekly('TEST', dailyBars(5), [], [], null);
  assert.deepEqual(result, { symbol: 'TEST', status: 'missing', reason: 'requires_6_daily_bars' });
});

test('weekly scenarios reject walls on the wrong side of spot', () => {
  const prices = dailyBars(10);
  const spot = prices.at(-1).close;
  const result = deriveWeekly('TEST', prices, [{
    market_date: new Date(Date.UTC(2026, 6, 15)), snapshot_ts: new Date(), source: 'polygon_licensed',
    gamma_regime: 'positive', call_wall: spot - 5, put_wall: spot + 5, max_pain: spot,
    strikes: [],
  }], [], { supports: [{ price: spot - 10 }], resistances: [{ price: spot + 10 }] });
  assert.equal(result.scenarios.up.trigger, spot + 10);
  assert.equal(result.scenarios.up.evidence, 'price resistance');
  assert.equal(result.scenarios.down.trigger, spot - 10);
  assert.equal(result.scenarios.down.evidence, 'price support');
});
