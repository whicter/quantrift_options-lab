/**
 * Public Analyze candidate contract.
 *
 * The candidate engine keeps richer fields for ranking, replay and internal
 * validation. This adapter is the only shape the normal Analyze route may send
 * to a browser. Keep it allowlist-based so new engine fields remain private by
 * default.
 */

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPublicPop(pop) {
  if (pop?.status !== 'available') return pop ? { status: 'unavailable' } : null;
  const probability = finiteOrNull(pop.probability);
  if (probability == null) return { status: 'unavailable' };
  return {
    status: 'available',
    probability,
  };
}

function toPublicPayoff(payoff) {
  if (payoff?.status !== 'available') return payoff ? { status: 'unavailable' } : null;
  const rewardRisk = finiteOrNull(payoff.reward_risk);
  if (rewardRisk == null) return { status: 'unavailable' };
  return {
    status: 'available',
    reward_risk: rewardRisk,
    peak_requires_pin: Boolean(payoff.peak_requires_pin),
  };
}

function toPublicAnalyzeCandidate(candidate) {
  if (!candidate) return null;
  return {
    strategy: candidate.strategy,
    structure: candidate.structure || candidate.summary || null,
    dte: candidate.dte,
    directionConflict: Boolean(candidate.directionConflict),
    credit: finiteOrNull(candidate.credit),
    debit: finiteOrNull(candidate.debit),
    maxLoss: candidate.maxLoss == null ? null : finiteOrNull(candidate.maxLoss),
    // The one field this boundary widens for rather than narrows. A null
    // `maxLoss` above renders as an absent number, and "we did not compute it"
    // and "it is unbounded" are very different claims to leave a reader to infer
    // from the same blank. Level and reason only -- no thresholds, no scoring.
    riskDisclosure: candidate.riskDisclosure
      ? { level: candidate.riskDisclosure.level, reason: candidate.riskDisclosure.reason }
      : null,
    pop: toPublicPop(candidate.pop),
    payoff: toPublicPayoff(candidate.payoff),
    legs: (candidate.legs || []).map(leg => ({
      action: leg.action,
      dte: leg.dte,
      strike: finiteOrNull(leg.strike),
      right: leg.right,
      delta: finiteOrNull(leg.delta),
    })),
  };
}

function toPublicEnvironment(edge) {
  if (edge?.status !== 'available') return null;
  return {
    status: 'available',
    premium: edge.premium,
    favours: edge.favours,
    signalsAgree: edge.signalsAgree ?? null,
  };
}

function toPublicStructure(structure) {
  if (structure?.status !== 'present') return null;
  return {
    status: 'present',
    favours: structure.expression?.side ?? null,
  };
}

module.exports = {
  toPublicAnalyzeCandidate,
  toPublicEnvironment,
  toPublicStructure,
};
