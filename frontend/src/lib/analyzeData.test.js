import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDerivedAnalysis, applyGex, applySummary, formatLevelList, isUsableGex } from './analyzeData.js';

const mockSeed = {
  symbol: 'PLTR',
  price: 133.72,
  callWall: 595,
  putWall: 575,
  gexTotal: 2_850_000_000,
  gexByStrike: [{ strike: 595, gex: 31_800_000 }],
  pcr: 1.2,
  pcrVol: 0.84,
  scenarios: { upTrigger: 595, downTrigger: 575 },
  recommendation: {
    strategy: 'Iron Condor',
    legs: [{ label: 'CALL 595' }, { label: 'PUT 575' }],
  },
};

test('stale GEX remains visible when required real fields exist', () => {
  const result = applyGex(mockSeed, {
    symbol: 'PLTR',
    freshness: 'stale',
    is_stale: true,
    confidence: 'high',
    source: 'tt_internal',
    snapshot_ts: '2026-07-14T00:00:00Z',
    raw_metrics: { model_version: 'gex-v2-1pct-positioning-proxy', unit: 'usd_delta_change_per_1pct_move' },
    age_minutes: 20,
    underlying_price: '133.74',
    global_gex: '1000',
    call_wall: '140',
    put_wall: '130',
    strikes: [{ strike: '140', net_gex: '1000' }],
  });

  assert.equal(result.callWall, 140);
  assert.equal(result.putWall, 130);
  assert.equal(result.partialData, undefined);
  assert.equal(result.gexNotice.title, '期权数据延迟');
});

test('usable GEX price override stamps an intraday as-of from the snapshot ts', () => {
  const seed = { ...mockSeed, priceAsOf: { kind: 'close', date: '2026-07-16', ts: null } };
  const result = applyGex(seed, {
    symbol: 'PLTR',
    freshness: 'fresh',
    confidence: 'high',
    source: 'polygon_licensed',
    snapshot_ts: '2026-07-23T18:32:00Z',
    raw_metrics: { model_version: 'gex-v2-1pct-positioning-proxy', unit: 'usd_delta_change_per_1pct_move' },
    underlying_price: '319.69',
    global_gex: '1000',
    call_wall: '340',
    put_wall: '300',
    strikes: [{ strike: '340', net_gex: '1000' }],
  });
  assert.equal(result.price, 319.69);
  assert.equal(result.priceAsOf.kind, 'intraday');
  assert.equal(result.priceAsOf.ts, '2026-07-23T18:32:00Z');
  assert.equal(result.priceAsOf.freshness, 'fresh');
});

test('unusable GEX keeps the daily-close as-of instead of faking an intraday one', () => {
  const seed = { ...mockSeed, priceAsOf: { kind: 'close', date: '2026-07-16', ts: null } };
  const result = applyGex(seed, { symbol: 'PLTR', freshness: 'missing' });
  assert.equal(result.priceAsOf.kind, 'close');
  assert.equal(result.priceAsOf.date, '2026-07-16');
});

test('missing GEX clears mock walls and does not keep mock strategy legs', () => {
  const result = applyGex(mockSeed, {
    symbol: 'PLTR',
    freshness: 'missing',
    is_stale: true,
  });

  assert.equal(result.callWall, null);
  assert.equal(result.putWall, null);
  assert.equal(result.recommendation, null);
  assert.equal(result.gexMeta, undefined);
});

test('fresh usable GEX replaces mock walls with real values', () => {
  const gex = {
    symbol: 'PLTR',
    freshness: 'fresh',
    is_stale: false,
    confidence: 'high',
    source: 'tt_internal',
    snapshot_ts: '2026-07-15T07:26:50Z',
    provider_status: 'ok',
    wall_method: 'gex',
    underlying_price: '133.7400',
    global_gex: '2066743560.07',
    call_wall: '140.0000',
    put_wall: '140.0000',
    max_pain: '140.0000',
    pcr_oi: '1.10',
    pcr_volume: '0.90',
    gamma_regime: 'positive',
    gamma_flip: '132.50',
    local_gamma: '884400',
    raw_metrics: {
      model_version: 'gex-v2-1pct-positioning-proxy',
      unit: 'usd_delta_change_per_1pct_move',
      positioning_model: 'call_positive_put_negative_proxy',
    },
    strikes: [
      { strike: '140.0000', net_gex: '1000', call_gex: '2000', put_gex: '-1000' },
    ],
  };

  assert.equal(isUsableGex(gex), true);
  const result = applyGex(mockSeed, gex);

  assert.equal(result.callWall, 140);
  assert.equal(result.putWall, 140);
  assert.equal(result.price, 133.74);
  assert.equal(result.partialData, undefined);
  assert.equal(result.gammaFlip, 132.5);
  assert.equal(result.localGamma, 884400);
  assert.equal(result.gexMeta, undefined);
  assert.deepEqual(result.gexByStrike, [{ strike: 140, gex: 1000 }]);
  assert.match(result.conclusion, /Call Wall \$140.00 \/ Put Wall \$140.00/);
});

test('legacy GEX model is rejected instead of being presented as current analysis', () => {
  const legacy = {
    symbol: 'SPY',
    freshness: 'fresh',
    is_stale: false,
    confidence: 'high',
    source: 'tt_internal',
    snapshot_ts: '2026-07-15T07:26:50Z',
    underlying_price: '754.81',
    global_gex: '217181490258',
    call_wall: '760',
    put_wall: '745',
    raw_metrics: {
      model_version: 'gex-v1',
      unit: 'usd_delta_change_per_1pct_move',
    },
    strikes: [{ strike: '760', net_gex: '1000' }],
  };

  assert.equal(isUsableGex(legacy), false);
  const result = applyGex(mockSeed, legacy);
  assert.equal(result.callWall, null);
  assert.equal(result.putWall, null);
  assert.equal(result.recommendation, null);
  assert.match(result.partialData.message, /期权数据暂不可用/);
});

test('low-confidence delayed data remains visible with a quality notice', () => {
  const gex = {
    symbol: 'NBIS',
    freshness: 'fresh',
    is_stale: false,
    confidence: 'low',
    source: 'ib_internal',
    snapshot_ts: '2026-07-15T16:00:40Z',
    underlying_price: '193.53',
    global_gex: '-1712643900.73',
    call_wall: '200',
    put_wall: '185',
    strikes: [{ strike: '200', net_gex: '-1000' }],
    quality: { contract_count: 52, missing_oi_ratio: '0.1923' },
    raw_metrics: { model_version: 'gex-v2-1pct-positioning-proxy', unit: 'usd_delta_change_per_1pct_move' },
  };

  assert.equal(isUsableGex(gex), true);
  const result = applyGex(mockSeed, gex);
  assert.equal(result.callWall, 200);
  assert.equal(result.putWall, 185);
  assert.equal(result.gexNotice.title, '部分期权数据可用');
  assert.equal(result.gexNotice.message, '当前结果可能不完整，请结合页面时间与风险提示使用。');
});

test('derived analysis only attaches ready real-data products', () => {
  const result = applyDerivedAnalysis(mockSeed, {
    status: 'ready',
    source: 'polygon',
    latest_date: '2026-07-14',
    bar_count: 250,
    support: [{ price: 130, touches: 3 }],
    resistance: [{ price: 140, touches: 2 }],
    focus: { ready: true, score: 68, label: '偏强' },
    obv: { status: 'ready', latest: 350000, change_20d: 80000, trend: 'inflow', series: [{ date: '2026-07-14', value: 350000 }] },
    mfi: { status: 'ready', value: 73.4, signal: 'neutral', period: 14 },
    momentum: {
      status: 'ready', score: 72, label: '多周期强势', weights: { '30m': 0.3, '1d': 0.4, '1w': 0.3 },
      timeframes: { '30m': { score: 70 }, '1d': { score: 75 }, '1w': { score: 70 } },
    },
  }, {
    status: 'ready',
    source: 'ib_internal',
    snapshot_ts: '2026-07-15T16:00:00Z',
    freshness: 'fresh',
    term_structure: [{ expiry: '2026-08-21', atm_iv: 0.4 }],
    skew: { expiry: '2026-08-21', points: [{ strike: 135, put_iv: 0.42 }] },
    iv_contract_count: 20,
    oi_density: {
      status: 'ready', source: 'polygon_licensed', snapshot_ts: '2026-07-15T16:00:00Z', freshness: 'fresh',
      aggregation: 'all_nonexpired_expiries', expiry_count: 3, contract_count: 40, total_open_interest: 12000,
      points: [{ strike: 135, call_oi: 5000, put_oi: 7000, total_oi: 12000 }],
    },
  }, {
    status: 'ready', source: 'price_history_30m', days: 20, bar_count: 260,
    price_low: 125, price_high: 145, total_volume: 2000000,
    nodes: [{ price: 130, volume: 800000, volume_pct: 40 }],
    high_volume_nodes: [{ price: 130, volume: 800000, volume_pct: 40 }],
  });
  assert.deepEqual(result.focusScore, { label: '偏强' });
  assert.equal(result.compositeMomentum.score, 72);
  assert.equal(result.obv.trend, 'inflow');
  assert.equal(result.mfi.value, 73.4);
  assert.equal(result.supportResistance.support[0].price, 130);
  assert.equal(result.chainStats.ivContractCount, undefined);
  assert.equal(result.chainStats.oiDensity.points[0].put_oi, 7000);
  assert.equal(result.chainStats.oiDensity.expiryCount, undefined);
  assert.equal(result.volumeProfile.days, undefined);
  assert.equal(result.volumeProfile.highVolumeNodes[0].price, 130);
});

test('missing derived data remains null instead of using mock values', () => {
  const result = applyDerivedAnalysis(mockSeed, { status: 'missing' }, { status: 'missing' });
  assert.equal(result.supportResistance, null);
  assert.equal(result.focusScore, null);
  assert.equal(result.compositeMomentum, null);
  assert.equal(result.obv, null);
  assert.equal(result.mfi, null);
  assert.equal(result.chainStats, null);
  assert.equal(result.volumeProfile, null);
});

const summaryBase = {
  symbol: 'PLTR',
  conclusion: 'local fallback conclusion',
  scenarios: { upTrigger: 595, downTrigger: 575, extra: 'keep' },
};

test('applySummary lets the server positioning override conclusion and scenarios', () => {
  const result = applySummary(summaryBase, {
    data_status: { label: '数据更新于2小时前', freshness: 'fresh', is_stale: false, age_minutes: 120, refresh_status: null },
    positioning: { available: true, conclusion: '正Gamma $348M，Call Wall $340.00 / Put Wall $330.00。' },
    scenarios: { up_trigger: 340, up_target: 350, down_trigger: 330, down_target: 320 },
    recommendation_ref: '/api/analyze/PLTR/candidate',
  });
  assert.equal(result.conclusion, '正Gamma $348M，Call Wall $340.00 / Put Wall $330.00。');
  assert.equal(result.scenarios.upTrigger, 340);
  assert.equal(result.scenarios.upTarget, 350);
  assert.equal(result.scenarios.downTrigger, 330);
  assert.equal(result.scenarios.downTarget, 320);
  assert.equal(result.scenarios.extra, 'keep', 'unrelated scenario fields are preserved');
  assert.equal(result.positioningSource, 'server');
  assert.equal(result.dataStatus.label, '数据更新于2小时前');
  assert.equal(result.recommendationRef, '/api/analyze/PLTR/candidate');
});

test('applySummary keeps the local conclusion when the server has no positioning', () => {
  const result = applySummary(summaryBase, {
    data_status: { label: '正在准备数据', freshness: 'missing', is_stale: false, age_minutes: null, refresh_status: null },
    positioning: { available: false, unavailable_reason: { code: 'unusable', message: 'x' }, conclusion: 'server unavailable text' },
    scenarios: null,
  });
  assert.equal(result.conclusion, 'local fallback conclusion', 'server does not overwrite when positioning is unavailable');
  assert.deepEqual(result.scenarios, summaryBase.scenarios, 'scenarios untouched');
  assert.equal(result.positioningSource, undefined);
  assert.equal(result.dataStatus.freshness, 'missing');
});

test('applySummary is a no-op when the summary is absent', () => {
  assert.equal(applySummary(summaryBase, null), summaryBase);
  assert.equal(applySummary(null, {}), null);
});

test('formatLevelList names an empty side instead of collapsing it to a missing marker', () => {
  // SPY at 776.34 traded above every confirmable pivot high, so the scan
  // legitimately returned none. Rendering '--' made a real observation look
  // like absent data.
  assert.equal(formatLevelList([], 'resistance'), '无（现价高于区间内全部摆动高点）');
  assert.equal(formatLevelList([], 'support'), '无（现价低于区间内全部摆动低点）');
});

test('formatLevelList still reports genuinely unavailable input as missing', () => {
  assert.equal(formatLevelList(null, 'resistance'), '--');
  assert.equal(formatLevelList(undefined, 'support'), '--');
});

test('formatLevelList formats levels in the order given', () => {
  assert.equal(
    formatLevelList([{ price: 735.9 }, { price: 676.53 }], 'support'),
    '$735.90 / $676.53',
  );
});

test('formatLevelList drops unusable prices and falls back to the missing marker', () => {
  assert.equal(formatLevelList([{ price: null }], 'support'), '--');
});
