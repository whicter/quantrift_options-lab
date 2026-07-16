import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeScannerRows, nextScannerSort, scanCandidateId, sortScannerRows } from './scannerResults.js';

function row(symbol, ivRank) {
  return {
    symbol,
    ivRank,
    price: 100,
    iv30: 20,
    direction: { score: 0 },
    community: { score: 0 },
    gex: { score: 0 },
    unusual: { maxDelta: 0 },
    contractQuality: { contractCount: 1 },
    recommendation: { strategy: 'Diagonal Spread' },
    concreteSetup: { score: ivRank },
    earnings: { daysAway: 10 },
  };
}

test('sorts repeated scanner candidates by the selected symbol column', () => {
  const rows = [row('IREN', 70), row('MRVL', 69), row('PLTR', 64), row('IREN', 70), row('NBIS', 93)];
  assert.deepEqual(
    sortScannerRows(rows, { key: 'symbol', direction: 'asc' }).map(item => item.symbol),
    ['IREN', 'IREN', 'MRVL', 'NBIS', 'PLTR'],
  );
  assert.deepEqual(
    sortScannerRows(rows, { key: 'symbol', direction: 'desc' }).map(item => item.symbol),
    ['PLTR', 'NBIS', 'MRVL', 'IREN', 'IREN'],
  );
});

test('candidate keys include each leg expiry for cross-expiry structures', () => {
  const first = { strategy: 'Diagonal Spread', legs: [{ expiry: '2026-07-17', action: 'SELL', right: 'C', strike: 220 }, { expiry: '2026-08-21', action: 'BUY', right: 'C', strike: 210 }] };
  const second = { strategy: 'Diagonal Spread', legs: [{ expiry: '2026-07-17', action: 'SELL', right: 'C', strike: 220 }, { expiry: '2026-09-18', action: 'BUY', right: 'C', strike: 210 }] };
  assert.notEqual(scanCandidateId('AMZN', first), scanCandidateId('AMZN', second));
});

test('deduplicates identical candidates before React renders and sorts them repeatedly', () => {
  const rows = [
    { ...row('PLTR', 64), id: 'PLTR:one' },
    { ...row('IREN', 70), id: 'IREN:one' },
    { ...row('PLTR', 64), id: 'PLTR:one' },
  ];
  const uniqueRows = dedupeScannerRows(rows);
  assert.deepEqual(uniqueRows.map(item => item.id), ['PLTR:one', 'IREN:one']);

  let sort = { key: 'score', direction: 'desc' };
  sort = nextScannerSort(sort, 'symbol');
  assert.deepEqual(sort, { key: 'symbol', direction: 'desc' });
  sort = nextScannerSort(sort, 'symbol');
  assert.deepEqual(sort, { key: 'symbol', direction: 'asc' });
  sort = nextScannerSort(sort, 'symbol');
  assert.deepEqual(sort, { key: 'symbol', direction: 'desc' });
  assert.deepEqual(sortScannerRows(uniqueRows, sort).map(item => item.symbol), ['PLTR', 'IREN']);
});
