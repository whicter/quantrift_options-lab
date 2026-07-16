export function buildStrategyComparison(strategy) {
  const dtes = strategy.legs.map((leg) => Number(leg.dte)).filter(Number.isFinite);
  const minDte = Math.min(...dtes);
  const maxDte = Math.max(...dtes);
  const dte = minDte === maxDte ? `${minDte} DTE` : `${minDte}-${maxDte} DTE`;

  return {
    id: strategy.id,
    name: strategy.name,
    zh: strategy.zh,
    direction: strategy.tag,
    risk: strategy.lvl,
    dte,
    legs: strategy.legs.map((leg) => ({
      action: leg.dir > 0 ? 'LONG' : 'SHORT',
      type: leg.type.toUpperCase(),
      strike: leg.K,
      quantity: leg.qty,
      dte: leg.dte,
    })),
    iv: strategy.notes.iv,
    takeProfit: strategy.notes.tp,
    stopLoss: strategy.notes.sl,
  };
}
