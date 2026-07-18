function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `$${value.toFixed(2)}`;
}

function formatContractDollars(value) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `$${Math.round(value * 100).toLocaleString('en-US')}`;
}

const MIN_ACTIONABLE_SCORE = 50;
const ACTIONABLE_STRATEGIES = [
  'Iron Condor',
  'Bull Put Spread',
  'Bear Call Spread',
  'Long Straddle',
  'Short Strangle',
  'Iron Butterfly',
  'Calendar Spread',
  'Diagonal Spread',
  'Long Call',
  'Long Put',
  'Jade Lizard',
  'Short Put',
  'Short Call',
];

const ADVANCED_RISK_STRATEGIES = ['Short Strangle', 'Short Put', 'Short Call'];

// Directional stance of each strategy, used to weight candidates by the market
// environment so a bull regime does not surface a Long Put as its top pick.
// 'bullish'/'bearish' profit when the underlying rises/falls; 'neutral' profits
// from range/time; 'vol_long' profits from a large move in either direction.
const STRATEGY_STANCE = {
  'Bull Put Spread': 'bullish',
  'Long Call': 'bullish',
  'Short Put': 'bullish',
  'Jade Lizard': 'bullish',
  'Bear Call Spread': 'bearish',
  'Long Put': 'bearish',
  'Short Call': 'bearish',
  'Iron Condor': 'neutral',
  'Iron Butterfly': 'neutral',
  'Short Strangle': 'neutral',
  'Calendar Spread': 'neutral',
  'Diagonal Spread': 'neutral',
  'Long Straddle': 'vol_long',
};

/**
 * Directional weight for a candidate given the market environment. Returns a
 * score multiplier and, when the strategy fights the trend, a conflict flag +
 * label so the UI can show it rather than silently drop it.
 *
 * environment = { trendRegime: 'bull'|'bear'|'neutral', gammaRegime, ivRank }.
 * Absent or partial environment leaves scoring unchanged (weight 1), which keeps
 * callers that pass no environment byte-for-byte identical.
 */
function directionalWeight(strategy, environment) {
  if (!environment || !environment.trendRegime) return { weight: 1, conflict: false, note: null };
  const stance = STRATEGY_STANCE[strategy] || 'neutral';
  const trend = environment.trendRegime;
  const ivRank = num(environment.ivRank);
  let weight = 1;
  let conflict = false;
  let note = null;

  if (trend === 'bull') {
    if (stance === 'bullish') weight *= 1.15;
    else if (stance === 'bearish') { weight *= 0.3; conflict = true; note = '与当前多头趋势方向相反'; }
  } else if (trend === 'bear') {
    if (stance === 'bearish') weight *= 1.15;
    else if (stance === 'bullish') { weight *= 0.3; conflict = true; note = '与当前空头趋势方向相反'; }
  } else if (trend === 'neutral' && stance === 'neutral') {
    weight *= 1.1;
  }

  // IV rank tilts premium-selling vs premium-buying. High IV favors credit
  // (short-premium) structures; low IV favors debit (long-premium) ones.
  if (ivRank != null) {
    const shortPremium = ['Bull Put Spread', 'Bear Call Spread', 'Iron Condor', 'Iron Butterfly', 'Short Strangle', 'Short Put', 'Short Call', 'Jade Lizard'].includes(strategy);
    const longPremium = ['Long Call', 'Long Put', 'Long Straddle', 'Calendar Spread', 'Diagonal Spread'].includes(strategy);
    if (ivRank >= 60 && shortPremium) weight *= 1.1;
    else if (ivRank <= 30 && longPremium) weight *= 1.1;
    else if (ivRank >= 60 && longPremium) weight *= 0.9;
  }

  return { weight, conflict, note };
}
const POP_MODEL_VERSION = 'pop-v1-lognormal-breakeven';
const EXPECTED_MOVE_MODEL_VERSION = 'expected-move-v1-atm-iv-sqrt-time';
const configuredRiskFreeRate = Number(process.env.SCAN_RISK_FREE_RATE ?? 0.045);
const RISK_FREE_RATE = Number.isFinite(configuredRiskFreeRate) ? configuredRiskFreeRate : 0.045;

function contractMid(contract) {
  if (contract.bid == null || contract.ask == null) return null;
  return (contract.bid + contract.ask) / 2;
}

function spreadPct(contract) {
  const mid = contractMid(contract);
  if (mid == null || mid <= 0 || contract.ask < contract.bid) return null;
  return ((contract.ask - contract.bid) / mid) * 100;
}

function normalizeContracts(rawContracts) {
  if (!Array.isArray(rawContracts)) return [];
  return rawContracts
    .map(contract => ({
      expiry: contract.expiry ? String(contract.expiry).slice(0, 10) : null,
      dte: num(contract.dte),
      strike: num(contract.strike),
      right: String(contract.right || '').toUpperCase(),
      bid: num(contract.bid),
      ask: num(contract.ask),
      mark: num(contract.mark),
      volume: num(contract.volume) ?? 0,
      openInterest: num(contract.openInterest) ?? 0,
      delta: num(contract.delta),
      gamma: num(contract.gamma),
      iv: num(contract.iv),
      contractSymbol: contract.contractSymbol,
    }))
    .filter(contract => (
      contract.expiry
      && contract.strike != null
      && contract.dte != null
      && contract.dte >= 0
      && ['C', 'P'].includes(contract.right)
      && contract.bid != null
      && contract.ask != null
      && contract.bid >= 0
      && contract.ask > 0
      && contract.ask >= contract.bid
    ));
}

function groupedByExpiry(contracts) {
  const groups = new Map();
  for (const contract of contracts) {
    if (!groups.has(contract.expiry)) groups.set(contract.expiry, []);
    groups.get(contract.expiry).push(contract);
  }
  return [...groups.values()].sort((a, b) => a[0].dte - b[0].dte);
}

function selectionRules(overrides = {}) {
  const unrestricted = [
    overrides.dteMin,
    overrides.dteMax,
    overrides.deltaMin,
    overrides.deltaMax,
    overrides.maxSpreadPct,
    overrides.minContractOi,
    overrides.minContractVolume,
  ].every(value => num(value) == null);
  const dteMin = num(overrides.dteMin) ?? 1;
  const dteMax = num(overrides.dteMax) ?? 90;
  const deltaMin = num(overrides.deltaMin) ?? 0.05;
  const deltaMax = num(overrides.deltaMax) ?? 0.50;
  return {
    dteMin,
    dteMax,
    targetDte: unrestricted ? 45 : (dteMin + dteMax) / 2,
    deltaMin,
    deltaMax,
    targetDelta: unrestricted ? 0.20 : (deltaMin + deltaMax) / 2,
    maxSpreadPct: num(overrides.maxSpreadPct) ?? 25,
    minContractOi: num(overrides.minContractOi) ?? 10,
    minContractVolume: num(overrides.minContractVolume) ?? 0,
    allowUndefinedRisk: overrides.allowUndefinedRisk === true,
  };
}

function contractEligible(contract, rules, { requireDelta = true } = {}) {
  const spread = spreadPct(contract);
  const absDelta = contract.delta == null ? null : Math.abs(contract.delta);
  return (
    contract.dte >= rules.dteMin
    && contract.dte <= rules.dteMax
    && spread != null
    && spread <= rules.maxSpreadPct
    && contract.openInterest >= rules.minContractOi
    && contract.volume >= rules.minContractVolume
    && (!requireDelta || (
      absDelta != null
      && absDelta >= rules.deltaMin
      && absDelta <= rules.deltaMax
    ))
  );
}

function scoreCandidate(candidate, rules) {
  const dteFit = Math.max(0, 25 - Math.abs(candidate.dte - rules.targetDte) * 0.9);
  const deltaFit = candidate.shortDelta == null
    ? 12
    : Math.max(0, 25 - Math.abs(candidate.shortDelta - rules.targetDelta) * 120);
  const spreadFit = Math.max(0, 20 * (1 - candidate.avgSpreadPct / Math.max(rules.maxSpreadPct, 1)));
  const oiFit = Math.min(15, Math.log10(candidate.minOpenInterest + 1) * 4);
  const volumeFit = Math.min(5, Math.log10(candidate.totalVolume + 1) * 1.5);
  const economicsFit = candidate.returnOnRisk == null
    ? 5
    : Math.min(10, Math.max(0, candidate.returnOnRisk) * 35);
  return Math.max(0, Math.min(100, Math.round(dteFit + deltaFit + spreadFit + oiFit + volumeFit + economicsFit)));
}

function candidateQuality(legs) {
  const spreads = legs.map(spreadPct).filter(value => value != null);
  return {
    avgSpreadPct: spreads.length ? spreads.reduce((sum, value) => sum + value, 0) / spreads.length : Infinity,
    minOpenInterest: Math.min(...legs.map(leg => leg.openInterest)),
    totalVolume: legs.reduce((sum, leg) => sum + leg.volume, 0),
  };
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

function expectedMoveForExpiry(contracts, spot, expiry, dte) {
  const expiryContracts = contracts.filter(contract => contract.expiry === expiry && contract.iv != null && contract.iv > 0);
  const nearest = right => expiryContracts
    .filter(contract => contract.right === right)
    .sort((left, rightContract) => Math.abs(left.strike - spot) - Math.abs(rightContract.strike - spot))[0] || null;
  const call = nearest('C');
  const put = nearest('P');
  if (!call || !put || dte == null || dte <= 0) {
    return {
      status: 'unavailable', model_version: EXPECTED_MOVE_MODEL_VERSION,
      reason: 'requires_same_expiry_atm_call_put_iv_and_positive_calendar_dte',
      method: 'iv_sqrt_time', time_convention: 'calendar_days',
    };
  }
  const iv = (call.iv + put.iv) / 2;
  const expectedMove = spot * iv * Math.sqrt(dte / 365);
  return {
    status: 'available', model_version: EXPECTED_MOVE_MODEL_VERSION,
    method: 'iv_sqrt_time', iv_input: 'nearest_atm_call_put_mean', price_input: 'contract_iv',
    time_convention: 'calendar_days', expiry, dte, iv, expected_move: expectedMove,
    standard_deviation: 1,
    lower: spot - expectedMove, upper: spot + expectedMove,
    atm_contracts: [call.contractSymbol || null, put.contractSymbol || null],
  };
}

function expiryCdf(price, spot, iv, dte) {
  if (price == null || price <= 0 || spot <= 0 || iv <= 0 || dte <= 0) return null;
  const time = dte / 365;
  const denominator = iv * Math.sqrt(time);
  const z = (Math.log(price / spot) - (RISK_FREE_RATE - 0.5 * iv * iv) * time) / denominator;
  return normalCdf(z);
}

function popForCandidate(candidate, spot, expectedMove) {
  const base = {
    model_version: POP_MODEL_VERSION,
    status: 'unavailable',
    distribution: 'lognormal_risk_neutral',
    pricing_input: 'executable_bid_ask',
    iv_input: expectedMove.iv_input || null,
    rate: RISK_FREE_RATE,
    dividend_yield: 0,
    time_convention: 'calendar_days',
    expiry: candidate.expiry,
    dte: candidate.dte,
    breakevens: candidate.breakevens || [],
  };
  if (expectedMove.status !== 'available') return { ...base, reason: 'expected_move_unavailable' };
  const breakevens = candidate.breakevens || [];
  if (!breakevens.length || ['Calendar Spread', 'Diagonal Spread'].includes(candidate.strategy)) {
    return { ...base, reason: 'strategy_has_no_static_expiry_breakeven_model' };
  }
  const below = price => expiryCdf(price, spot, expectedMove.iv, candidate.dte);
  let probability = null;
  if (['Bear Call Spread', 'Long Put', 'Short Call'].includes(candidate.strategy)) probability = below(breakevens[0]);
  if (['Bull Put Spread', 'Long Call', 'Short Put', 'Jade Lizard'].includes(candidate.strategy)) probability = 1 - below(breakevens[0]);
  if (['Iron Condor', 'Iron Butterfly', 'Short Strangle'].includes(candidate.strategy) && breakevens.length === 2) {
    probability = below(Math.max(...breakevens)) - below(Math.min(...breakevens));
  }
  if (candidate.strategy === 'Long Straddle' && breakevens.length === 2) {
    probability = 1 - (below(Math.max(...breakevens)) - below(Math.min(...breakevens)));
  }
  if (probability == null || !Number.isFinite(probability)) return { ...base, reason: 'unsupported_strategy_payoff_shape' };
  return { ...base, status: 'available', probability: Math.max(0, Math.min(1, probability)) };
}

function attachResearchModels(candidate, contracts, spot) {
  const expectedMove = expectedMoveForExpiry(contracts, spot, candidate.expiry, candidate.dte);
  return { ...candidate, expectedMove, pop: popForCandidate(candidate, spot, expectedMove) };
}

function candidateEconomics({ credit = null, debit = null, maxLoss = null, returnOnRisk = null }) {
  if (credit != null && maxLoss != null) {
    return `Credit ${formatContractDollars(credit)} · Max loss ${formatContractDollars(maxLoss)} · RoR ${(returnOnRisk * 100).toFixed(1)}%`;
  }
  if (credit != null) return `Credit ${formatContractDollars(credit)} · Risk undefined`;
  return `Debit ${formatContractDollars(debit)} · Max loss ${formatContractDollars(maxLoss)}`;
}

function formatLeg(leg) {
  const price = leg.action === 'SELL' ? leg.bid : leg.ask;
  return `${leg.action === 'SELL' ? 'Sell' : 'Buy'} ${leg.expiry.slice(5)} ${leg.strike}${leg.right} @ ${formatMoney(price)}`;
}

function finishCandidate(strategy, candidate, structure, extraPricing = '') {
  return {
    ...candidate,
    strategy,
    summary: `到期 ${candidate.expiry} · ${candidate.dte} DTE`,
    structure,
    pricing: `${candidateEconomics(candidate)}${extraPricing}`,
    legLabels: candidate.legs.map(formatLeg),
  };
}

function verticalCandidates({ side, contracts, spot, wall, rules }) {
  const candidates = [];
  for (const group of groupedByExpiry(contracts.filter(contract => contract.right === side))) {
    const sorted = [...group].sort((a, b) => a.strike - b.strike);
    for (let index = 0; index < sorted.length; index += 1) {
      const shortLeg = sorted[index];
      if (!contractEligible(shortLeg, rules)) continue;
      if (side === 'C' && shortLeg.strike < Math.max(spot, wall ?? spot)) continue;
      if (side === 'P' && shortLeg.strike > Math.min(spot, wall ?? spot)) continue;

      const longLeg = side === 'C' ? sorted[index + 1] : sorted[index - 1];
      if (!longLeg || !contractEligible(longLeg, rules, { requireDelta: false })) continue;

      const credit = shortLeg.bid - longLeg.ask;
      const width = Math.abs(longLeg.strike - shortLeg.strike);
      const maxLoss = width - credit;
      if (credit <= 0 || width <= 0 || maxLoss <= 0) continue;

      const quality = candidateQuality([shortLeg, longLeg]);
      const candidate = {
        status: 'ready',
        expiry: shortLeg.expiry,
        dte: shortLeg.dte,
        credit,
        debit: null,
        maxLoss,
        returnOnRisk: credit / maxLoss,
        breakevens: [side === 'C' ? shortLeg.strike + credit : shortLeg.strike - credit],
        shortDelta: Math.abs(shortLeg.delta),
        ...quality,
        legs: [
          { action: 'SELL', ...shortLeg },
          { action: 'BUY', ...longLeg },
        ],
      };
      candidate.score = scoreCandidate(candidate, rules);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function bestCandidate(candidates) {
  return [...candidates].sort((a, b) => (b.effectiveScore ?? b.score) - (a.effectiveScore ?? a.score) || b.returnOnRisk - a.returnOnRisk)[0] || null;
}

function formatVerticalCandidate(strategy, candidate) {
  const side = strategy === 'Bear Call Spread' ? 'C' : 'P';
  const [shortLeg, longLeg] = candidate.legs;
  return {
    ...candidate,
    strategy,
    summary: `到期 ${candidate.expiry} · ${candidate.dte} DTE`,
    structure: `Sell ${shortLeg.strike}${side} / Buy ${longLeg.strike}${side}`,
    pricing: `Net credit ${formatContractDollars(candidate.credit)} · Max loss ${formatContractDollars(candidate.maxLoss)} · RoR ${(candidate.returnOnRisk * 100).toFixed(1)}% · BE ${formatMoney(candidate.breakevens[0])}`,
    legLabels: [
      `Sell ${shortLeg.strike}${side} @ ${formatMoney(shortLeg.bid)} · Δ ${Math.abs(shortLeg.delta).toFixed(2)}`,
      `Buy ${longLeg.strike}${side} @ ${formatMoney(longLeg.ask)}`,
    ],
  };
}

function allVerticalSetups(strategy, contracts, spot, callWall, putWall, rules) {
  const side = strategy === 'Bear Call Spread' ? 'C' : 'P';
  return verticalCandidates({
    side,
    contracts,
    spot,
    wall: side === 'C' ? callWall : putWall,
    rules,
  }).map(candidate => formatVerticalCandidate(strategy, candidate));
}

function allIronCondorSetups(contracts, spot, callWall, putWall, rules) {
  const puts = verticalCandidates({ side: 'P', contracts, spot, wall: putWall, rules });
  const calls = verticalCandidates({ side: 'C', contracts, spot, wall: callWall, rules });
  const candidates = [];
  for (const put of puts) {
    for (const call of calls) {
      if (put.expiry !== call.expiry) continue;
      const totalCredit = put.credit + call.credit;
      const maxLoss = Math.max(put.maxLoss + put.credit, call.maxLoss + call.credit) - totalCredit;
      if (maxLoss <= 0) continue;
      const legs = [...put.legs, ...call.legs];
      const quality = candidateQuality(legs);
      const candidate = {
        status: 'ready',
        expiry: put.expiry,
        dte: put.dte,
        credit: totalCredit,
        debit: null,
        maxLoss,
        returnOnRisk: totalCredit / maxLoss,
        breakevens: [put.breakevens[0], call.breakevens[0]],
        shortDelta: (put.shortDelta + call.shortDelta) / 2,
        ...quality,
        legs,
      };
      candidate.score = scoreCandidate(candidate, rules);
      candidates.push(candidate);
    }
  }
  return candidates.map(candidate => {
    const [shortPut, longPut, shortCall, longCall] = candidate.legs;
    return {
      ...candidate,
      strategy: 'Iron Condor',
      summary: `到期 ${candidate.expiry} · ${candidate.dte} DTE`,
      structure: `${shortPut.strike}/${longPut.strike}P + ${shortCall.strike}/${longCall.strike}C`,
      pricing: `Net credit ${formatContractDollars(candidate.credit)} · Max loss ${formatContractDollars(candidate.maxLoss)} · RoR ${(candidate.returnOnRisk * 100).toFixed(1)}% · BE ${formatMoney(candidate.breakevens[0])}/${formatMoney(candidate.breakevens[1])}`,
      legLabels: candidate.legs.map(leg => `${leg.action === 'SELL' ? 'Sell' : 'Buy'} ${leg.strike}${leg.right} @ ${formatMoney(leg.action === 'SELL' ? leg.bid : leg.ask)}`),
    };
  });
}

function allStraddleSetups(contracts, spot, rules) {
  const candidates = [];
  for (const group of groupedByExpiry(contracts)) {
    const calls = group.filter(contract => contract.right === 'C');
    const puts = group.filter(contract => contract.right === 'P');
    for (const call of calls) {
      const put = puts.find(item => item.strike === call.strike);
      if (!put) continue;
      if (!contractEligible(call, rules, { requireDelta: false }) || !contractEligible(put, rules, { requireDelta: false })) continue;
      const debit = call.ask + put.ask;
      if (debit <= 0) continue;
      const quality = candidateQuality([call, put]);
      const distancePct = Math.abs(call.strike - spot) / spot * 100;
      const candidate = {
        status: 'ready',
        expiry: call.expiry,
        dte: call.dte,
        credit: null,
        debit,
        maxLoss: debit,
        returnOnRisk: null,
        breakevens: [call.strike - debit, call.strike + debit],
        shortDelta: null,
        ...quality,
        legs: [{ action: 'BUY', ...call }, { action: 'BUY', ...put }],
      };
      candidate.score = Math.max(0, scoreCandidate(candidate, rules) - Math.round(distancePct * 4));
      candidates.push(candidate);
    }
  }
  return candidates.map(candidate => {
    const [call, put] = candidate.legs;
    return {
      ...candidate,
      strategy: 'Long Straddle',
      summary: `到期 ${candidate.expiry} · ${candidate.dte} DTE`,
      structure: `Buy ${call.strike}C + ${put.strike}P`,
      pricing: `Net debit ${formatContractDollars(candidate.debit)} · Max loss ${formatContractDollars(candidate.maxLoss)} · BE ${formatMoney(candidate.breakevens[0])}/${formatMoney(candidate.breakevens[1])}`,
      legLabels: [
        `Buy ${call.strike}C @ ${formatMoney(call.ask)}`,
        `Buy ${put.strike}P @ ${formatMoney(put.ask)}`,
      ],
    };
  });
}

function allSingleLegSetups(strategy, contracts, spot, rules) {
  const right = strategy.endsWith('Call') ? 'C' : 'P';
  const isShort = strategy.startsWith('Short');
  if (isShort && !rules.allowUndefinedRisk) return [];

  return contracts
    .filter(contract => contract.right === right && contractEligible(contract, rules))
    .filter(contract => (right === 'C' ? contract.strike >= spot : contract.strike <= spot))
    .map(contract => {
      const premium = isShort ? contract.bid : contract.ask;
      if (premium <= 0) return null;
      const credit = isShort ? premium : null;
      const debit = isShort ? null : premium;
      const maxLoss = isShort
        ? (right === 'P' ? Math.max(0, contract.strike - credit) : null)
        : debit;
      const returnOnRisk = credit != null && maxLoss ? credit / maxLoss : null;
      const candidate = {
        status: 'ready',
        expiry: contract.expiry,
        dte: contract.dte,
        credit,
        debit,
        maxLoss,
        returnOnRisk,
        breakevens: [right === 'C' ? contract.strike + premium : contract.strike - premium],
        shortDelta: isShort ? Math.abs(contract.delta) : null,
        riskType: isShort ? 'advanced' : 'defined',
        ...candidateQuality([contract]),
        legs: [{ action: isShort ? 'SELL' : 'BUY', ...contract }],
      };
      candidate.score = scoreCandidate(candidate, rules);
      return finishCandidate(
        strategy,
        candidate,
        `${isShort ? 'Sell' : 'Buy'} ${contract.strike}${right}`,
        ` · BE ${formatMoney(candidate.breakevens[0])}`,
      );
    })
    .filter(Boolean);
}

function allShortStrangleSetups(contracts, spot, rules) {
  if (!rules.allowUndefinedRisk) return [];
  const candidates = [];
  for (const group of groupedByExpiry(contracts)) {
    const calls = group.filter(contract => contract.right === 'C' && contract.strike > spot && contractEligible(contract, rules));
    const puts = group.filter(contract => contract.right === 'P' && contract.strike < spot && contractEligible(contract, rules));
    for (const call of calls) {
      for (const put of puts) {
        const credit = call.bid + put.bid;
        if (credit <= 0) continue;
        const candidate = {
          status: 'ready', expiry: call.expiry, dte: call.dte,
          credit, debit: null, maxLoss: null, returnOnRisk: null,
          breakevens: [put.strike - credit, call.strike + credit],
          shortDelta: (Math.abs(call.delta) + Math.abs(put.delta)) / 2,
          riskType: 'undefined',
          ...candidateQuality([put, call]),
          legs: [{ action: 'SELL', ...put }, { action: 'SELL', ...call }],
        };
        candidate.score = scoreCandidate(candidate, rules);
        candidates.push(finishCandidate(
          'Short Strangle', candidate,
          `Sell ${put.strike}P + ${call.strike}C`,
          ` · BE ${formatMoney(candidate.breakevens[0])}/${formatMoney(candidate.breakevens[1])}`,
        ));
      }
    }
  }
  return candidates;
}

function allIronButterflySetups(contracts, spot, rules) {
  const candidates = [];
  for (const group of groupedByExpiry(contracts)) {
    const calls = group.filter(contract => contract.right === 'C');
    const puts = group.filter(contract => contract.right === 'P');
    const bodies = calls
      .filter(call => puts.some(put => put.strike === call.strike))
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
    for (const bodyCall of bodies) {
      const bodyPut = puts.find(put => put.strike === bodyCall.strike);
      if (!contractEligible(bodyCall, rules, { requireDelta: false }) || !contractEligible(bodyPut, rules, { requireDelta: false })) continue;
      for (const longCall of calls.filter(call => call.strike > bodyCall.strike)) {
        const width = longCall.strike - bodyCall.strike;
        const longPut = puts.find(put => put.strike === bodyCall.strike - width);
        if (!longPut) continue;
        if (!contractEligible(longCall, rules, { requireDelta: false }) || !contractEligible(longPut, rules, { requireDelta: false })) continue;
        const credit = bodyCall.bid + bodyPut.bid - longCall.ask - longPut.ask;
        const maxLoss = width - credit;
        if (credit <= 0 || maxLoss <= 0) continue;
        const legs = [
          { action: 'BUY', ...longPut }, { action: 'SELL', ...bodyPut },
          { action: 'SELL', ...bodyCall }, { action: 'BUY', ...longCall },
        ];
        const candidate = {
          status: 'ready', expiry: bodyCall.expiry, dte: bodyCall.dte,
          credit, debit: null, maxLoss, returnOnRisk: credit / maxLoss,
          breakevens: [bodyCall.strike - credit, bodyCall.strike + credit],
          shortDelta: (Math.abs(bodyCall.delta) + Math.abs(bodyPut.delta)) / 2,
          riskType: 'defined', ...candidateQuality(legs), legs,
        };
        candidate.score = scoreCandidate(candidate, rules) - Math.min(20, Math.round(Math.abs(bodyCall.strike - spot) / spot * 100 * 4));
        candidates.push(finishCandidate(
          'Iron Butterfly', candidate,
          `${longPut.strike}/${bodyCall.strike}/${longCall.strike} Iron Fly`,
          ` · BE ${formatMoney(candidate.breakevens[0])}/${formatMoney(candidate.breakevens[1])}`,
        ));
      }
    }
  }
  return candidates;
}

function allCalendarSetups(contracts, spot, rules) {
  const candidates = [];
  for (const right of ['C', 'P']) {
    const side = contracts.filter(contract => contract.right === right && contractEligible(contract, rules, { requireDelta: false }));
    for (const near of side) {
      for (const far of side) {
        if (far.dte <= near.dte || far.strike !== near.strike) continue;
        if (Math.abs(near.strike - spot) / spot > 0.1) continue;
        const debit = far.ask - near.bid;
        if (debit <= 0) continue;
        const legs = [{ action: 'SELL', ...near }, { action: 'BUY', ...far }];
        const candidate = {
          status: 'ready', expiry: near.expiry, dte: near.dte,
          farExpiry: far.expiry, farDte: far.dte,
          credit: null, debit, maxLoss: debit, returnOnRisk: null,
          breakevens: [], shortDelta: null, riskType: 'defined',
          ...candidateQuality(legs), legs,
        };
        candidate.score = scoreCandidate(candidate, rules);
        candidates.push(finishCandidate(
          'Calendar Spread', candidate,
          `Sell ${near.expiry.slice(5)} / Buy ${far.expiry.slice(5)} ${near.strike}${right}`,
        ));
      }
    }
  }
  return candidates;
}

function allDiagonalSetups(contracts, spot, rules) {
  const candidates = [];
  for (const right of ['C', 'P']) {
    const side = contracts.filter(contract => contract.right === right && contractEligible(contract, rules, { requireDelta: false }));
    for (const near of side) {
      const nearIsOtm = right === 'C' ? near.strike > spot : near.strike < spot;
      if (!nearIsOtm) continue;
      for (const far of side) {
        if (far.dte <= near.dte || far.strike === near.strike) continue;
        const farCloserToSpot = Math.abs(far.strike - spot) < Math.abs(near.strike - spot);
        if (!farCloserToSpot) continue;
        const debit = far.ask - near.bid;
        if (debit <= 0) continue;
        const legs = [{ action: 'SELL', ...near }, { action: 'BUY', ...far }];
        const width = Math.abs(near.strike - far.strike);
        const maxLoss = debit;
        const candidate = {
          status: 'ready', expiry: near.expiry, dte: near.dte,
          farExpiry: far.expiry, farDte: far.dte,
          credit: null, debit, maxLoss, returnOnRisk: null,
          breakevens: [], shortDelta: Math.abs(near.delta), riskType: 'defined',
          ...candidateQuality(legs), legs,
        };
        candidate.score = scoreCandidate(candidate, rules) + Math.min(8, Math.round(width / spot * 100));
        candidates.push(finishCandidate(
          'Diagonal Spread', candidate,
          `Sell ${near.expiry.slice(5)} ${near.strike}${right} / Buy ${far.expiry.slice(5)} ${far.strike}${right}`,
        ));
      }
    }
  }
  return candidates;
}

function allJadeLizardSetups(contracts, spot, callWall, putWall, rules) {
  const puts = contracts.filter(contract => contract.right === 'P' && contract.strike < spot && contractEligible(contract, rules));
  const callSpreads = verticalCandidates({ side: 'C', contracts, spot, wall: callWall, rules });
  const candidates = [];
  for (const shortPut of puts) {
    for (const callSpread of callSpreads) {
      if (shortPut.expiry !== callSpread.expiry) continue;
      const callWidth = Math.abs(callSpread.legs[1].strike - callSpread.legs[0].strike);
      const credit = shortPut.bid + callSpread.credit;
      if (credit < callWidth) continue;
      const maxLoss = shortPut.strike - credit;
      if (maxLoss <= 0) continue;
      const legs = [{ action: 'SELL', ...shortPut }, ...callSpread.legs];
      const candidate = {
        status: 'ready', expiry: shortPut.expiry, dte: shortPut.dte,
        credit, debit: null, maxLoss, returnOnRisk: credit / maxLoss,
        breakevens: [shortPut.strike - credit],
        shortDelta: (Math.abs(shortPut.delta) + callSpread.shortDelta) / 2,
        riskType: 'defined-upside', ...candidateQuality(legs), legs,
      };
      candidate.score = scoreCandidate(candidate, rules);
      candidates.push(finishCandidate(
        'Jade Lizard', candidate,
        `Sell ${shortPut.strike}P + ${callSpread.legs[0].strike}/${callSpread.legs[1].strike}C`,
        ` · Downside BE ${formatMoney(candidate.breakevens[0])}`,
      ));
    }
  }
  return candidates;
}

function missingSetup(rules, candidate = null) {
  return {
    status: 'missing',
    summary: candidate ? '候选结构质量不足' : '没有满足条件的完整候选单',
    reason: candidate
      ? `综合机会分 ${candidate.score}，低于最低门槛 ${MIN_ACTIONABLE_SCORE}`
      : `${rules.dteMin}-${rules.dteMax} DTE、Delta ${rules.deltaMin.toFixed(2)}-${rules.deltaMax.toFixed(2)}、spread ≤ ${rules.maxSpreadPct}%、每腿 OI ≥ ${rules.minContractOi}`,
  };
}

function buildActionableSetups(rawContracts, row, overrides = {}, strategies = ACTIONABLE_STRATEGIES, environment = null) {
  const contracts = normalizeContracts(rawContracts);
  const spot = num(row.price_close);
  if (!contracts.length || spot == null || spot <= 0) return [];

  const rules = selectionRules(overrides);
  const callWall = num(row.call_wall);
  const putWall = num(row.put_wall);
  const requested = new Set(strategies);
  const candidates = [];
  if (requested.has('Bear Call Spread')) candidates.push(...allVerticalSetups('Bear Call Spread', contracts, spot, callWall, putWall, rules));
  if (requested.has('Bull Put Spread')) candidates.push(...allVerticalSetups('Bull Put Spread', contracts, spot, callWall, putWall, rules));
  if (requested.has('Iron Condor')) candidates.push(...allIronCondorSetups(contracts, spot, callWall, putWall, rules));
  if (requested.has('Long Straddle')) candidates.push(...allStraddleSetups(contracts, spot, rules));
  if (requested.has('Short Strangle')) candidates.push(...allShortStrangleSetups(contracts, spot, rules));
  if (requested.has('Iron Butterfly')) candidates.push(...allIronButterflySetups(contracts, spot, rules));
  if (requested.has('Calendar Spread')) candidates.push(...allCalendarSetups(contracts, spot, rules));
  if (requested.has('Diagonal Spread')) candidates.push(...allDiagonalSetups(contracts, spot, rules));
  if (requested.has('Long Call')) candidates.push(...allSingleLegSetups('Long Call', contracts, spot, rules));
  if (requested.has('Long Put')) candidates.push(...allSingleLegSetups('Long Put', contracts, spot, rules));
  if (requested.has('Jade Lizard')) candidates.push(...allJadeLizardSetups(contracts, spot, callWall, putWall, rules));
  if (requested.has('Short Put')) candidates.push(...allSingleLegSetups('Short Put', contracts, spot, rules));
  if (requested.has('Short Call')) candidates.push(...allSingleLegSetups('Short Call', contracts, spot, rules));

  return candidates
    .map(candidate => attachResearchModels(candidate, contracts, spot))
    .filter(candidate => candidate.score >= MIN_ACTIONABLE_SCORE)
    .map(candidate => {
      // Directional weighting deprioritizes (but never hides) a candidate that
      // fights the trend. effectiveScore drives ordering; raw score is kept for
      // the score badge and the MIN_ACTIONABLE_SCORE gate above.
      const bias = directionalWeight(candidate.strategy, environment);
      return {
        ...candidate,
        effectiveScore: candidate.score * bias.weight,
        directionConflict: bias.conflict,
        directionNote: bias.note,
      };
    })
    .sort((a, b) => b.effectiveScore - a.effectiveScore || (b.returnOnRisk ?? 0) - (a.returnOnRisk ?? 0));
}

function buildActionableSetup(strategy, rawContracts, row, overrides = {}, environment = null) {
  const contracts = normalizeContracts(rawContracts);
  if (!contracts.length) {
    return { status: 'missing', summary: '没有可报价合约', reason: '期权链待采集或 bid/ask 不完整' };
  }
  const spot = num(row.price_close);
  if (spot == null || spot <= 0) {
    return { status: 'missing', summary: '缺少标的现价', reason: '无法判断 OTM strike 或计算盈亏平衡点' };
  }
  const rules = selectionRules(overrides);
  const allCandidates = buildActionableSetups(rawContracts, row, overrides, [strategy], environment);
  const candidate = bestCandidate(allCandidates);
  return candidate || missingSetup(rules);
}

module.exports = {
  ACTIONABLE_STRATEGIES, ADVANCED_RISK_STRATEGIES, STRATEGY_STANCE, buildActionableSetups, buildActionableSetup,
  directionalWeight, expectedMoveForExpiry, popForCandidate,
};
