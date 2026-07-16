import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDerivedAnalysis, applyGex, isUsableGex } from './analyzeData.js';

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
  assert.equal(result.gexNotice.title, '延迟期权快照');
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
  assert.equal(result.gexMeta, null);
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
  assert.match(result.conclusion, /Call Wall \$140.00 \/ Put Wall \$140.00/);
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
  };

  assert.equal(isUsableGex(gex), true);
  const result = applyGex(mockSeed, gex);
  assert.equal(result.callWall, 200);
  assert.equal(result.putWall, 185);
  assert.equal(result.gexNotice.title, '部分期权数据');
  assert.match(result.gexNotice.message, /19.2% 暂缺 OI/);
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
  assert.equal(result.focusScore.score, 68);
  assert.equal(result.compositeMomentum.score, 72);
  assert.equal(result.obv.trend, 'inflow');
  assert.equal(result.supportResistance.support[0].price, 130);
  assert.equal(result.chainStats.ivContractCount, 20);
  assert.equal(result.chainStats.oiDensity.points[0].put_oi, 7000);
  assert.equal(result.chainStats.oiDensity.expiryCount, 3);
  assert.equal(result.volumeProfile.days, 20);
  assert.equal(result.volumeProfile.highVolumeNodes[0].price, 130);
});

test('missing derived data remains null instead of using mock values', () => {
  const result = applyDerivedAnalysis(mockSeed, { status: 'missing' }, { status: 'missing' });
  assert.equal(result.supportResistance, null);
  assert.equal(result.focusScore, null);
  assert.equal(result.compositeMomentum, null);
  assert.equal(result.obv, null);
  assert.equal(result.chainStats, null);
  assert.equal(result.volumeProfile, null);
});
