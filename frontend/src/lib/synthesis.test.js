import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gexEnvironmentConclusion,
  pcrConclusion,
  expectedMoveConclusion,
  consistencyDetector,
  volatilityAttribution,
  coreConclusion,
  buildSynthesis,
} from './synthesis.js';

test('C1 global-negative + local-positive is the competitor "现价附近减震" reading', () => {
  const r = gexEnvironmentConclusion({ globalGex: -22.5e6, localGamma: 5e6, price: 879.5 });
  assert.equal(r.available, true);
  assert.equal(r.key, 'neg_pos');
  assert.equal(r.divergent, true);
  assert.match(r.text, /全局 GEX 为负/);
  assert.match(r.text, /当前区域有一定减震效果/);
});

test('C1 covers all four cells and a global-only fallback', () => {
  assert.equal(gexEnvironmentConclusion({ globalGex: 1e6, localGamma: 1e6 }).key, 'pos_pos');
  assert.equal(gexEnvironmentConclusion({ globalGex: 1e6, localGamma: -1e6 }).key, 'pos_neg');
  assert.equal(gexEnvironmentConclusion({ globalGex: -1e6, localGamma: 1e6 }).key, 'neg_pos');
  assert.equal(gexEnvironmentConclusion({ globalGex: -1e6, localGamma: -1e6 }).key, 'neg_neg');
  assert.equal(gexEnvironmentConclusion({ globalGex: -1e6, localGamma: null }).key, 'global_neg');
  assert.equal(gexEnvironmentConclusion({ globalGex: null }).available, false);
});

test('C1 flags proximity to the gamma-flip level', () => {
  const near = gexEnvironmentConclusion({ globalGex: -1e6, localGamma: 1e6, gammaFlip: 100, price: 101 });
  assert.equal(near.nearFlip, true);
  assert.match(near.text, /翻转位/);
  const far = gexEnvironmentConclusion({ globalGex: -1e6, localGamma: 1e6, gammaFlip: 100, price: 130 });
  assert.equal(far.nearFlip, false);
});

test('C2 PCR turns a high ratio into a hedging read and compares volume vs OI', () => {
  const r = pcrConclusion({ pcrOi: 2.14, pcrVol: 0.97 });
  assert.equal(r.lean, 'defensive');
  assert.match(r.text, /看跌持仓约为看涨的 2\.1 倍/);
  // vol (0.97) well below oi (2.14) -> today's flow is more aggressive than the book
  assert.match(r.text, /更偏进攻/);
  assert.equal(pcrConclusion({ pcrOi: 0.5 }).lean, 'aggressive');
  assert.equal(pcrConclusion({ pcrOi: 1.0 }).lean, 'balanced');
  assert.equal(pcrConclusion({ pcrOi: null }).available, false);
});

test('C3 expected move computes to-expiry and daily bands from ATM IV', () => {
  const r = expectedMoveConclusion({ iv30Pct: 14.2, price: 750, ivRank: 44, dte: 30 });
  assert.equal(r.available, true);
  // 0.142 * sqrt(30/365) ~= 0.0407 -> 4.07%
  assert.ok(Math.abs(r.to_expiry_move_pct - 4.07) < 0.1);
  // 0.142 / sqrt(252) ~= 0.00894 -> 0.89%
  assert.ok(Math.abs(r.daily_move_pct - 0.894) < 0.05);
  assert.match(r.text, /IV Rank 44/);
  assert.equal(expectedMoveConclusion({ iv30Pct: 0 }).available, false);
});

test('C4 consistency detector: aligned bull, divergent, inconclusive', () => {
  const aligned = consistencyDetector({
    trend: { regime: '多头趋势', momentum: '向上增强' }, gammaRegime: 'positive',
    rvol: 1.6, obvTrend: 'inflow',
  });
  assert.equal(aligned.state, 'aligned_bull');

  const divergent = consistencyDetector({
    trend: { regime: '多头趋势', momentum: '向上' }, gammaRegime: 'negative', ivChange: 0.5,
    rvol: 1.5, obvTrend: 'outflow',
  });
  assert.equal(divergent.state, 'divergent');
  assert.deepEqual(divergent.bull, ['趋势']);
  assert.deepEqual(divergent.bear, ['期权结构', '量能']);

  const thin = consistencyDetector({ trend: { regime: '中性', momentum: '横盘' }, gammaRegime: 'positive', rvol: 0.9 });
  assert.equal(thin.state, 'inconclusive');
});

test('C6 attribution: move inside pricing short-circuits', () => {
  const bars = [{ close: 100 }, { open: 100, high: 100.6, low: 99.6, close: 100.3 }];
  const r = volatilityAttribution({ priceHistory: bars, iv30Pct: 30 });
  // implied daily ~1.89%, realized 0.3% -> surprise ~0.16 < 0.7
  assert.equal(r.primary, 'within_pricing');
  assert.match(r.text, /波动仍在期权定价范围内/);
});

test('C6 attribution: overnight gap + negative gamma amplification', () => {
  const bars = [
    { close: 100 },
    { open: 95, high: 95.5, low: 94.5, close: 95 }, // -5% mostly overnight gap
  ];
  const r = volatilityAttribution({
    priceHistory: bars, iv30Pct: 30, rvol: 1.6, obvTrend: 'outflow',
    earnings: { daysAway: null }, localGamma: -5e6,
  });
  assert.equal(r.available, true);
  assert.ok(r.surprise > 1.3);
  assert.equal(r.primary, 'overnight');
  assert.match(r.text, /隔夜信息/);
  assert.ok(r.clauses.some(c => c.includes('负 Gamma')));
  assert.ok(r.clauses.some(c => c.includes('量能确认')));
});

test('C6 attribution: earnings proximity wins primary attribution', () => {
  const bars = [{ close: 100 }, { open: 100, high: 106, low: 99, close: 105 }];
  const r = volatilityAttribution({
    priceHistory: bars, iv30Pct: 30, earnings: { daysAway: 1 }, localGamma: 1e6,
  });
  assert.equal(r.primary, 'event');
  assert.match(r.text, /财报/);
});

test('C5 core conclusion prioritizes earnings over gamma divergence', () => {
  const gexEnv = gexEnvironmentConclusion({ globalGex: -1e6, localGamma: 1e6 });
  const r = coreConclusion({
    symbol: 'MU', gexEnv,
    consistency: { available: true, state: 'divergent' },
    earnings: { daysAway: 2 },
  });
  assert.equal(r.headline_key, 'earnings');
  assert.match(r.headline, /财报在 2 天内/);
  // the gamma divergence survives as an alternate
  assert.ok(r.alternates.some(a => a.key === 'gex_divergent'));
});

test('C5 falls back to the plain gamma read when nothing higher fires', () => {
  const gexEnv = gexEnvironmentConclusion({ globalGex: 5e6, localGamma: 5e6 });
  const r = coreConclusion({ symbol: 'AAPL', gexEnv, consistency: { available: true, state: 'inconclusive' } });
  assert.equal(r.headline_key, 'gex_plain');
});

test('buildSynthesis assembles every block from an Analyze data object', () => {
  const data = {
    symbol: 'MU',
    gexTotal: -22.5e6, localGamma: 4e6, gammaFlip: 850, price: 879.5,
    pcr: 2.14, pcrVol: 0.97, iv30: 102.24, ivRank: 70,
    trend: { regime: '空头格局', momentum: '向下增强', signal: '趋势延续', rvol: 0.8 },
    gammaRegime: 'negative', obv: { trend: 'outflow' },
    earnings: { daysAway: null },
    priceHistory: [{ close: 853 }, { open: 860, high: 882, low: 858, close: 879.5 }],
    unusualActivity: [{ type: 'PUT', strike: 627.5, date: '07-20' }],
  };
  const s = buildSynthesis(data);
  assert.equal(s.gexEnv.key, 'neg_pos');
  assert.equal(s.pcr.lean, 'defensive');
  assert.equal(s.expectedMove.available, true);
  assert.equal(s.core.available, true);
  assert.ok(s.core.headline.length > 0);
});
