const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } };

const {
  deriveMomentum, deriveMarketRegime, buildBreadth, percentile,
  classifyState, buildStateMatrix, STATE_META,
  buildSectorRotation, SECTOR_ETFS, buildBriefing,
} = require('../src/routes/market');
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

// ---- R1.1 Symbol State Matrix ----
const TH = { ivrHigh: 80, rvolSpike: 2.5, rvolBreakout: 1.5, extHigh: 3, momBand: 1.5 };
const base = { close: 100, ma50: 95, ma200: 90, ret5: 1, ret20: 8, ext50: 5.3, hi20: 101, rvol: 1.0, ivRank: 40, gammaRegime: 'positive' };

test('state: insufficient history yields the insufficient state', () => {
  assert.equal(classifyState({ close: 100, ma50: null, ma200: null }, TH).state, 'insufficient');
});

test('state: S0 high-vol gate wins over trend (IV rank or RVol spike)', () => {
  assert.equal(classifyState({ ...base, ivRank: 85 }, TH).state, 'S0');
  assert.equal(classifyState({ ...base, ivRank: 40, rvol: 3.0 }, TH).state, 'S0');
});

test('state: S3 breakout fires on a fresh volume break of the prior 20-day high', () => {
  const r = classifyState({ ...base, close: 105, hi20: 101, rvol: 1.8 }, TH);
  assert.equal(r.state, 'S3');
  assert.ok(r.reasons.some(x => x.includes('突破')));
});

test('state: S1 strong uptrend vs S2 pullback within an uptrend', () => {
  // clean uptrend, no breakout (rvol below breakout threshold), not pulling back
  assert.equal(classifyState({ ...base, close: 100, hi20: 110, rvol: 1.0, ret5: 1.5 }, TH).state, 'S1');
  // a tiny down tick (-0.5%) is noise, NOT a pullback -> stays S1
  assert.equal(classifyState({ ...base, close: 100, ma50: 95, ma200: 90, ret5: -0.5, hi20: 110 }, TH).state, 'S1');
  // uptrend structure but price dipped below MA50
  assert.equal(classifyState({ ...base, close: 94, ma50: 95, ma200: 90, hi20: 110 }, TH).state, 'S2');
  // uptrend structure but a meaningful short-term pullback (<= -1.5%)
  assert.equal(classifyState({ ...base, close: 100, ma50: 95, ma200: 90, ret5: -2.0, hi20: 110 }, TH).state, 'S2');
});

test('state: S5 downtrend vs S4 stabilizing within a downtrend', () => {
  assert.equal(classifyState({ close: 80, ma50: 85, ma200: 90, ret5: -2, ret20: -12, hi20: 88, rvol: 1.0, ivRank: 40 }, TH).state, 'S5');
  // downtrend structure but reclaiming MA50
  assert.equal(classifyState({ close: 86, ma50: 85, ma200: 90, ret5: -1, ret20: -8, hi20: 88, rvol: 1.0, ivRank: 40 }, TH).state, 'S4');
  // downtrend structure but a meaningful short-term rebound (>= +1.5%)
  assert.equal(classifyState({ close: 84, ma50: 85, ma200: 90, ret5: 2.0, ret20: -8, hi20: 88, rvol: 1.0, ivRank: 40 }, TH).state, 'S4');
  // a tiny +0.5% bounce is noise -> stays S5
  assert.equal(classifyState({ close: 80, ma50: 85, ma200: 90, ret5: 0.5, ret20: -12, hi20: 88, rvol: 1.0, ivRank: 40 }, TH).state, 'S5');
});

test('state: S6 neutral fallback when MAs are interleaved', () => {
  // close>ma200 but ma50<ma200 -> neither clean up nor down structure
  assert.equal(classifyState({ close: 92, ma50: 88, ma200: 90, ret5: 0.2, ret20: 1, hi20: 95, rvol: 1.0, ivRank: 40 }, TH).state, 'S6');
});

test('buildStateMatrix distributes symbols and zero-fills every state bucket', () => {
  const rows = [
    { symbol: 'UP', close: 100, ma50: 95, ma200: 90, ret5: 1, ret20: 8, ext50: 5.3, hi20: 110, rvol: 1, ivRank: 40 },
    { symbol: 'DN', close: 80, ma50: 85, ma200: 90, ret5: -2, ret20: -12, ext50: -5.9, hi20: 88, rvol: 1, ivRank: 40 },
    { symbol: 'VOL', close: 100, ma50: 95, ma200: 90, ret5: 1, ret20: 8, ext50: 5.3, hi20: 110, rvol: 1, ivRank: 88 },
    { symbol: 'THIN', close: 50, ma50: null, ma200: null },
  ];
  const { distribution, symbols } = buildStateMatrix(rows, TH);
  assert.equal(symbols.find(s => s.symbol === 'UP').state, 'S1');
  assert.equal(symbols.find(s => s.symbol === 'DN').state, 'S5');
  assert.equal(symbols.find(s => s.symbol === 'VOL').state, 'S0');
  assert.equal(symbols.find(s => s.symbol === 'THIN').state, 'insufficient');
  assert.equal(distribution.S1, 1);
  assert.equal(distribution.S5, 1);
  assert.equal(distribution.S0, 1);
  assert.equal(distribution.insufficient, 1);
  assert.equal(distribution.S3, 0); // present and zero, not missing
  // every state in the metadata is a key in the distribution
  for (const meta of STATE_META) assert.ok(meta.id in distribution);
});

test('state labels describe state, never prescribe entry/stop/target', () => {
  const forbidden = ['入场', '止损', '目标价', '买入', '卖出', 'buy', 'sell'];
  for (const meta of STATE_META) {
    for (const word of forbidden) assert.ok(!meta.label.includes(word), `${meta.label} must not contain ${word}`);
  }
});

// ---- R1.3 Sector Rotation (RRG-lite) ----
test('sector rotation: quadrants from relative strength and its momentum vs the benchmark', () => {
  const rows = [
    { symbol: 'SPY', close: 100, ma50: 95, ret5: 1.0, ret20: 4.0 },
    // rs = 8-4 = +4 (strong); mom = (2-1) - 4/4 = 1 - 1 = 0 -> leading (mom>=0)
    { symbol: 'XLK', close: 100, ma50: 90, ret5: 2.0, ret20: 8.0, ivRank: 60, gammaRegime: 'positive' },
    // rs = 6-4 = +2 (strong); mom = (-1-1) - 2/4 = -2.5 -> weakening
    { symbol: 'XLF', close: 100, ma50: 99, ret5: -1.0, ret20: 6.0 },
    // rs = 1-4 = -3 (weak); mom = (3-1) - (-3)/4 = 2 + 0.75 = 2.75 -> improving
    { symbol: 'XLE', close: 100, ma50: 101, ret5: 3.0, ret20: 1.0 },
    // rs = -6-4 = -10 (weak); mom = (-3-1) - (-10)/4 = -4 + 2.5 = -1.5 -> lagging
    { symbol: 'XLU', close: 100, ma50: 105, ret5: -3.0, ret20: -6.0 },
  ];
  const r = buildSectorRotation(rows, 'SPY');
  assert.equal(r.status, 'ready');
  const q = Object.fromEntries(r.sectors.map(s => [s.symbol, s.quadrant]));
  assert.equal(q.XLK, 'leading');
  assert.equal(q.XLF, 'weakening');
  assert.equal(q.XLE, 'improving');
  assert.equal(q.XLU, 'lagging');
  assert.deepEqual(r.quadrant_counts, { leading: 1, weakening: 1, improving: 1, lagging: 1 });
  // benchmark itself is not a rotation point
  assert.ok(!r.sectors.some(s => s.symbol === 'SPY'));
  // sorted by relative strength descending
  assert.deepEqual(r.sectors.map(s => s.symbol), ['XLK', 'XLF', 'XLE', 'XLU']);
  // carries context + rs relative to benchmark
  const xlk = r.sectors.find(s => s.symbol === 'XLK');
  assert.equal(xlk.rs, 4);
  assert.equal(xlk.label, '科技');
  assert.equal(xlk.above_ma50, true);
});

test('sector rotation fails closed when the benchmark has no return', () => {
  const r = buildSectorRotation([{ symbol: 'XLK', ret5: 1, ret20: 2 }], 'SPY');
  assert.equal(r.status, 'missing');
  assert.equal(r.reason, 'benchmark_unavailable');
});

test('sector rotation skips ETFs missing returns and never lists non-ETF symbols', () => {
  const rows = [
    { symbol: 'SPY', ret5: 1, ret20: 4 },
    { symbol: 'XLK', ret5: 2, ret20: 8 },
    { symbol: 'XLF', ret5: null, ret20: 6 }, // missing -> skipped
    { symbol: 'TSLA', ret5: 5, ret20: 20 }, // not an ETF in the map -> ignored
  ];
  const r = buildSectorRotation(rows, 'SPY');
  assert.deepEqual(r.sectors.map(s => s.symbol), ['XLK']);
});

test('every sector-ETF label describes a sector/theme, not an action', () => {
  const forbidden = ['买', '卖', '入场', '止损', 'buy', 'sell'];
  for (const meta of Object.values(SECTOR_ETFS)) {
    for (const w of forbidden) assert.ok(!meta.label.includes(w));
  }
});

// ---- R1.2 Daily Market Briefing ----
const briefingInputs = {
  dateLabel: '2026-07-24',
  breadth: { gamma: { positive_pct: 55 }, iv_rank: { median: 59.5, elevated_pct: 64 } },
  stateMatrix: { distribution: { S1: 20, S2: 21, S3: 0, S4: 4, S5: 9, S6: 9, S0: 11 } },
  rotation: {
    sectors: [
      // rs-desc, as buildSectorRotation always returns
      { symbol: 'XLE', label: '能源', quadrant: 'leading', rs: 6.8 },
      { symbol: 'XLV', label: '医疗', quadrant: 'leading', rs: 2.9 },
      { symbol: 'BOTZ', label: '机器人/AI', quadrant: 'lagging', rs: -8.1 },
      { symbol: 'TAN', label: '太阳能', quadrant: 'lagging', rs: -10.1 },
    ],
  },
  spyGamma: 'negative',
  qqqGamma: 'positive',
  earnings: [{ symbol: 'MSFT', date: '2026-07-29' }, { symbol: 'META', date: '2026-07-29' }, { symbol: 'AAPL', date: '2026-07-30' }],
  unusual: [{ symbol: 'NFLX', abs_oi: 945237 }],
};

test('briefing synthesizes a market tilt + headline from the reused aggregates', () => {
  const b = buildBriefing(briefingInputs);
  assert.equal(b.tilt, '偏多头');           // S1 20 > S5 9
  assert.match(b.headline, /2026-07-24 市场偏多头/);
  assert.match(b.headline, /55% 标的处正 Gamma/);
  assert.match(b.headline, /IV Rank 中位 60/);   // 59.5 rounded
  assert.match(b.headline, /强势上行 20 \/ 回调 21 \/ 空头 9/);
  assert.match(b.headline, /11 只高波动观望/);
  assert.match(b.headline, /能源、医疗 领跑/);
  assert.match(b.headline, /未来一周 3 只财报（MSFT、META、AAPL）/);
});

test('briefing callouts carry rotation leaders/laggards and gamma labels', () => {
  const b = buildBriefing(briefingInputs);
  assert.deepEqual(b.callouts.rotation.leaders.map(x => x.symbol), ['XLE', 'XLV']);
  // laggards are the weakest rs (end of the rs-desc list), worst first
  assert.deepEqual(b.callouts.rotation.laggards.map(x => x.symbol), ['TAN', 'BOTZ']);
  assert.equal(b.spy_gamma_label, '负Gamma');
  assert.equal(b.qqq_gamma_label, '正Gamma');
  assert.equal(b.earnings_ahead.length, 3);
  assert.equal(b.top_unusual[0].symbol, 'NFLX');
});

test('briefing tilts bearish when downtrend outnumbers strong uptrend', () => {
  const b = buildBriefing({ ...briefingInputs, stateMatrix: { distribution: { S1: 3, S5: 15 } } });
  assert.equal(b.tilt, '偏空头');
});

test('briefing degrades gracefully when aggregates are empty', () => {
  const b = buildBriefing({ dateLabel: '2026-07-24', breadth: {}, stateMatrix: {}, rotation: {}, earnings: [], unusual: [] });
  assert.equal(b.tilt, '多空均衡');
  assert.match(b.headline, /2026-07-24 市场多空均衡/);
  assert.deepEqual(b.earnings_ahead, []);
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
