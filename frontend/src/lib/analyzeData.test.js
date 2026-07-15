import assert from 'node:assert/strict';
import test from 'node:test';

import { applyGex, isUsableGex } from './analyzeData.js';

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
