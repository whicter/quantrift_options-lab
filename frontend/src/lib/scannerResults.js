function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function scanCandidateId(symbol, setup) {
  const legs = (setup.legs || []).map(leg => [
    leg.expiry || '',
    leg.action || '',
    leg.right || '',
    leg.strike ?? '',
    leg.contractSymbol || '',
  ].join('-')).join('|');
  return `${symbol}:${setup.strategy}:${legs}`;
}

export function dedupeScannerRows(rows) {
  const uniqueRows = new Map();
  rows.forEach(row => {
    if (!uniqueRows.has(row.id)) uniqueRows.set(row.id, row);
  });
  return [...uniqueRows.values()];
}

export function nextScannerSort(currentSort, key) {
  if (currentSort.key !== key) return { key, direction: 'desc' };
  return { key, direction: currentSort.direction === 'desc' ? 'asc' : 'desc' };
}

export function scannerSortValue(row, key) {
  if (key === 'symbol') return row.symbol;
  if (key === 'price') return number(row.price) ?? -Infinity;
  if (key === 'ivRank') return row.ivRank;
  if (key === 'iv30') return number(row.iv30) ?? -Infinity;
  if (key === 'direction') return row.direction.score;
  if (key === 'community') return row.community.score;
  if (key === 'gex') return row.gex.score;
  if (key === 'wall') return row.gex.nearestWall?.pct ?? Infinity;
  if (key === 'doi') return Math.abs(row.unusual.maxDelta ?? -Infinity);
  if (key === 'contract') return row.contractQuality.contractCount;
  if (key === 'strategy') return row.recommendation.strategy;
  if (key === 'score') return row.concreteSetup.score ?? -Infinity;
  if (key === 'earnings') return row.earnings.daysAway ?? Infinity;
  return 0;
}

export function sortScannerRows(rows, tableSort) {
  return [...rows].sort((left, right) => {
    const leftValue = scannerSortValue(left, tableSort.key);
    const rightValue = scannerSortValue(right, tableSort.key);
    if (typeof leftValue === 'string' || typeof rightValue === 'string') {
      const comparison = String(leftValue).localeCompare(String(rightValue));
      return tableSort.direction === 'asc' ? comparison : -comparison;
    }
    const comparison = (leftValue ?? 0) - (rightValue ?? 0);
    return tableSort.direction === 'asc' ? comparison : -comparison;
  });
}
