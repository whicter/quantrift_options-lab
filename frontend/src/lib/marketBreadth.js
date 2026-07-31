// Pure view-model for the Market Internals panel (R2.2 frontend). Turns the
// /api/market/breadth response into render-ready positions and labels so the
// component stays dumb and the geometry is unit-testable. Each block collapses
// to null when its `counted` is 0, so a thin product renders "暂不可用" instead
// of a misleading empty bar.

export const IV_DOMAIN = [0, 100];
export const PCR_DOMAIN = [0.3, 2.3]; // display window; values are clamped into it

export function scalePos(value, [lo, hi]) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

// left/right insets for a p25–p75 band on a 0–100% track.
function band(p25, p75, domain) {
  const left = scalePos(p25, domain);
  const right = p75 == null ? null : 100 - scalePos(p75, domain);
  return { left, right };
}

export function buildBreadthView(breadth) {
  if (!breadth || breadth.status !== 'ready') {
    return { status: breadth?.status || 'missing' };
  }

  const g = breadth.gamma || {};
  const iv = breadth.iv_rank || {};
  const pcr = breadth.pcr || {};
  const t = breadth.trend || {};
  const broad = breadth.broad_market || {};

  let broadMarket = null;
  if (broad.status === 'ready' && broad.counted > 0) {
    const history = Array.isArray(broad.history) ? broad.history : [];
    const maxAbsNet = Math.max(1, ...history.map(point => Math.abs(point.net_advances || 0)));
    broadMarket = {
      marketDate: broad.market_date,
      previousMarketDate: broad.previous_market_date,
      referenceCount: broad.reference_count,
      universeCount: broad.universe_count,
      counted: broad.counted,
      missingPreviousCount: broad.missing_previous_count,
      coveragePct: broad.coverage_pct,
      advances: broad.advances,
      declines: broad.declines,
      unchanged: broad.unchanged,
      advancePct: broad.advance_pct,
      declinePct: broad.decline_pct,
      unchangedPct: broad.unchanged_pct,
      netAdvances: broad.net_advances,
      adRatio: broad.advance_decline_ratio,
      volumeCounted: broad.volume_counted,
      advancingVolumePct: broad.advancing_volume_pct,
      decliningVolumePct: broad.declining_volume_pct,
      exchanges: ['XNYS', 'XNAS', 'XASE']
        .map(code => ({ code, ...(broad.exchanges?.[code] || {}) }))
        .filter(exchange => exchange.counted > 0),
      history: history.map(point => ({
        ...point,
        magnitudePct: Math.abs(point.net_advances || 0) / maxAbsNet * 100,
        tone: point.net_advances > 0 ? 'positive' : point.net_advances < 0 ? 'negative' : 'flat',
      })),
    };
  }

  const gamma = g.counted > 0 && g.positive_pct != null ? {
    positivePct: g.positive_pct,
    negativePct: g.negative_pct,
    counted: g.counted,
  } : null;

  const ivRank = iv.counted > 0 && iv.median != null ? {
    median: iv.median,
    medianPos: scalePos(iv.median, IV_DOMAIN),
    ...band(iv.p25, iv.p75, IV_DOMAIN),
    p25: iv.p25,
    p75: iv.p75,
    elevatedPct: iv.elevated_pct,
    counted: iv.counted,
  } : null;

  const pcrView = pcr.counted > 0 && pcr.median != null ? {
    median: pcr.median,
    medianPos: scalePos(pcr.median, PCR_DOMAIN),
    parityPos: scalePos(1, PCR_DOMAIN),
    ...band(pcr.p25, pcr.p75, PCR_DOMAIN),
    p25: pcr.p25,
    p75: pcr.p75,
    counted: pcr.counted,
    domain: PCR_DOMAIN,
  } : null;

  const trendCounted = Math.max(t.counted_ma50 || 0, t.counted_ma200 || 0);
  const trend = trendCounted > 0 ? {
    aboveMa50Pct: t.above_ma50_pct,
    aboveMa200Pct: t.above_ma200_pct,
    counted: trendCounted,
  } : null;

  return {
    status: 'ready',
    universeCount: breadth.universe_count,
    gammaAsOf: breadth.gamma_as_of,
    broadMarketStatus: broad.status || 'missing',
    broadMarket,
    gamma,
    ivRank,
    pcr: pcrView,
    trend,
    // true only when nothing at all came back usable -> caller can hide.
    empty: !broadMarket && !gamma && !ivRank && !pcrView && !trend,
  };
}
