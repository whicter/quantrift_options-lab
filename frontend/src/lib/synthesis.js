/**
 * Analyze-page synthesis layer.
 *
 * The Analyze page had every metric on screen but none of them talked to each
 * other: no core conclusion, no cross-signal agreement check, no global-vs-local
 * gamma reading, no attribution of where today's move came from. Competitors
 * ("盘中日报") lead with exactly those. This module is the missing synthesis:
 * pure functions over the already-assembled Analyze `data` object, each with an
 * explicit input/threshold/output so the conclusions are computed, not
 * hand-waved. Everything here is a model reading of public data, never a fact
 * claim about any participant's position, and the copy says so.
 *
 * All functions return { available, ... } and never throw on missing input.
 * Kept in frontend/src/lib (where the Analyze view is still assembled today);
 * it is pure JS with no imports so it moves server-side unchanged when the
 * /summary cutover lands.
 */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactMoney(value) {
  const n = num(value);
  if (n == null) return '--';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * C1 — Global vs local gamma reading (the competitor's "全局 GEX 为负但局部
 * Gamma 转正" line). A 2x2 over the sign of global GEX and the sign of the net
 * GEX inside ±1% of spot, plus a gamma-flip-proximity note.
 */
export function gexEnvironmentConclusion({ globalGex, localGamma, gammaFlip, price } = {}) {
  const g = num(globalGex);
  const l = num(localGamma);
  if (g == null) {
    return { available: false, reason: '缺少全局 GEX，无法给出减震环境结论。' };
  }

  const gPos = g >= 0;
  // Local reading is optional; when absent we fall back to a global-only line.
  const lPos = l == null ? null : l >= 0;
  const gStr = compactMoney(g);
  const lStr = l == null ? null : compactMoney(l);

  let key;
  let text;
  if (lPos == null) {
    key = gPos ? 'global_pos' : 'global_neg';
    text = gPos
      ? `全局 GEX 为正（${gStr}），整体像更强的减震器，波动倾向收敛。`
      : `全局 GEX 为负（${gStr}），整体减震偏弱，波动更容易被放大。`;
  } else if (gPos && lPos) {
    key = 'pos_pos';
    text = `全局与现价附近 Gamma 均为正（全局 ${gStr} / 局部 ${lStr}），双重减震，波动倾向收敛、区间震荡。`;
  } else if (gPos && !lPos) {
    key = 'pos_neg';
    text = `全局 GEX 为正（${gStr}）但现价附近 Gamma 为负（局部 ${lStr}），整体减震、但突破当前区域时波动可能骤增。`;
  } else if (!gPos && lPos) {
    key = 'neg_pos';
    text = `全局 GEX 为负（${gStr}），整体波动容易被放大；但现价附近 Gamma 为正（局部 ${lStr}），当前区域有一定减震效果，暂时压制波动。`;
  } else {
    key = 'neg_neg';
    text = `全局与现价附近 Gamma 均为负（全局 ${gStr} / 局部 ${lStr}），对冲盘顺势，波动最容易被放大。`;
  }

  // Flip proximity: within 1.5% of the gamma-flip level the environment can
  // switch sign on a small move, so flag it regardless of the 2x2 cell.
  const flip = num(gammaFlip);
  const spot = num(price);
  let nearFlip = false;
  if (flip != null && spot != null && spot > 0) {
    const distancePct = Math.abs(spot / flip - 1) * 100;
    if (distancePct <= 1.5) {
      nearFlip = true;
      text += ` 现价距 Gamma 翻转位约 ${distancePct.toFixed(1)}%，环境可能随小幅波动切换。`;
    }
  }

  return {
    available: true,
    key,
    globalRegime: gPos ? 'positive' : 'negative',
    localRegime: lPos == null ? null : (lPos ? 'positive' : 'negative'),
    divergent: lPos != null && gPos !== lPos,
    nearFlip,
    text,
    note: '基于公开 OI 的模型估算，不代表任何参与者的真实仓位。',
  };
}

/**
 * C2 — PCR in plain language. Ratio thresholds turn PCR(OI) into a hedging /
 * aggression read, and comparing today's volume PCR against the OI PCR says
 * whether today's flow is more defensive or aggressive than the standing book.
 */
export function pcrConclusion({ pcrOi, pcrVol } = {}) {
  const oi = num(pcrOi);
  if (oi == null) return { available: false, reason: '缺少 PCR(OI)。' };

  let lean;
  let text;
  if (oi >= 1.5) {
    lean = 'defensive';
    text = `PCR(OI) ${oi.toFixed(2)}：看跌持仓约为看涨的 ${oi.toFixed(1)} 倍，保护性合约比进攻性活跃，避险情绪偏重。`;
  } else if (oi <= 0.6) {
    lean = 'aggressive';
    text = `PCR(OI) ${oi.toFixed(2)}：看涨持仓明显多于看跌，进攻性合约更活跃。`;
  } else {
    lean = 'balanced';
    text = `PCR(OI) ${oi.toFixed(2)}：Put/Call 未平仓比例大致均衡，未见明显偏向。`;
  }

  const vol = num(pcrVol);
  if (vol != null) {
    if (vol > oi * 1.15) {
      text += ` 当日 PCR(Vol) ${vol.toFixed(2)} 高于存量比例，今天新增交易比存量更偏防御。`;
    } else if (vol < oi * 0.85) {
      text += ` 当日 PCR(Vol) ${vol.toFixed(2)} 低于存量比例，今天新增交易比存量更偏进攻。`;
    }
  }

  return {
    available: true,
    lean,
    pcr_oi: oi,
    pcr_volume: vol,
    text,
    note: 'Put/Call 比例是相对活跃度，不单独代表价格方向。',
  };
}

/**
 * C3 — IV to expected move. ATM IV priced as a to-expiry and per-day range
 * around spot (IV * sqrt(t)); the competitor's "预期波动 ±X%" is this number.
 * `iv30Pct` is annualized ATM IV in percent (e.g. 14.2), `dte` calendar days
 * (defaults to 30 when the term is unknown).
 */
export function expectedMoveConclusion({ iv30Pct, price, ivRank, dte = 30 } = {}) {
  const ivPct = num(iv30Pct);
  const spot = num(price);
  if (ivPct == null || ivPct <= 0) return { available: false, reason: '缺少 ATM IV。' };

  const iv = ivPct / 100;
  const days = num(dte) && num(dte) > 0 ? num(dte) : 30;
  const toExpiryPct = iv * Math.sqrt(days / 365) * 100;
  const dailyPct = (iv / Math.sqrt(252)) * 100;

  const rank = num(ivRank);
  const rankLabel = rank == null
    ? ''
    : `（IV Rank ${Math.round(rank)}，${rank >= 60 ? '相对自身历史偏高' : rank <= 30 ? '相对自身历史偏低' : '相对自身历史居中'}）`;

  const dollarToExpiry = spot != null ? spot * (toExpiryPct / 100) : null;

  return {
    available: true,
    iv_pct: ivPct,
    iv_rank: rank,
    dte: days,
    to_expiry_move_pct: toExpiryPct,
    daily_move_pct: dailyPct,
    to_expiry_move_dollar: dollarToExpiry,
    text: `ATM IV ${ivPct.toFixed(1)}%${rankLabel}：期权对未来 ${days} 天的定价约 ±${toExpiryPct.toFixed(1)}%${dollarToExpiry == null ? '' : `（±$${dollarToExpiry.toFixed(2)}）`}，折算日波动约 ±${dailyPct.toFixed(1)}%。`,
    note: '按 ATM IV × √t 估算，是期权定价的隐含波动，不是方向预测。',
  };
}

/**
 * C4 — cross-signal agreement. Three pillars each cast a directional vote:
 * trend (regime + momentum), option structure (gamma regime + IV change) and
 * volume (RVol + OBV). When they agree the move reads as one-sided; when they
 * split, price tends to chop. `ivChange` is optional (prior IV often absent).
 */
export function consistencyDetector({ trend, gammaRegime, ivChange, rvol, obvTrend } = {}) {
  const votes = [];

  // Pillar 1: trend
  const regime = trend?.regime || '';
  const momentum = trend?.momentum || '';
  let trendVote = 0;
  if (regime.includes('多头') || momentum.includes('向上')) trendVote = 1;
  else if (regime.includes('空头') || momentum.includes('向下')) trendVote = -1;
  votes.push({ pillar: '趋势', vote: trendVote });

  // Pillar 2: option structure. Positive gamma = mean-reverting/range (no
  // directional edge); IV rising with a bearish tilt reads as hedging demand.
  let structVote = 0;
  const iv = num(ivChange);
  if (gammaRegime === 'negative' && iv != null && iv > 0) structVote = -1;
  else if (gammaRegime === 'positive') structVote = 0;
  votes.push({ pillar: '期权结构', vote: structVote });

  // Pillar 3: volume confirmation
  const rv = num(rvol);
  let volVote = 0;
  if (rv != null && rv >= 1.3) {
    if (obvTrend === 'inflow') volVote = 1;
    else if (obvTrend === 'outflow') volVote = -1;
  }
  votes.push({ pillar: '量能', vote: volVote });

  const directional = votes.filter(v => v.vote !== 0);
  const bull = directional.filter(v => v.vote === 1).map(v => v.pillar);
  const bear = directional.filter(v => v.vote === -1).map(v => v.pillar);

  let state;
  let text;
  if (directional.length <= 1) {
    state = 'inconclusive';
    text = '当前只有单一方向信号，其余维度中性，方向证据不足，倾向观望。';
  } else if (bull.length && bear.length) {
    state = 'divergent';
    text = `${bull.join('、')}偏多而${bear.join('、')}偏空，信号分歧；这种情况下价格容易反复，往往不是单边行情。`;
  } else if (bull.length >= 2) {
    state = 'aligned_bull';
    text = `${bull.join('、')}方向一致偏多，信号共振，倾向单边上行；仍需价格确认。`;
  } else if (bear.length >= 2) {
    state = 'aligned_bear';
    text = `${bear.join('、')}方向一致偏空，信号共振，倾向单边下行；仍需价格确认。`;
  } else {
    state = 'inconclusive';
    text = '方向信号不足，倾向观望。';
  }

  return { available: true, state, votes, bull, bear, text };
}

/**
 * C6 / Q2 — volatility attribution. Where did today's move come from? A fixed
 * sequence of measurable tests, each with an input and threshold. There is no
 * news source, so "消息面" can only be attributed as far as an overnight gap or
 * an earnings-calendar hit -- never a specific headline, and the copy says so.
 *
 * Inputs: `priceHistory` daily OHLC (>=2 bars), `iv30Pct` annualized ATM IV %,
 * `rvol`, `obvTrend`, `earnings.daysAway`, `localGamma`.
 */
export function volatilityAttribution({ priceHistory, iv30Pct, rvol, obvTrend, earnings, localGamma } = {}) {
  const bars = Array.isArray(priceHistory) ? priceHistory.filter(b => num(b?.close) != null) : [];
  if (bars.length < 2) return { available: false, reason: '价格历史不足，无法归因波动来源。' };

  const today = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prevClose = num(prev.close);
  const close = num(today.close);
  const open = num(today.open);
  const high = num(today.high);
  const low = num(today.low);
  if (prevClose == null || close == null || prevClose <= 0) {
    return { available: false, reason: '价格历史不完整，无法归因波动来源。' };
  }

  const ret = (close - prevClose) / prevClose; // signed daily return
  const retPct = ret * 100;
  const direction = ret >= 0 ? '上涨' : '下跌';

  // Test 1 — magnitude. Compare today's realized move to the option-implied
  // daily move. Below 0.7x it is inside what options already priced.
  const ivPct = num(iv30Pct);
  const impliedDaily = ivPct != null && ivPct > 0 ? ivPct / 100 / Math.sqrt(252) : null;
  const surprise = impliedDaily != null && impliedDaily > 0 ? Math.abs(ret) / impliedDaily : null;

  const clauses = [];
  let primary = null;

  if (surprise != null && surprise < 0.7) {
    return {
      available: true,
      surprise,
      return_pct: retPct,
      primary: 'within_pricing',
      text: `今日${direction} ${Math.abs(retPct).toFixed(1)}%，约为期权隐含日波动的 ${surprise.toFixed(2)} 倍，波动仍在期权定价范围内，无需特别归因。`,
      note: '模型归因，基于公开数据，不指向具体消息。',
    };
  }

  const magnitudeClause = surprise != null
    ? `今日${direction} ${Math.abs(retPct).toFixed(1)}%，约为期权隐含日波动（±${(impliedDaily * 100).toFixed(1)}%）的 ${surprise.toFixed(2)} 倍`
    : `今日${direction} ${Math.abs(retPct).toFixed(1)}%`;

  // Test 2 — event proximity (highest-priority attribution).
  const daysToEarnings = num(earnings?.daysAway);
  if (daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 3) {
    primary = 'event';
    clauses.push(daysToEarnings === 0 ? '财报即在今日附近，事件驱动是主因' : `财报在 ${daysToEarnings} 天内，事件驱动可能是主因`);
  }

  // Test 3 — gap decomposition. Split the move into overnight gap vs intraday
  // range using the daily bar. Gap-dominant = overnight information (news /
  // offshore); intraday-dominant = structural/flow driven.
  let gapShare = null;
  if (open != null && high != null && low != null) {
    const gap = Math.abs(open - prevClose);
    const range = Math.max(high - low, 0);
    if (gap + range > 0) {
      gapShare = gap / (gap + range);
      if (gapShare > 0.6) {
        if (!primary) primary = 'overnight';
        clauses.push(`盘中波动 ${Math.round(gapShare * 100)}% 来自隔夜跳空，隔夜信息（消息面/外盘）主导`);
      } else if (gapShare < 0.3) {
        if (!primary) primary = 'intraday';
        clauses.push('波动主要发生在盘中，更偏结构/资金驱动而非隔夜消息');
      }
    }
  }

  // Test 4 — volume confirmation.
  const rv = num(rvol);
  if (rv != null) {
    if (rv >= 1.3 && (obvTrend === 'inflow' || obvTrend === 'outflow')) {
      clauses.push(`RVol ${rv.toFixed(2)}× 且 OBV ${obvTrend === 'inflow' ? '上行' : '下行'}，有真实量能确认`);
    } else if (rv < 0.8) {
      clauses.push(`RVol ${rv.toFixed(2)}× 缩量，波动更可能来自对冲盘等结构性力量而非新增资金`);
      if (!primary) primary = 'structural';
    }
  }

  // Test 5 — gamma amplification. Negative local gamma with an outsized move
  // means hedging flows leaned into the move (the quantified图8 read).
  const l = num(localGamma);
  if (l != null && surprise != null) {
    if (l < 0 && surprise > 1.3) {
      clauses.push('现价附近为负 Gamma，对冲盘顺势放大了波动');
      if (!primary) primary = 'gamma_amplified';
    } else if (l > 0 && surprise < 1.0) {
      clauses.push('现价附近为正 Gamma，对冲盘反向、对波动有压制');
    }
  }

  const body = clauses.length ? clauses.join('；') : '各归因测试均未触发明显信号，波动来源不明确';

  return {
    available: true,
    surprise,
    return_pct: retPct,
    gap_share: gapShare,
    primary: primary || 'unclear',
    clauses,
    text: `${magnitudeClause}。${body}。`,
    note: '模型归因，基于公开数据；无新闻源，"消息面"仅指隔夜跳空或事件日历，不指向具体新闻。',
  };
}

/**
 * C5 / C7 — today's core conclusion. Pick one headline from the synthesis
 * outputs by priority: earnings proximity > gamma-environment switch (flip /
 * global-vs-local divergence) > cross-signal state > a plain gamma read. An
 * unusual-activity item, when present, joins the candidate pool.
 */
export function coreConclusion({ symbol, gexEnv, consistency, attribution, earnings, unusualTop } = {}) {
  const name = symbol || '该标的';
  const candidates = [];

  const daysToEarnings = num(earnings?.daysAway);
  if (daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 5) {
    candidates.push({
      priority: 100,
      key: 'earnings',
      text: daysToEarnings === 0
        ? `${name}财报临近（今日附近），事件前后隐含波动率可能剧烈变化。`
        : `${name}财报在 ${daysToEarnings} 天内，事件前后隐含波动率可能剧烈变化。`,
    });
  }

  if (gexEnv?.available && gexEnv.nearFlip) {
    candidates.push({ priority: 90, key: 'flip', text: `${name}现价接近 Gamma 翻转位，减震环境可能随小幅波动切换。` });
  }

  if (gexEnv?.available && gexEnv.divergent) {
    candidates.push({
      priority: 80,
      key: 'gex_divergent',
      text: gexEnv.globalRegime === 'negative'
        ? `${name}全局 GEX 为负，但现价附近 Gamma 转正，当前区域暂有减震、突破后波动可能放大。`
        : `${name}全局 GEX 为正，但现价附近 Gamma 转负，突破当前区域时波动可能骤增。`,
    });
  }

  if (consistency?.available && consistency.state === 'divergent') {
    candidates.push({ priority: 70, key: 'divergent', text: `${name}趋势、期权结构与量能出现分歧，价格容易反复，暂非单边行情。` });
  }
  if (consistency?.available && (consistency.state === 'aligned_bull' || consistency.state === 'aligned_bear')) {
    candidates.push({
      priority: 65,
      key: consistency.state,
      text: `${name}趋势、期权结构与量能方向一致${consistency.state === 'aligned_bull' ? '偏多' : '偏空'}，信号共振；仍需价格确认。`,
    });
  }

  if (attribution?.available && attribution.primary && !['within_pricing', 'unclear'].includes(attribution.primary)) {
    candidates.push({ priority: 50, key: 'attribution', text: attribution.text });
  }

  if (unusualTop) {
    candidates.push({
      priority: 40,
      key: 'unusual',
      text: `${name}出现期权大单异动：${unusualTop.type} $${unusualTop.strike}${unusualTop.date ? ` @ ${unusualTop.date}` : ''}，需结合价格与成交确认。`,
    });
  }

  if (gexEnv?.available) {
    candidates.push({ priority: 20, key: 'gex_plain', text: `${name}${gexEnv.text}` });
  }

  if (!candidates.length) {
    return { available: false, reason: '当前数据不足以生成核心结论。' };
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return {
    available: true,
    headline: candidates[0].text,
    headline_key: candidates[0].key,
    alternates: candidates.slice(1).map(c => ({ key: c.key, text: c.text })),
    note: '模型结论，仅供研究，不构成投资建议。',
  };
}

/**
 * D2 — IV term-structure conclusion. Classifies the ATM-IV-by-expiry slope:
 * contango (near < far, the normal upward term), backwardation (near > far,
 * usually a near-dated event premium) or a hump/flat. `points` is an ordered
 * list of { expiry, atm_iv } with atm_iv as a decimal (0.14) or percent — both
 * are handled by comparing relative levels.
 */
export function termStructureConclusion(points) {
  const clean = (Array.isArray(points) ? points : [])
    .map(p => ({ expiry: p?.expiry, iv: num(p?.atm_iv) }))
    .filter(p => p.expiry && p.iv != null && p.iv > 0);
  if (clean.length < 2) return { available: false, reason: '期限结构数据不足。' };

  const near = clean[0].iv;
  const far = clean[clean.length - 1].iv;
  const mid = clean[Math.floor(clean.length / 2)].iv;
  const rel = (far - near) / near;

  let shape;
  let text;
  if (mid > near * 1.03 && mid > far * 1.03) {
    shape = 'hump';
    text = '期限结构中段隆起，中期到期日 IV 相对更高，可能对应某个特定到期日附近的事件预期。';
  } else if (rel > 0.03) {
    shape = 'contango';
    text = '期限结构升水（近低远高），属常态，暂无明显的近期事件溢价。';
  } else if (rel < -0.03) {
    shape = 'backwardation';
    text = '期限结构贴水（近高远低），近端 IV 更贵，通常意味着近期有事件（财报/宏观）被定价。';
  } else {
    shape = 'flat';
    text = '期限结构大致平坦，各到期 IV 接近，未见明显的近期事件溢价。';
  }

  return { available: true, shape, near_iv: near, far_iv: far, text, note: 'IV 期限结构是期权定价的相对水平，不预测方向。' };
}

/**
 * B4 — POP context. A raw POP looks "low" without saying that long-premium
 * strategies are supposed to have sub-50% POP (paid for by payoff), while
 * short-premium strategies run high POP with capped upside. Returns a one-line
 * baseline note keyed off the strategy stance.
 */
export function popContext(strategy) {
  const stance = {
    'Long Call': 'debit', 'Long Put': 'debit', 'Long Straddle': 'debit',
    'Bull Put Spread': 'credit', 'Bear Call Spread': 'credit', 'Iron Condor': 'credit',
    'Iron Butterfly': 'credit', 'Short Strangle': 'credit', 'Short Put': 'credit',
    'Short Call': 'credit', 'Jade Lizard': 'credit',
    'Calendar Spread': 'spread', 'Diagonal Spread': 'spread',
  }[strategy] || 'other';

  if (stance === 'debit') {
    return { available: true, text: '买方策略 POP 通常低于 50%，用较高的盈亏比来补偿较低的胜率——低 POP 是这类结构的常态，不代表劣势。' };
  }
  if (stance === 'credit') {
    return { available: true, text: '卖方策略 POP 通常较高，但盈利上限被权利金封顶、风险相对更大；高 POP 不等于低风险。' };
  }
  return { available: false, reason: null };
}

/**
 * Assemble the full synthesis bundle from the Analyze `data` object. One call
 * the view layer can consume; each field is independently { available }.
 */
export function buildSynthesis(data = {}) {
  const gexEnv = gexEnvironmentConclusion({
    globalGex: data.gexTotal,
    localGamma: data.localGamma,
    gammaFlip: data.gammaFlip,
    price: data.price,
  });
  const pcr = pcrConclusion({ pcrOi: data.pcr, pcrVol: data.pcrVol });
  const expectedMove = expectedMoveConclusion({ iv30Pct: data.iv30, price: data.price, ivRank: data.ivRank });
  const consistency = consistencyDetector({
    trend: data.trend,
    gammaRegime: data.gammaRegime,
    ivChange: data.ivChange,
    rvol: data.trend?.rvol,
    obvTrend: data.obv?.trend,
  });
  const attribution = volatilityAttribution({
    priceHistory: data.priceHistory,
    iv30Pct: data.iv30,
    rvol: data.trend?.rvol,
    obvTrend: data.obv?.trend,
    earnings: data.earnings,
    localGamma: data.localGamma,
  });
  const unusualTop = Array.isArray(data.unusualActivity) && data.unusualActivity.length
    ? data.unusualActivity[0]
    : null;
  const core = coreConclusion({ symbol: data.symbol, gexEnv, consistency, attribution, earnings: data.earnings, unusualTop });

  return { core, gexEnv, pcr, expectedMove, consistency, attribution };
}
