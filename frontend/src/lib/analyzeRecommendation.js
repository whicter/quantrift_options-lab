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

/**
 * The payoff half of a side, so probability is never rendered alone.
 *
 * A long option's POP is measured at strike + premium and is therefore
 * structurally sub-50% (live SPY/QQQ long calls sit near 33%). Showing that
 * number by itself makes every buyer look like a bad trade regardless of how
 * good its payoff is, which is what the card used to do.
 */
function toPayoff(payoff) {
  if (!payoff || payoff.status !== 'available') return null;
  return {
    rewardRisk: numberOrNull(payoff.reward_risk),
    // A butterfly reaches its maximum only AT the body strike (probability ~0)
    // while POP measures the far wider breakeven range, so the ratio must not
    // be shown unqualified beside POP.
    peakRequiresPin: Boolean(payoff.peak_requires_pin),
  };
}

/** One side of the buyer/seller pair, or null when nothing qualified. */
export function toAnalyzeSide(candidate) {
  if (!candidate) return null;
  const credit = moneyPerContract(candidate.credit);
  const debit = moneyPerContract(candidate.debit);
  const isSeller = credit != null;
  return {
    kind: isSeller ? 'seller' : 'buyer',
    // The trade's shape, stated up front so the two POP figures on one card are
    // not read as directly comparable.
    shapeLabel: isSeller ? '高胜率 · 有限赔付' : '低胜率 · 高赔付',
    strategy: candidate.strategy,
    structure: candidate.structure || candidate.summary || null,
    dte: candidate.dte,
    pop: candidate.pop?.status === 'available'
      ? Math.round(Number(candidate.pop.probability) * 100)
      : null,
    payoff: toPayoff(candidate.payoff),
    premiumLabel: isSeller ? '每份合约净信用额' : '每份合约成本',
    premium: credit ?? debit,
    maxLoss: candidate.maxLoss == null ? null : moneyPerContract(candidate.maxLoss),
    directionNote: candidate.directionConflict ? '与当前趋势方向不一致，请注意方向风险。' : null,
    legs: (candidate.legs || []).map(leg => ({
      dir: leg.action === 'BUY' ? 1 : -1,
      label: `${leg.right === 'C' ? 'CALL' : 'PUT'} ${leg.strike}`,
      deltaTarget: leg.delta == null ? '--' : Math.abs(Number(leg.delta)).toFixed(2),
      dte: leg.dte,
    })),
  };
}

export function toAnalyzeRecommendation(candidateResponse) {
  const candidate = candidateResponse?.status === 'ready' ? candidateResponse.candidate : null;
  if (!candidate) {
    return {
      recommendation: null,
      buyer: null,
      seller: null,
      environment: null,
      unavailableReason: '当前没有可用的策略候选。',
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
    // Both sides travel together. Either may legitimately be null (no
    // qualifying legs on that side); the card says so rather than padding.
    buyer: toAnalyzeSide(candidateResponse.buyer),
    seller: toAnalyzeSide(candidateResponse.seller),
    // The stated view of the environment -- the only legitimate source of edge,
    // since price-derived expected value is ~0 by construction.
    environment: candidateResponse.environment?.status === 'available'
      ? {
        premium: candidateResponse.environment.premium,
        favours: candidateResponse.environment.favours,
        signalsAgree: candidateResponse.environment.signalsAgree,
      }
      : null,
    // Only a structure that actually holds is surfaced. `weak`, `absent` and
    // `unavailable` are all withheld rather than shown as a hedged claim: a
    // half-met structure presented at all would read as a signal, and the
    // caveat is only meaningful attached to a positive detection.
    structure: candidateResponse.structure?.status === 'present'
      ? {
        favours: candidateResponse.structure.favours ?? null,
      }
      : null,
    recommendation: {
      strategy: candidate.strategy,
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
