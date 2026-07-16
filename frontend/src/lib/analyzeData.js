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
    && gexData.strikes.length > 0;
}

export function applyGex(data, gexData) {
  if (!data || !isUsableGex(gexData)) {
    return {
      ...data,
      partialData: {
        type: 'gex_unusable',
        title: 'GEX / Wall 暂不可用',
        message: gexData?.freshness === 'stale'
          ? 'GEX/Wall 快照已过期，暂不生成 Call Wall / Put Wall 结论和期权策略腿。'
          : 'GEX/Wall 快照不可用，暂不生成 Call Wall / Put Wall 结论和期权策略腿。',
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
      gexMeta: gexData && gexData.freshness !== 'missing' ? {
        source: gexData.source,
        snapshotTs: gexData.snapshot_ts,
        freshness: gexData.freshness,
        confidence: gexData.confidence,
        reason: gexData.is_stale ? 'stale' : 'unusable',
      } : null,
    };
  }

  const gexByStrike = gexData.strikes
    .map(row => ({
      strike: toNumber(row.strike),
      gex: toNumber(row.net_gex),
      callGex: toNumber(row.call_gex),
      putGex: toNumber(row.put_gex),
      callOi: toNumber(row.call_oi),
      putOi: toNumber(row.put_oi),
      callVolume: toNumber(row.call_volume),
      putVolume: toNumber(row.put_volume),
    }))
    .filter(row => row.strike != null && row.gex != null);

  const price = toNumber(gexData.underlying_price) ?? data.price;
  const callWall = toNumber(gexData.call_wall) ?? data.callWall;
  const putWall = toNumber(gexData.put_wall) ?? data.putWall;
  const gammaFlip = toNumber(gexData.gamma_flip);
  const localGamma = toNumber(gexData.local_gamma);
  const gexTotal = toNumber(gexData.global_gex) ?? data.gexTotal;
  const pcr = toNumber(gexData.pcr_oi);
  const pcrVol = toNumber(gexData.pcr_volume);
  const upDistance = Math.max(callWall - price, Math.abs(price) * 0.03);
  const downDistance = Math.max(price - putWall, Math.abs(price) * 0.03);
  const gexText = Math.abs(gexTotal) >= 1e9
    ? `$${(Math.abs(gexTotal) / 1e9).toFixed(2)}B`
    : `$${(Math.abs(gexTotal) / 1e6).toFixed(1)}M`;

  return {
    ...data,
    partialData: undefined,
    gexNotice: buildGexNotice(gexData),
    price,
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
    gexMeta: {
      source: gexData.source,
      snapshotTs: gexData.snapshot_ts,
      freshness: gexData.freshness,
      isStale: Boolean(gexData.is_stale),
      ageMinutes: toNumber(gexData.age_minutes),
      confidence: gexData.confidence,
      providerStatus: gexData.provider_status,
      wallMethod: gexData.wall_method,
    },
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
      support: supportResistance.support || [],
      resistance: supportResistance.resistance || [],
      method: supportResistance.method,
      source: supportResistance.source,
      latestDate: supportResistance.latest_date,
      barCount: supportResistance.bar_count,
    } : null,
    focusScore: srReady && supportResistance.focus?.ready ? supportResistance.focus : null,
    obv: srReady && supportResistance.obv?.status === 'ready' ? {
      latest: toNumber(supportResistance.obv.latest),
      change20d: toNumber(supportResistance.obv.change_20d),
      trend: supportResistance.obv.trend,
      series: supportResistance.obv.series || [],
    } : null,
    mfi: srReady && supportResistance.mfi?.status === 'ready' ? {
      value: toNumber(supportResistance.mfi.value),
      signal: supportResistance.mfi.signal,
      period: supportResistance.mfi.period,
    } : null,
    compositeMomentum: srReady && supportResistance.momentum ? supportResistance.momentum : null,
    volumeProfile: volumeProfile?.status === 'ready' ? {
      source: volumeProfile.source,
      days: volumeProfile.days,
      barCount: volumeProfile.bar_count,
      priceLow: toNumber(volumeProfile.price_low),
      priceHigh: toNumber(volumeProfile.price_high),
      totalVolume: toNumber(volumeProfile.total_volume),
      nodes: volumeProfile.nodes || [],
      highVolumeNodes: volumeProfile.high_volume_nodes || [],
    } : null,
    chainStats: chainReady ? {
      source: chainStats.source,
      snapshotTs: chainStats.snapshot_ts,
      freshness: chainStats.freshness,
      termStructure: chainStats.term_structure || [],
      skew: chainStats.skew || { expiry: null, points: [] },
      ivContractCount: chainStats.iv_contract_count || 0,
      oiDensity: chainStats.oi_density?.status === 'ready' ? {
        source: chainStats.oi_density.source,
        snapshotTs: chainStats.oi_density.snapshot_ts,
        freshness: chainStats.oi_density.freshness,
        aggregation: chainStats.oi_density.aggregation,
        expiryCount: chainStats.oi_density.expiry_count || 0,
        contractCount: chainStats.oi_density.contract_count || 0,
        totalOpenInterest: chainStats.oi_density.total_open_interest || 0,
        points: chainStats.oi_density.points || [],
      } : null,
    } : null,
  };
}

function buildGexNotice(gexData) {
  const stale = Boolean(gexData.is_stale || gexData.freshness === 'stale');
  const partial = gexData.confidence === 'low';
  if (!stale && !partial) return null;

  const age = toNumber(gexData.age_minutes);
  const ageText = age == null ? '' : `，快照约 ${age} 分钟前采集`;
  const quality = gexData.quality || {};
  const contractCount = toNumber(quality.contract_count);
  const missingOiRatio = toNumber(quality.missing_oi_ratio);
  const oiText = contractCount == null || missingOiRatio == null
    ? ''
    : `，${contractCount} 个合约中约 ${(missingOiRatio * 100).toFixed(1)}% 暂缺 OI`;

  return {
    title: stale ? '延迟期权快照' : '部分期权数据',
    message: `当前仍展示已采集的真实 GEX、Call Wall 和 Put Wall${ageText}${oiText}。`,
  };
}
