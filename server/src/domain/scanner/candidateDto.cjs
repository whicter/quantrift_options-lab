function toCandidateDto(candidate, { inputSnapshotTs = null } = {}) {
  const withSnapshot = model => (model ? {
    ...model,
    input_snapshot_ts: inputSnapshotTs,
  } : null);
  return {
    strategy: candidate.strategy,
    summary: candidate.summary,
    structure: candidate.structure,
    pricing: candidate.pricing,
    legLabels: candidate.legLabels,
    expiry: candidate.expiry,
    dte: candidate.dte,
    farExpiry: candidate.farExpiry ?? null,
    farDte: candidate.farDte ?? null,
    score: candidate.score,
    directionConflict: candidate.directionConflict ?? false,
    directionNote: candidate.directionNote ?? null,
    gammaNote: candidate.gammaNote ?? null,
    credit: candidate.credit,
    debit: candidate.debit,
    maxLoss: candidate.maxLoss,
    returnOnRisk: candidate.returnOnRisk,
    breakevens: candidate.breakevens,
    riskType: candidate.riskType ?? 'defined',
    minOpenInterest: candidate.minOpenInterest,
    totalVolume: candidate.totalVolume,
    avgSpreadPct: candidate.avgSpreadPct,
    expected_move: withSnapshot(candidate.expectedMove),
    pop: withSnapshot(candidate.pop),
    // Payoff travels with POP so probability is never presented alone. A long
    // option is structurally sub-50% (POP is measured at strike + premium), so
    // a card showing only the probability reads as a bad trade even when the
    // payoff makes it a reasonable one.
    payoff: candidate.payoff ?? null,
    legs: candidate.legs.map(leg => ({
      action: leg.action,
      expiry: leg.expiry,
      dte: leg.dte,
      strike: leg.strike,
      right: leg.right,
      bid: leg.bid,
      ask: leg.ask,
      delta: leg.delta,
    })),
  };
}

module.exports = { toCandidateDto };
