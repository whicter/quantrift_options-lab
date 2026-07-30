import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactMoney,
  gammaBehavior,
  gammaHeadline,
  gammaRegimeLabel,
  splitScannerDetails,
  wallSummary,
} from './scannerPresentation.js';

test('compactMoney keeps GEX readable across B, M, and K ranges', () => {
  assert.equal(compactMoney(217_181_490_258), '$217B');
  assert.equal(compactMoney(900_000_000), '$0.9B');
  assert.equal(compactMoney(20_000_000), '$20M');
  assert.equal(compactMoney(3_500_000), '$3.5M');
});

test('gamma positioning groups sign and exposure without printing snapshot freshness', () => {
  assert.equal(gammaRegimeLabel('negative'), '负 Gamma');
  assert.equal(gammaHeadline({ total: -1_100_000_000, regime: 'negative', status: 'stale' }), '负 Gamma · 净 GEX -$1.1B');
  assert.equal(gammaBehavior('negative'), '波动更可能放大');
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

test('scanner detail bullets split onto distinct lines without duplicating pricing', () => {
  assert.deepEqual(
    splitScannerDetails(
      'Sell 08-28 435C / Buy 10-16 390C',
      'Debit $2,130 · Max loss $2,130',
      'EM ±$44.74 · POP 不可用',
    ),
    [
      'Sell 08-28 435C / Buy 10-16 390C',
      'Debit $2,130',
      'Max loss $2,130',
      'EM ±$44.74',
      'POP 不可用',
    ],
  );
});
