function numberOrNull(value) {
  // Number(null) and Number('') are both 0, which would turn a debit strategy's
  // credit:null into a real 0 and mislabel it as a "$0 net credit". Reject the
  // empty cases before coercing so null stays null.
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyPerContract(value) {
  const amount = numberOrNull(value);
  return amount == null ? null : Number((amount * 100).toFixed(2));
}

export function toAnalyzeRecommendation(candidateResponse) {
  const candidate = candidateResponse?.status === 'ready' ? candidateResponse.candidate : null;
  if (!candidate) {
    return {
      recommendation: null,
      unavailableReason: candidateResponse?.reason || '策略候选仍在等待可用报价。',
    };
  }

  const credit = moneyPerContract(candidate.credit);
  const debit = moneyPerContract(candidate.debit);
  const maxLoss = candidate.maxLoss == null ? null : moneyPerContract(candidate.maxLoss);
  const shortLeg = candidate.legs?.find(leg => leg.action === 'SELL') || candidate.legs?.[0];
  const pop = candidate.pop?.status === 'available'
    ? Math.round(Number(candidate.pop.probability) * 100)
    : null;

  return {
    unavailableReason: null,
    recommendation: {
      strategy: candidate.strategy,
      reason: candidate.pricing || candidate.summary || `筛选匹配分 ${candidate.score}`,
      directionNote: candidate.directionConflict ? (candidate.directionNote || '与当前趋势方向相反') : null,
      params: {
        pop,
        dte: candidate.dte,
        shortDelta: shortLeg?.delta == null ? '--' : Math.abs(Number(shortLeg.delta)).toFixed(2),
        premiumLabel: credit == null ? '每份合约成本' : '每份合约净信用额',
        premium: credit ?? debit,
        maxLoss,
      },
      legs: (candidate.legs || []).map(leg => ({
        dir: leg.action === 'BUY' ? 1 : -1,
        label: `${leg.right === 'C' ? 'CALL' : 'PUT'} ${leg.strike}`,
        deltaTarget: leg.delta == null ? '--' : Math.abs(Number(leg.delta)).toFixed(2),
        dte: leg.dte,
      })),
    },
  };
}
