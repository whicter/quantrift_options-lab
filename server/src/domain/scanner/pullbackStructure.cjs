/**
 * Detects whether a symbol is in a measurable pullback-to-support structure,
 * and states the thesis with its inputs named.
 *
 * WHAT THIS IS NOT: it does not predict a bottom, and must never be described
 * as one. Nobody can distinguish a pullback from the first half of a breakdown
 * in advance -- every crash looks like a dip on the way down. What *is*
 * measurable is whether the conditions people mean by "pullback to support"
 * currently hold: an intact uptrend, short-term weakness, price near a level
 * that has structural meaning, oversold momentum, and premium that has already
 * repriced the fear. This module reports those conditions and says plainly that
 * the distinction cannot be made ahead of time.
 *
 * Why this matters beyond honesty: it gives directional recommendations a
 * *stated structure* to rest on. The engine was previously willing to surface a
 * Long Call in a neutral trend purely because it scored well on liquidity --
 * a directional bet with no directional basis, which flipped to a Long Put when
 * quotes moved (observed live on SPY, 2026-07-30). A thesis like this one is
 * what a directional pick should require.
 *
 * The options angle is the point. When a pullback lifts implied volatility, the
 * classical expression is not "buy calls and hope" but selling a put spread
 * BELOW support: it profits if support merely holds, its loss is capped, and
 * the richer the fear premium the more it collects. That maps the structure and
 * the IV Rank reading onto one coherent position instead of two loose signals.
 */

const DEFAULTS = {
  // Distance to support, as a percentage of spot, for price to count as "at"
  // the level rather than merely above it.
  nearSupportPct: Number(process.env.PULLBACK_NEAR_SUPPORT_PCT ?? 3),
  // RSI at or below this is short-term oversold. 35 rather than the textbook 30
  // because a shallow pullback in a strong uptrend often bottoms before 30.
  oversoldRsi: Number(process.env.PULLBACK_OVERSOLD_RSI ?? 35),
  // IV Rank at or above this counts as fear having been priced in, which is
  // also the threshold at which environmentEdge calls premium rich, so the two
  // cannot contradict each other.
  elevatedIvRank: Number(process.env.PULLBACK_ELEVATED_IVR ?? 60),
  // How many of the optional confirmations must hold before the structure is
  // reported as present. The trend/pullback state itself is mandatory.
  minConfirmations: Number(process.env.PULLBACK_MIN_CONFIRMATIONS ?? 2),
};

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(from, to) {
  if (from == null || to == null || to <= 0) return null;
  return ((from - to) / to) * 100;
}

/**
 * @param {object} input
 * @param {string} input.state        market state id from classifyState (S2 = uptrend pullback)
 * @param {number} input.spot
 * @param {number|null} input.support nearest support level below spot
 * @param {number|null} input.putWall dealer Put Wall below spot
 * @param {number|null} input.rsi14
 * @param {number|null} input.mfi14
 * @param {number|null} input.ivRank
 * @param {object} [thresholds]
 */
function pullbackStructure(input, thresholds = DEFAULTS) {
  const th = { ...DEFAULTS, ...thresholds };
  const spot = num(input?.spot);

  // The uptrend-with-pullback state is mandatory: without it this is not a
  // pullback at all, it is a downtrend, and calling it "support" would invite
  // exactly the catching-a-falling-knife mistake this is meant to avoid.
  if (input?.state !== 'S2' || spot == null || spot <= 0) {
    return {
      status: 'absent',
      reason: input?.state === 'S5' || input?.state === 'S4'
        ? '当前处于空头结构，不构成上行趋势中的回调；下方价位是趋势方向本身，不作为支撑论点。'
        : '当前不处于「上行趋势 + 短期回调」的结构。',
      confirmations: [],
    };
  }

  // Support is whichever meaningful level sits nearest below spot. The Put Wall
  // is included because it is where dealer hedging concentrates, which is a
  // different kind of evidence from a price pivot -- not better, but not
  // correlated with it either.
  const candidates = [
    { kind: 'support', level: num(input.support), label: '技术支撑' },
    { kind: 'put_wall', level: num(input.putWall), label: 'Put Wall' },
  ].filter(entry => entry.level != null && entry.level > 0 && entry.level < spot);
  const nearest = candidates.sort((a, b) => b.level - a.level)[0] || null;
  const distancePct = nearest ? pct(spot, nearest.level) : null;

  const confirmations = [];
  if (nearest && distancePct != null && distancePct <= th.nearSupportPct) {
    confirmations.push({
      key: 'near_support',
      text: `现价距${nearest.label} $${nearest.level.toFixed(2)} 约 ${distancePct.toFixed(1)}%`,
    });
  }
  const rsi = num(input.rsi14);
  if (rsi != null && rsi <= th.oversoldRsi) {
    confirmations.push({ key: 'oversold_rsi', text: `RSI ${rsi.toFixed(0)} ≤ ${th.oversoldRsi}，短期超卖` });
  }
  const mfi = num(input.mfi14);
  if (mfi != null && mfi <= 20) {
    confirmations.push({ key: 'oversold_mfi', text: `MFI ${mfi.toFixed(0)} ≤ 20，资金流处于超卖区` });
  }
  const ivRank = num(input.ivRank);
  if (ivRank != null && ivRank >= th.elevatedIvRank) {
    confirmations.push({ key: 'fear_priced', text: `IV Rank ${Math.round(ivRank)}，恐慌已部分计价、权利金偏贵` });
  }

  if (confirmations.length < th.minConfirmations) {
    return {
      status: 'weak',
      reason: `处于上行趋势的回调中，但只满足 ${confirmations.length} 项确认条件（需 ${th.minConfirmations} 项），尚不构成明确的回调-支撑结构。`,
      confirmations,
      support: nearest ? { kind: nearest.kind, level: nearest.level, distance_pct: distancePct } : null,
    };
  }

  // Premium level decides which expression of the same thesis fits. This is the
  // options-specific half: a rich-premium pullback is expressed by selling a put
  // spread below support (profits if support merely holds, loss capped, and the
  // richer the fear the more it collects); a cheap-premium one by buying the
  // rebound outright.
  const premiumRich = ivRank != null && ivRank >= th.elevatedIvRank;
  const expression = premiumRich
    ? {
      side: 'seller',
      shape: 'put_spread_below_support',
      text: '权利金偏贵时，这一论点的典型表达是「在支撑下方卖出看跌价差」：只要支撑守住即可获利，无需赌反弹幅度，且亏损有上限。',
    }
    : {
      side: 'buyer',
      shape: 'long_call',
      text: '权利金不贵时，这一论点的典型表达是直接买入看涨期权：成本较低，但需要真实反弹幅度覆盖权利金。',
    };

  const reason = `${input.symbol ? `${input.symbol} ` : ''}处于上行趋势中的回调：`
    + confirmations.map(c => c.text).join('；')
    + '。这符合「回调-支撑」结构的可测量条件。';

  return {
    status: 'present',
    confirmations,
    support: nearest ? { kind: nearest.kind, level: nearest.level, distance_pct: distancePct } : null,
    premium: premiumRich ? 'rich' : 'not_rich',
    expression,
    reason,
    // Stated on every positive detection, never omitted. The structure being
    // present says the conditions hold, not that the low is in.
    caveat: '回调与破位在事前无法区分——每一次下跌在半山腰都符合回调特征。此处描述的是当前可测量的结构，不是底部判断，也不构成买卖建议。',
  };
}

module.exports = { pullbackStructure, PULLBACK_DEFAULTS: DEFAULTS };
