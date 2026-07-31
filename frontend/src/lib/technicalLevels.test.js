import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTechnicalLevels, technicalLevelsPath } from './technicalLevels.js';

test('normalizes the display-safe technical-levels contract', () => {
  const result = normalizeTechnicalLevels({
    symbol: 'GOOG',
    status: 'ready',
    spot: '346.19',
    indicators: { dma50: '366.12', dma100: null },
    supports: [{
      side: 'support',
      low: '343',
      high: '346',
      center: '345',
      score: '82',
      strength: 'strong',
      evidence: [{ price: '346', weight: '30' }],
    }],
  });
  assert.equal(result.spot, 346.19);
  assert.equal(result.indicators.dma50, 366.12);
  assert.equal(result.supports[0].strength, 'strong');
  assert.equal(result.supports[0].score, undefined);
  assert.equal(result.supports[0].evidence, undefined);
  assert.deepEqual(result.resistances, []);
  assert.equal(result.options.status, 'missing');
});

test('builds a validated technical-levels path', () => {
  assert.equal(technicalLevelsPath(' goog '), '/api/technical-levels/GOOG');
  assert.equal(technicalLevelsPath('spy'), '/api/technical-levels/SPY');
});

test('rejects malformed symbols', () => {
  assert.throws(() => technicalLevelsPath("GOOG' OR 1=1"), /invalid symbol/);
});
