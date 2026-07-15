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
export const ACTIONABLE_STRATEGIES = [
  'Iron Condor',
  'Bull Put Spread',
  'Bear Call Spread',
  'Long Straddle',
];

function contractMid(contract) {
  if (contract.bid == null || contract.ask == null) return null;
  return (contract.bid + contract.ask) / 2;
}

function spreadPct(contract) {
  const mid = contractMid(contract);
  if (mid == null || mid <= 0 || contract.ask < contract.bid) return null;
  return ((contract.ask - contract.bid) / mid) * 100;
}

export function normalizeContracts(rawContracts) {
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
  return [...candidates].sort((a, b) => b.score - a.score || b.returnOnRisk - a.returnOnRisk)[0] || null;
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

function missingSetup(rules, candidate = null) {
  return {
    status: 'missing',
    summary: candidate ? '候选结构质量不足' : '没有满足条件的完整候选单',
    reason: candidate
      ? `综合机会分 ${candidate.score}，低于最低门槛 ${MIN_ACTIONABLE_SCORE}`
      : `${rules.dteMin}-${rules.dteMax} DTE、Delta ${rules.deltaMin.toFixed(2)}-${rules.deltaMax.toFixed(2)}、spread ≤ ${rules.maxSpreadPct}%、每腿 OI ≥ ${rules.minContractOi}`,
  };
}

export function buildActionableSetups(rawContracts, row, overrides = {}, strategies = ACTIONABLE_STRATEGIES) {
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

  return candidates
    .filter(candidate => candidate.score >= MIN_ACTIONABLE_SCORE)
    .sort((a, b) => b.score - a.score || (b.returnOnRisk ?? 0) - (a.returnOnRisk ?? 0));
}

export function buildActionableSetup(strategy, rawContracts, row, overrides = {}) {
  const contracts = normalizeContracts(rawContracts);
  if (!contracts.length) {
    return { status: 'missing', summary: '没有可报价合约', reason: '期权链待采集或 bid/ask 不完整' };
  }
  const spot = num(row.price_close);
  if (spot == null || spot <= 0) {
    return { status: 'missing', summary: '缺少标的现价', reason: '无法判断 OTM strike 或计算盈亏平衡点' };
  }
  const rules = selectionRules(overrides);
  const allCandidates = buildActionableSetups(rawContracts, row, overrides, [strategy]);
  const candidate = bestCandidate(allCandidates);
  return candidate || missingSetup(rules);
}
