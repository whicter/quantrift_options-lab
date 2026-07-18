const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConfluence, CONFLUENCE_WEIGHTS_V1 } = require('../src/domain/confluence/engine');
const { deriveSupportResistance } = require('../src/routes/supportResistance');
const { deriveVolumeProfile } = require('../src/routes/volumeProfile');

function dailyBars(count = 250) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + (index * 0.12) + Math.sin(index / 4) * 2;
    return {
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1_000_000 + ((index % 7) * 100_000),
    };
  });
}

test('confluence emits deterministic scored price zones with reasons', () => {
  const bars = dailyBars();
  const result = buildConfluence({
    bars,
    structure: deriveSupportResistance(bars),
    volumeProfile: deriveVolumeProfile(bars, 40),
    gex: { spot: bars.at(-1).close, put_wall: 125, call_wall: 134, gamma_flip: 130 },
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.model_version, 'confluence-v1-prior');
  assert.deepEqual(result.weights, CONFLUENCE_WEIGHTS_V1);
  assert.ok(result.atr14 > 0);
  assert.ok(result.support.length > 0);
  assert.ok(result.resistance.length > 0);
  for (const zone of [...result.support, ...result.resistance]) {
    assert.ok(zone.low < zone.high);
    assert.ok(zone.score >= 0 && zone.score <= 100);
    assert.ok(zone.reasons.length > 0);
    assert.ok(['极强', '强', '中', '弱'].includes(zone.strength));
  }
});

test('confluence omits gamma cleanly when a snapshot is unavailable', () => {
  const bars = dailyBars();
  const result = buildConfluence({
    bars,
    structure: deriveSupportResistance(bars),
    volumeProfile: deriveVolumeProfile(bars, 40),
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.input_summary.gamma, false);
  assert.equal(result.support.flatMap(zone => zone.reasons).some(reason => reason.module === 'gamma'), false);
});

test('confluence fails closed for insufficient daily history', () => {
  const result = buildConfluence({ bars: dailyBars(19), volumeProfile: null, structure: null });
  assert.equal(result.status, 'missing');
  assert.equal(result.reason, 'requires_20_daily_bars');
});
