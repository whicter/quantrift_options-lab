const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } };

const { deriveMomentum, deriveMarketRegime, buildBreadth, percentile } = require('../src/routes/market');
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

test('percentile interpolates and handles thin/empty inputs', () => {
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentile([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(percentile([42], 0.5), 42);
  assert.equal(percentile([], 0.5), null);
});

test('options-native breadth aggregates trend, gamma, IV rank and PCR', () => {
  const trendRows = [
    { latest: 110, ma50: 100, ma200: 90, bars: 250 },   // above both
    { latest: 95, ma50: 100, ma200: 90, bars: 250 },    // below ma50, above ma200
    { latest: 80, ma50: 100, ma200: 90, bars: 40 },     // too few bars -> excluded from both
  ];
  const gammaRows = [
    { gamma_regime: 'positive', pcr_oi: 0.8 },
    { gamma_regime: 'negative', pcr_oi: 1.2 },
    { gamma_regime: null, pcr_oi: null },               // no gamma, no pcr
  ];
  const ivRanks = [30, 60, 90, null];

  const b = buildBreadth(trendRows, gammaRows, ivRanks);
  assert.equal(b.trend.counted_ma50, 2);                // the 40-bar row excluded
  assert.equal(b.trend.above_ma50_pct, 50);             // 1 of 2
  assert.equal(b.trend.counted_ma200, 2);
  assert.equal(b.trend.above_ma200_pct, 100);           // both above ma200
  assert.equal(b.gamma.counted, 2);                     // null regime excluded
  assert.equal(b.gamma.positive_pct, 50);
  assert.equal(b.gamma.negative_pct, 50);
  assert.equal(b.iv_rank.counted, 3);                   // null excluded
  assert.equal(b.iv_rank.median, 60);
  assert.equal(b.iv_rank.elevated_pct, 66.7);           // 60 and 90 >= 50, of 3
  assert.equal(b.pcr.counted, 2);
  assert.equal(b.pcr.median, 1);                        // (0.8 + 1.2)/2
});

test('breadth percentages disclose zero counts as null, never a fake 0', () => {
  const b = buildBreadth([], [], []);
  assert.equal(b.trend.above_ma50_pct, null);
  assert.equal(b.gamma.positive_pct, null);
  assert.equal(b.iv_rank.median, null);
  assert.equal(b.pcr.median, null);
  assert.equal(b.gamma.counted, 0);
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
