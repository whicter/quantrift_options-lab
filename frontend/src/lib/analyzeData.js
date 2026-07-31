import { compactMoney } from './scannerPresentation.js';

export const SUPPORTED_GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';

export function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function isUsableGex(gexData) {
  if (!gexData || gexData.freshness === 'missing') return false;
  return toNumber(gexData.global_gex) != null
    && toNumber(gexData.call_wall) != null
    && toNumber(gexData.put_wall) != null
    && Array.isArray(gexData.strikes)
    && gexData.strikes.length > 0
    && gexData.raw_metrics?.model_version === SUPPORTED_GEX_MODEL_VERSION
    && gexData.raw_metrics?.unit === 'usd_delta_change_per_1pct_move';
}

export function applyGex(data, gexData) {
  if (!data || !isUsableGex(gexData)) {
    return {
      ...data,
      partialData: {
        type: 'gex_unusable',
        title: 'GEX / Wall 暂不可用',
        message: gexData?.freshness === 'stale'
          ? '期权数据已延迟，相关结论与策略候选暂不可用。'
          : '期权数据暂不可用，相关结论与策略候选暂不显示。',
      },
      gexTotal: null,
      gexByStrike: [],
      putWall: null,
      callWall: null,
      pcr: null,
      pcrVol: null,
      maxPain: null,
      gammaFlip: null,
      localGamma: null,
      gammaRegime: null,
      scenarios: null,
      conclusion: 'GEX/Wall 数据不可用或已过期；当前不显示 Call Wall / Put Wall 结论。',
      recommendation: null,
      gexNotice: null,
    };
  }

  const gexByStrike = gexData.strikes
    .map(row => ({
      strike: toNumber(row.strike),
      gex: toNumber(row.net_gex),
    }))
    .filter(row => row.strike != null && row.gex != null);

  const gexPrice = toNumber(gexData.underlying_price);
  const price = gexPrice ?? data.price;
  // When the option-snapshot spot wins, the as-of is that snapshot's timestamp
  // (an in-session/delayed price). Otherwise keep the daily-close as-of that the
  // seed set, so the header never labels a prior close as a live intraday price.
  const priceAsOf = gexPrice != null
    ? { kind: 'intraday', ts: gexData.snapshot_ts ?? null, date: null, freshness: gexData.freshness ?? null }
    : data.priceAsOf;
  const callWall = toNumber(gexData.call_wall) ?? data.callWall;
  const putWall = toNumber(gexData.put_wall) ?? data.putWall;
  const gammaFlip = toNumber(gexData.gamma_flip);
  const localGamma = toNumber(gexData.local_gamma);
  const gexTotal = toNumber(gexData.global_gex) ?? data.gexTotal;
  const pcr = toNumber(gexData.pcr_oi);
  const pcrVol = toNumber(gexData.pcr_volume);
  const upDistance = Math.max(callWall - price, Math.abs(price) * 0.03);
  const downDistance = Math.max(price - putWall, Math.abs(price) * 0.03);
  const gexText = compactMoney(gexTotal);

  return {
    ...data,
    partialData: undefined,
    gexNotice: buildGexNotice(gexData),
    price,
    priceAsOf,
    gexTotal,
    gexByStrike: gexByStrike.length ? gexByStrike : data.gexByStrike,
    putWall,
    callWall,
    pcr: pcr ?? data.pcr,
    pcrVol: pcrVol ?? data.pcrVol,
    maxPain: toNumber(gexData.max_pain),
    gammaFlip,
    localGamma,
    gammaRegime: gexData.gamma_regime,
    scenarios: {
      ...data.scenarios,
      upTrigger: Number(callWall.toFixed(2)),
      upTarget: Number((callWall + upDistance).toFixed(2)),
      downTrigger: Number(putWall.toFixed(2)),
      downTarget: Number((putWall - downDistance).toFixed(2)),
    },
    conclusion: `${gexData.gamma_regime === 'positive' ? '正' : gexData.gamma_regime === 'negative' ? '负' : '近零'}Gamma ${gexText}，Call Wall $${callWall.toFixed(2)} / Put Wall $${putWall.toFixed(2)}；PCR(OI) ${(pcr ?? 0).toFixed(2)}，Max Pain $${(toNumber(gexData.max_pain) ?? putWall).toFixed(2)}。`,
  };
}

export function applyDerivedAnalysis(data, supportResistance, chainStats, volumeProfile) {
  if (!data) return data;
  const srReady = supportResistance?.status === 'ready';
  const chainReady = chainStats?.status === 'ready';
  return {
    ...data,
    supportResistance: srReady ? {
      support: (supportResistance.support || []).map(level => ({ price: toNumber(level.price) })).filter(level => level.price != null),
      resistance: (supportResistance.resistance || []).map(level => ({ price: toNumber(level.price) })).filter(level => level.price != null),
    } : null,
    focusScore: srReady && supportResistance.focus?.ready ? {
      label: supportResistance.focus.label,
    } : null,
    obv: srReady && supportResistance.obv?.status === 'ready' ? {
      trend: supportResistance.obv.trend,
      series: supportResistance.obv.series || [],
    } : null,
    mfi: srReady && supportResistance.mfi?.status === 'ready' ? {
      value: toNumber(supportResistance.mfi.value),
      signal: supportResistance.mfi.signal,
    } : null,
    compositeMomentum: srReady && supportResistance.momentum ? supportResistance.momentum : null,
    volumeProfile: volumeProfile?.status === 'ready' ? {
      priceLow: toNumber(volumeProfile.price_low),
      priceHigh: toNumber(volumeProfile.price_high),
      totalVolume: toNumber(volumeProfile.total_volume),
      nodes: volumeProfile.nodes || [],
      highVolumeNodes: volumeProfile.high_volume_nodes || [],
    } : null,
    chainStats: chainReady ? {
      termStructure: chainStats.term_structure || [],
      skew: chainStats.skew || { expiry: null, points: [] },
      oiDensity: chainStats.oi_density?.status === 'ready' ? {
        snapshotTs: chainStats.oi_density.snapshot_ts,
        freshness: chainStats.oi_density.freshness,
        maxPain: toNumber(chainStats.oi_density.max_pain),
        points: chainStats.oi_density.points || [],
      } : null,
    } : null,
  };
}

function buildGexNotice(gexData) {
  const stale = Boolean(gexData.is_stale || gexData.freshness === 'stale');
  const partial = gexData.confidence === 'low';
  if (!stale && !partial) return null;

  return {
    title: stale ? '期权数据延迟' : '部分期权数据可用',
    message: '当前结果可能不完整，请结合页面时间与风险提示使用。',
  };
}
