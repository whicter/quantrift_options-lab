const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateConfluenceReplay, CONTROL_BAND_PCT } = require('../src/domain/confluence/replay');

function bars(count = 150) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + (index * 0.2) + Math.sin(index / 3) * 5;
    return {
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1_000_000 + (index % 9) * 100_000,
    };
  });
}

test('G5 replay is no-lookahead and declares the exact control and gate', () => {
  const source = bars();
  const original = evaluateConfluenceReplay(source, { minHistory: 90, horizonDays: 5 });
  const modified = bars();
  modified[149] = { ...modified[149], high: 10_000, low: 1, close: 5_000, volume: 99_000_000 };
  const changed = evaluateConfluenceReplay(modified, { minHistory: 90, horizonDays: 5 });

  assert.equal(original.gamma_mode, 'disabled_for_historical_replay');
  assert.equal(original.control.band_pct, CONTROL_BAND_PCT);
  assert.equal(original.gate.threshold, 0.15);
  assert.ok(original.decisions.length > 0);
  assert.deepEqual(original.decisions[0], changed.decisions[0], 'first decision cannot depend on bars outside its prefix and scoring horizon');
});

test('G5 replay reports hold and recall metrics without inventing a pass', () => {
  const result = evaluateConfluenceReplay(bars(), { minHistory: 90, horizonDays: 5 });
  for (const key of ['confluence', 'control']) {
    assert.ok(result[key].opportunities > 0);
    assert.ok(result[key].hold_rate == null || (result[key].hold_rate >= 0 && result[key].hold_rate <= 1));
    assert.ok(result[key].reversal_recall == null || (result[key].reversal_recall >= 0 && result[key].reversal_recall <= 1));
  }
  assert.equal(typeof result.gate.passed, 'boolean');
});
