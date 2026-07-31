/**
 * Turns the market environment into an explicit, stated view about which side
 * of the trade the current conditions favour.
 *
 * This exists because edge cannot be extracted from option prices. Under the
 * risk-neutral distribution that produces POP, the expected value of any fairly
 * priced option is ~0 by construction; a computed "EV" only measures how badly
 * the model's IV input differs from each strike's own IV (verified 2026-07-30 by
 * Monte Carlo against live per-strike IVs of 0.1604/0.1535/0.1436 on SPY). So
 * the only legitimate source of edge is a view that DIFFERS from market pricing
 * -- e.g. "implied volatility is historically rich here, so selling premium is
 * statistically favoured". IV Rank is exactly such a view: it compares today's
 * implied volatility to its own trailing year, which is information the option's
 * price does not contain.
 *
 * Previously this logic existed only as an invisible 1.1x score multiplier
 * inside directionalWeight, so the product acted on a view it never stated. Here
 * it becomes a first-class output the UI can show, and the ledger can later be
 * used to check whether the view actually paid.
 *
 * Compliance: describes the statistical environment and names its input. It
 * never instructs the user to buy or sell, and never claims an outcome.
 */

// IV Rank thresholds. These match the tilt thresholds already used by
// directionalWeight so the stated reason and the applied weighting cannot
// disagree -- a stated view the scoring ignores would be worse than no view.
const RICH_IV_RANK = 60;
const CHEAP_IV_RANK = 30;

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @returns {{
 *   status: 'available'|'unavailable',
 *   premium?: 'rich'|'cheap'|'neutral',
 *   favours?: 'seller'|'buyer'|'neither',
 *   ivRank?: number,
 *   reason?: string,
 *   inputs?: string[],
 * }}
 */
function environmentEdge(environment) {
  const ivRank = num(environment?.ivRank);
  if (ivRank == null) {
    return {
      status: 'unavailable',
      // Distinct from "neutral": we are not claiming the environment is
      // balanced, we are saying we cannot see it. IV Rank needs 252
      // observations, so a young listing legitimately lands here.
      reason: 'IV Rank 尚未就绪（需要 252 个交易日的历史），无法判断权利金处于高位还是低位。',
      inputs: [],
    };
  }

  const gammaRegime = environment?.gammaRegime || null;
  const inputs = [`IV Rank ${Math.round(ivRank)}`];
  if (gammaRegime === 'positive' || gammaRegime === 'negative') {
    inputs.push(gammaRegime === 'positive' ? '做市商正 Gamma' : '做市商负 Gamma');
  }

  let premium;
  let favours;
  let reason;
  if (ivRank >= RICH_IV_RANK) {
    premium = 'rich';
    favours = 'seller';
    reason = `IV Rank ${Math.round(ivRank)}，当前隐含波动率处于过去一年的高位区间，权利金相对偏贵，统计上对卖方有利。`;
  } else if (ivRank <= CHEAP_IV_RANK) {
    premium = 'cheap';
    favours = 'buyer';
    reason = `IV Rank ${Math.round(ivRank)}，当前隐含波动率处于过去一年的低位区间，权利金相对便宜，统计上对买方有利。`;
  } else {
    premium = 'neutral';
    favours = 'neither';
    reason = `IV Rank ${Math.round(ivRank)}，隐含波动率处于过去一年的中间区间，权利金不算贵也不算便宜，买卖双方没有明显的统计倾斜。`;
  }

  // Dealer gamma is a separate, weaker market-structure signal. It is appended
  // as context, never allowed to flip the premium conclusion: IV Rank compares
  // price to its own history (a real divergence from current pricing), whereas
  // gamma regime describes hedging behaviour. Conflating them would let a soft
  // signal overrule a measured one.
  //
  // The two can genuinely disagree (live 2026-07-30: NVDA IV Rank 13 with
  // positive gamma). That disagreement is real information and must not be
  // hidden -- but the wording has to make clear these are two different lenses
  // rather than one sentence contradicting itself, which is how it reads when
  // both are stated flatly as "favours X".
  let gammaFavours = null;
  if (gammaRegime === 'negative') gammaFavours = 'buyer';
  else if (gammaRegime === 'positive') gammaFavours = 'seller';

  if (gammaFavours) {
    const gammaClause = gammaRegime === 'negative'
      ? '做市商处于负 Gamma，对冲往往放大波动，这一点利于做多 Gamma（买方）'
      : '做市商处于正 Gamma，对冲往往抑制波动，这一点利于收取权利金（卖方）';
    const agrees = favours !== 'neither' && gammaFavours === favours;
    reason += agrees
      ? ` 市场结构同向印证：${gammaClause}。`
      : ` 另一维度方向不同：${gammaClause}，与上述权利金水平的倾斜相反，需自行权衡。`;
  }

  return {
    status: 'available',
    premium,
    favours,
    ivRank,
    // Exposed separately so the UI can show agreement/disagreement as structure
    // (e.g. two chips) instead of relying on the reader to parse the sentence.
    gammaFavours,
    signalsAgree: gammaFavours == null ? null : (favours !== 'neither' && gammaFavours === favours),
    reason,
    inputs,
  };
}

module.exports = { environmentEdge, RICH_IV_RANK, CHEAP_IV_RANK };
