import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBreadthView, scalePos, IV_DOMAIN, PCR_DOMAIN } from './marketBreadth.js';

const liveBreadth = {
  status: 'ready',
  universe_count: 80,
  gamma_as_of: '2026-07-23T18:32:00Z',
  broad_market: {
    status: 'ready',
    market_date: '2026-07-30',
    previous_market_date: '2026-07-29',
    reference_count: 5100,
    universe_count: 5000,
    counted: 4980,
    missing_previous_count: 20,
    coverage_pct: 99.6,
    advances: 3000,
    declines: 1800,
    unchanged: 180,
    advance_pct: 60.2,
    decline_pct: 36.1,
    unchanged_pct: 3.6,
    net_advances: 1200,
    advance_decline_ratio: 1.6667,
    volume_counted: 4970,
    advancing_volume_pct: 63.8,
    declining_volume_pct: 35.5,
    exchanges: {
      XNYS: { label: 'NYSE', counted: 2200, advances: 1300, declines: 800, unchanged: 100, advance_pct: 59.1 },
      XNAS: { label: 'Nasdaq', counted: 2600, advances: 1600, declines: 900, unchanged: 100, advance_pct: 61.5 },
    },
    history: [
      { market_date: '2026-07-29', net_advances: -800, cumulative_ad: -800 },
      { market_date: '2026-07-30', net_advances: 1200, cumulative_ad: 400 },
    ],
  },
  trend: { above_ma50_pct: 43.2, above_ma200_pct: 68.9, counted_ma50: 74, counted_ma200: 74 },
  gamma: { positive_pct: 55, negative_pct: 45, neutral_pct: 0, counted: 80 },
  iv_rank: { median: 59.5, p25: 39.9, p75: 72.8, elevated_pct: 64.3, counted: 56 },
  pcr: { median: 0.98, p25: 0.56, p75: 1.8, counted: 80 },
};

test('scalePos maps a value into 0-100% and clamps out-of-domain', () => {
  assert.equal(scalePos(50, IV_DOMAIN), 50);
  assert.equal(scalePos(0, IV_DOMAIN), 0);
  assert.equal(scalePos(150, IV_DOMAIN), 100);   // clamped high
  assert.equal(scalePos(-5, IV_DOMAIN), 0);      // clamped low
  assert.equal(scalePos(null, IV_DOMAIN), null);
});

test('builds render-ready gamma / IV / PCR / trend geometry from a live response', () => {
  const v = buildBreadthView(liveBreadth);
  assert.equal(v.status, 'ready');
  assert.equal(v.universeCount, 80);
  assert.equal(v.empty, false);
  assert.equal(v.broadMarket.marketDate, '2026-07-30');
  assert.equal(v.broadMarket.netAdvances, 1200);
  assert.equal(v.broadMarket.exchanges.length, 2);
  assert.equal(v.broadMarket.history[0].tone, 'negative');
  assert.equal(v.broadMarket.history[1].magnitudePct, 100);

  assert.equal(v.gamma.positivePct, 55);
  assert.equal(v.gamma.negativePct, 45);

  // IV rank median 59.5 on a 0-100 track sits at 59.5%; band = [p25, 100-p75].
  assert.equal(v.ivRank.medianPos, 59.5);
  assert.equal(v.ivRank.left, 39.9);
  assert.ok(Math.abs(v.ivRank.right - (100 - 72.8)) < 1e-9);
  assert.equal(v.ivRank.counted, 56);

  // PCR on [0.3, 2.3]: median 0.98 -> (0.98-0.3)/2 = 34%.
  assert.ok(Math.abs(v.pcr.medianPos - 34) < 1e-9);
  assert.ok(Math.abs(v.pcr.parityPos - 35) < 1e-9);   // parity 1.0 -> 35%
  assert.equal(v.trend.aboveMa50Pct, 43.2);
  assert.equal(v.trend.counted, 74);
});

test('a block with zero counted collapses to null instead of a fake bar', () => {
  const v = buildBreadthView({
    status: 'ready',
    gamma: { positive_pct: null, counted: 0 },
    iv_rank: { median: null, counted: 0 },
    pcr: { median: 0.9, p25: 0.5, p75: 1.4, counted: 12 },
    trend: { counted_ma50: 0, counted_ma200: 0 },
  });
  assert.equal(v.gamma, null);
  assert.equal(v.ivRank, null);
  assert.equal(v.trend, null);
  assert.ok(v.pcr);           // the one block with data survives
  assert.equal(v.empty, false);
});

test('reports empty when nothing usable came back', () => {
  const v = buildBreadthView({
    status: 'ready',
    gamma: { counted: 0 }, iv_rank: { counted: 0 }, pcr: { counted: 0 },
    trend: { counted_ma50: 0, counted_ma200: 0 },
  });
  assert.equal(v.empty, true);
});

test('full-market breadth can render by itself before options-native aggregates are ready', () => {
  const v = buildBreadthView({
    status: 'ready',
    broad_market: liveBreadth.broad_market,
    gamma: { counted: 0 }, iv_rank: { counted: 0 }, pcr: { counted: 0 },
    trend: { counted_ma50: 0, counted_ma200: 0 },
  });
  assert.ok(v.broadMarket);
  assert.equal(v.empty, false);
});

test('passes through a non-ready status without throwing', () => {
  assert.equal(buildBreadthView({ status: 'missing' }).status, 'missing');
  assert.equal(buildBreadthView(null).status, 'missing');
});

test('PCR domain is the documented display window', () => {
  assert.deepEqual(PCR_DOMAIN, [0.3, 2.3]);
});
