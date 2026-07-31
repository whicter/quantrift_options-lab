const GAMMA_LABELS = { positive: '正', negative: '负' };

function buildBriefing({
  dateLabel,
  breadth,
  stateMatrix,
  rotation,
  spyGamma,
  qqqGamma,
  earnings,
  unusual,
}) {
  const gamma = breadth?.gamma || {};
  const ivRank = breadth?.iv_rank || {};
  const distribution = stateMatrix?.distribution || {};
  const stateCount = state => distribution[state] || 0;
  const bull = stateCount('S1');
  const bear = stateCount('S5');
  const tilt = bull > bear ? '偏多头' : bear > bull ? '偏空头' : '多空均衡';

  const sectors = rotation?.sectors || [];
  const leaders = sectors.filter(sector => sector.quadrant === 'leading').slice(0, 2);
  const laggards = sectors.filter(sector => sector.quadrant === 'lagging').slice(-2).reverse();

  const headline = tilt === '偏多头'
    ? '市场整体略偏强，但上涨并不全面。'
    : tilt === '偏空头'
      ? '市场整体偏弱，空头状态占得更多。'
      : '市场多空力量接近，暂未形成明确方向。';

  const summary = [];
  const trendParts = [];
  if (bull || bear) {
    trendParts.push(`强势上行 ${bull} 只，${bull >= bear ? '多于' : '少于'}空头 ${bear} 只`);
  }
  if (stateCount('S2')) trendParts.push(`另有 ${stateCount('S2')} 只处于上涨后的回调阶段`);
  if (trendParts.length) summary.push({ label: '趋势', text: `${trendParts.join('；')}。` });

  const optionParts = [];
  if (gamma.positive_pct != null) {
    const gammaContext = gamma.positive_pct >= 55
      ? '正 Gamma 略占优势，波动环境相对稳定'
      : gamma.positive_pct <= 45
        ? '负 Gamma 占比较高，波动更容易放大'
        : '正负 Gamma 接近，波动环境没有明显倾向';
    optionParts.push(`${gammaContext}（${gamma.positive_pct}% 为正 Gamma）`);
  }
  if (ivRank.median != null) {
    const roundedIv = Math.round(ivRank.median);
    const ivContext = roundedIv >= 70
      ? '整体偏高'
      : roundedIv < 30 ? '整体偏低' : '处于中等区间';
    optionParts.push(`IV Rank 中位数为 ${roundedIv}，${ivContext}`);
  }
  if (stateCount('S0')) {
    optionParts.push(`${stateCount('S0')} 只标的处于高波动或事件驱动状态`);
  }
  if (optionParts.length) summary.push({ label: '期权', text: `${optionParts.join('；')}。` });

  const rotationParts = [];
  if (leaders.length) rotationParts.push(`${leaders.map(sector => sector.label).join('和')}相对领先`);
  if (laggards.length) rotationParts.push(`${laggards.map(sector => sector.label).join('和')}偏弱`);
  if (earnings?.length) rotationParts.push(`未来一周有 ${earnings.length} 只标的公布财报`);
  if (rotationParts.length) summary.push({ label: '关注', text: `${rotationParts.join('；')}。` });

  return {
    date: dateLabel,
    tilt,
    headline,
    summary,
    callouts: {
      regime: {
        positive_gamma_pct: gamma.positive_pct ?? null,
        spy_gamma: spyGamma ?? null,
        qqq_gamma: qqqGamma ?? null,
      },
      breadth: {
        iv_median: ivRank.median ?? null,
        elevated_pct: ivRank.elevated_pct ?? null,
      },
      states: {
        S1: stateCount('S1'),
        S2: stateCount('S2'),
        S3: stateCount('S3'),
        S4: stateCount('S4'),
        S5: stateCount('S5'),
        S6: stateCount('S6'),
        S0: stateCount('S0'),
      },
      rotation: {
        leaders: leaders.map(sector => ({
          symbol: sector.symbol,
          label: sector.label,
          rs: sector.rs,
          grade: sector.grade,
          flow: sector.flow,
        })),
        laggards: laggards.map(sector => ({
          symbol: sector.symbol,
          label: sector.label,
          rs: sector.rs,
          grade: sector.grade,
          flow: sector.flow,
        })),
      },
    },
    earnings_ahead: earnings || [],
    top_unusual: unusual || [],
    spy_gamma_label: spyGamma ? `${GAMMA_LABELS[spyGamma] || spyGamma}Gamma` : null,
    qqq_gamma_label: qqqGamma ? `${GAMMA_LABELS[qqqGamma] || qqqGamma}Gamma` : null,
  };
}

module.exports = { buildBriefing };
