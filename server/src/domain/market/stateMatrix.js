const STATE_META = [
  { id: 'S1', label: '强势上行', tone: 'bull' },
  { id: 'S2', label: '上行·回调中', tone: 'bull-soft' },
  { id: 'S3', label: '区间突破', tone: 'bull' },
  { id: 'S6', label: '区间/中性', tone: 'neutral' },
  { id: 'S4', label: '下行·企稳试探', tone: 'bear-soft' },
  { id: 'S5', label: '空头', tone: 'bear' },
  { id: 'S0', label: '高波动/事件', tone: 'warn' },
  { id: 'insufficient', label: '数据不足', tone: 'muted' },
];

const STATE_THRESHOLDS = {
  ivrHigh: Number(process.env.STATE_IVR_HIGH ?? 80),
  rvolSpike: Number(process.env.STATE_RVOL_SPIKE ?? 2.5),
  rvolBreakout: Number(process.env.STATE_RVOL_BREAKOUT ?? 1.5),
  extHigh: Number(process.env.STATE_EXT_HIGH ?? 3),
  momBand: Number(process.env.STATE_MOM_BAND ?? 1.5),
};

function classifyState(symbol, thresholds = STATE_THRESHOLDS) {
  if (symbol.close == null || symbol.ma50 == null || symbol.ma200 == null) {
    return { state: 'insufficient', reasons: ['历史不足 200 根日线'] };
  }
  const reasons = [];
  const ivRankHigh = symbol.ivRank != null && symbol.ivRank >= thresholds.ivrHigh;
  const relativeVolumeSpike = symbol.rvol != null && symbol.rvol >= thresholds.rvolSpike;
  if (ivRankHigh || relativeVolumeSpike) {
    if (ivRankHigh) reasons.push(`IV Rank ${Math.round(symbol.ivRank)} ≥ ${thresholds.ivrHigh}`);
    if (relativeVolumeSpike) reasons.push(`RVol ${symbol.rvol.toFixed(1)}× ≥ ${thresholds.rvolSpike}`);
    return { state: 'S0', reasons };
  }
  if (
    symbol.hi20 != null
    && symbol.close > symbol.hi20
    && symbol.rvol != null
    && symbol.rvol >= thresholds.rvolBreakout
  ) {
    reasons.push(`收盘突破前 20 日高 ${symbol.hi20.toFixed(2)}`);
    reasons.push(`放量 RVol ${symbol.rvol.toFixed(1)}× ≥ ${thresholds.rvolBreakout}`);
    return { state: 'S3', reasons };
  }
  const upStructure = symbol.close > symbol.ma200 && symbol.ma50 > symbol.ma200;
  const downStructure = symbol.close < symbol.ma200 && symbol.ma50 < symbol.ma200;
  if (upStructure) {
    const pullingBack = symbol.close < symbol.ma50
      || (symbol.ret5 != null && symbol.ret5 <= -thresholds.momBand);
    if (pullingBack) {
      reasons.push('多头结构 (价 > MA200, MA50 > MA200)');
      reasons.push(
        symbol.close < symbol.ma50
          ? '回踩至 MA50 下方'
          : `5 日动量 ${symbol.ret5.toFixed(1)}% (回落)`,
      );
      return { state: 'S2', reasons };
    }
    reasons.push('多头排列 (价 > MA50 > MA200)');
    if (symbol.ret20 != null) {
      reasons.push(`20 日 ${symbol.ret20 >= 0 ? '+' : ''}${symbol.ret20.toFixed(1)}%`);
    }
    if (symbol.ext50 != null && symbol.ext50 >= thresholds.extHigh) {
      reasons.push(`距 MA50 +${symbol.ext50.toFixed(1)}% (追高区)`);
    }
    return { state: 'S1', reasons };
  }
  if (downStructure) {
    const stabilizing = symbol.close > symbol.ma50
      || (symbol.ret5 != null && symbol.ret5 >= thresholds.momBand);
    if (stabilizing) {
      reasons.push('空头结构 (价 < MA200, MA50 < MA200)');
      reasons.push(
        symbol.close > symbol.ma50
          ? '重回 MA50 上方'
          : `5 日动量 +${symbol.ret5.toFixed(1)}% (反弹)`,
      );
      return { state: 'S4', reasons };
    }
    reasons.push('空头排列 (价 < MA50 < MA200)');
    if (symbol.ret20 != null) reasons.push(`20 日 ${symbol.ret20.toFixed(1)}%`);
    return { state: 'S5', reasons };
  }
  return { state: 'S6', reasons: ['MA 交织，无清晰趋势'] };
}

function buildStateMatrix(rows, thresholds = STATE_THRESHOLDS) {
  const distribution = Object.fromEntries(STATE_META.map(state => [state.id, 0]));
  const symbols = rows.map(row => {
    const { state, reasons } = classifyState(row, thresholds);
    distribution[state] = (distribution[state] || 0) + 1;
    return {
      symbol: row.symbol,
      state,
      reasons,
      iv_rank: row.ivRank,
      gamma_regime: row.gammaRegime,
      ext50: row.ext50,
      ret20: row.ret20,
      rvol: row.rvol,
    };
  });
  return { distribution, symbols };
}

module.exports = { classifyState, buildStateMatrix, STATE_META, STATE_THRESHOLDS };
