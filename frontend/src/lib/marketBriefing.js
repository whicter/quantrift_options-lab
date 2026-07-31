const finite = value => value != null && Number.isFinite(Number(value));

const naturalHeadline = (tilt) => {
  if (tilt === '偏多头') return '市场整体略偏强，但上涨并不全面。';
  if (tilt === '偏空头') return '市场整体偏弱，空头状态占得更多。';
  return '市场多空力量接近，暂未形成明确方向。';
};

// Rolling-deploy compatibility: the new API supplies `summary`; an older
// backend may still supply only the prior machine-composed headline. Rebuild
// the same human-readable view from structured callouts until that backend is
// restarted, without parsing or displaying the legacy sentence.
export function buildMarketBriefingView(raw) {
  if (!raw || raw.status !== 'ready') return raw;
  if (Array.isArray(raw.summary)) {
    return { ...raw, headline: raw.headline || naturalHeadline(raw.tilt) };
  }

  const states = raw.callouts?.states || {};
  const regime = raw.callouts?.regime || {};
  const breadth = raw.callouts?.breadth || {};
  const rotation = raw.callouts?.rotation || {};
  const summary = [];

  const bull = Number(states.S1) || 0;
  const bear = Number(states.S5) || 0;
  const pullback = Number(states.S2) || 0;
  const trendParts = [];
  if (bull || bear) trendParts.push(`强势上行 ${bull} 只，${bull >= bear ? '多于' : '少于'}空头 ${bear} 只`);
  if (pullback) trendParts.push(`另有 ${pullback} 只处于上涨后的回调阶段`);
  if (trendParts.length) summary.push({ label: '趋势', text: `${trendParts.join('；')}。` });

  const optionsParts = [];
  if (finite(regime.positive_gamma_pct)) {
    const positiveGammaPct = Number(regime.positive_gamma_pct);
    const context = positiveGammaPct >= 55
      ? '正 Gamma 略占优势，波动环境相对稳定'
      : positiveGammaPct <= 45
        ? '负 Gamma 占比较高，波动更容易放大'
        : '正负 Gamma 接近，波动环境没有明显倾向';
    optionsParts.push(`${context}（${positiveGammaPct}% 为正 Gamma）`);
  }
  if (finite(breadth.iv_median)) {
    const median = Math.round(Number(breadth.iv_median));
    const context = median >= 70 ? '整体偏高' : median < 30 ? '整体偏低' : '处于中等区间';
    optionsParts.push(`IV Rank 中位数为 ${median}，${context}`);
  }
  const eventCount = Number(states.S0) || 0;
  if (eventCount) optionsParts.push(`${eventCount} 只标的处于高波动或事件驱动状态`);
  if (optionsParts.length) summary.push({ label: '期权', text: `${optionsParts.join('；')}。` });

  const attentionParts = [];
  const leaders = Array.isArray(rotation.leaders) ? rotation.leaders : [];
  const laggards = Array.isArray(rotation.laggards) ? rotation.laggards : [];
  if (leaders.length) attentionParts.push(`${leaders.map(item => item.label).filter(Boolean).join('和')}相对领先`);
  if (laggards.length) attentionParts.push(`${laggards.map(item => item.label).filter(Boolean).join('和')}偏弱`);
  if (raw.earnings_ahead?.length) attentionParts.push(`未来一周有 ${raw.earnings_ahead.length} 只标的公布财报`);
  if (attentionParts.length) summary.push({ label: '关注', text: `${attentionParts.join('；')}。` });

  return { ...raw, headline: naturalHeadline(raw.tilt), summary };
}
