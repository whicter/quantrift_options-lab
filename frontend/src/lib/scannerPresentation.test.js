import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMoney, gammaRegimeLabel, gammaSummary, wallSummary } from './scannerPresentation.js';

test('compactMoney keeps GEX readable across B, M, and K ranges', () => {
  assert.equal(compactMoney(217_181_490_258), '$217B');
  assert.equal(compactMoney(900_000_000), '$0.9B');
  assert.equal(compactMoney(20_000_000), '$20M');
  assert.equal(compactMoney(3_500_000), '$3.5M');
});

test('gamma summary exposes sign, exposure, behavior, and stale state', () => {
  assert.equal(gammaRegimeLabel('negative'), '负 Gamma');
  assert.equal(
    gammaSummary({ total: -1_100_000_000, regime: 'negative', status: 'stale' }),
    '负 Gamma · 净 GEX -$1.1B · 波动更可能放大 · 快照延迟',
  );
});

test('wall summary gives the wall price and whether it is above or below spot', () => {
  assert.equal(
    wallSummary({ callWall: 220, putWall: 195, nearestWall: { side: 'Call' } }, 210),
    '上方 Call Wall $220 (+4.8%)',
  );
  assert.equal(
    wallSummary({ callWall: 220, putWall: 195, nearestWall: { side: 'Put' } }, 210),
    '下方 Put Wall $195 (-7.1%)',
  );
});
