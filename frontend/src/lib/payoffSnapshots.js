const SNAPSHOT_RATIOS = [0.75, 0.5, 0.25];

export function createPayoffSnapshots(maxDte) {
  const totalDays = Math.max(0, Number(maxDte) || 0);
  const seen = new Set();

  return SNAPSHOT_RATIOS
    .map((ratio) => Math.max(1, Math.round(totalDays * ratio)))
    .filter((days) => days < totalDays && !seen.has(days) && seen.add(days))
    .map((days) => ({ days, label: `${days} DTE` }));
}

export function optionValueAtDays({ spot, strike, type, days, price }) {
  if (days > 0) return price;
  return type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}
