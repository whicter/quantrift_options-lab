const { isoDate, number, pct, percentile } = require('../../lib/values');

/**
 * Options-native market breadth. Percentages always disclose the count of
 * symbols that actually supplied each datum, so thin coverage cannot read as
 * broad participation.
 */
function buildBreadth(trendRows, gammaRows, ivRanks) {
  const ma50able = trendRows.filter(row => row.latest != null && row.ma50 != null && row.bars >= 50);
  const ma200able = trendRows.filter(row => row.latest != null && row.ma200 != null && row.bars >= 200);
  const gammaKnown = gammaRows.filter(row => row.gamma_regime);
  const pcrs = gammaRows.map(row => row.pcr_oi).filter(value => value != null && Number.isFinite(value));
  const ranks = ivRanks.filter(value => value != null && Number.isFinite(value));

  return {
    trend: {
      above_ma50_pct: pct(ma50able.filter(row => row.latest >= row.ma50).length, ma50able.length),
      above_ma200_pct: pct(ma200able.filter(row => row.latest >= row.ma200).length, ma200able.length),
      counted_ma50: ma50able.length,
      counted_ma200: ma200able.length,
    },
    gamma: {
      positive_pct: pct(gammaKnown.filter(row => row.gamma_regime === 'positive').length, gammaKnown.length),
      negative_pct: pct(gammaKnown.filter(row => row.gamma_regime === 'negative').length, gammaKnown.length),
      neutral_pct: pct(
        gammaKnown.filter(row => row.gamma_regime !== 'positive' && row.gamma_regime !== 'negative').length,
        gammaKnown.length,
      ),
      counted: gammaKnown.length,
    },
    iv_rank: {
      median: percentile(ranks, 0.5),
      p25: percentile(ranks, 0.25),
      p75: percentile(ranks, 0.75),
      elevated_pct: pct(ranks.filter(value => value >= 50).length, ranks.length),
      counted: ranks.length,
    },
    pcr: {
      median: percentile(pcrs, 0.5),
      p25: percentile(pcrs, 0.25),
      p75: percentile(pcrs, 0.75),
      counted: pcrs.length,
    },
  };
}

function mapBroadMarketRow(row) {
  return {
    market_date: isoDate(row.market_date),
    previous_market_date: isoDate(row.previous_market_date),
    reference_count: Number(row.reference_count),
    universe_count: Number(row.universe_count),
    counted: Number(row.counted),
    missing_previous_count: Number(row.missing_previous_count),
    coverage_pct: number(row.coverage_pct),
    advances: Number(row.advances),
    declines: Number(row.declines),
    unchanged: Number(row.unchanged),
    advance_pct: number(row.advance_pct),
    decline_pct: number(row.decline_pct),
    unchanged_pct: number(row.unchanged_pct),
    net_advances: Number(row.net_advances),
    advance_decline_ratio: number(row.advance_decline_ratio),
    volume_counted: Number(row.volume_counted),
    advancing_volume: number(row.advancing_volume),
    declining_volume: number(row.declining_volume),
    unchanged_volume: number(row.unchanged_volume),
    advancing_volume_pct: number(row.advancing_volume_pct),
    declining_volume_pct: number(row.declining_volume_pct),
    exchanges: row.exchange_breakdown || {},
    collected_at: row.collected_at?.toISOString?.() || row.collected_at || null,
  };
}

function buildBroadMarketBreadth(rows) {
  if (!rows?.length) return { status: 'missing' };
  const mapped = rows.map(mapBroadMarketRow);
  const latest = mapped[0];
  let cumulative = 0;
  const history = mapped.slice().reverse().map(row => {
    cumulative += row.net_advances;
    return {
      market_date: row.market_date,
      advances: row.advances,
      declines: row.declines,
      net_advances: row.net_advances,
      advance_pct: row.advance_pct,
      advancing_volume_pct: row.advancing_volume_pct,
      cumulative_ad: cumulative,
    };
  });
  return { status: 'ready', ...latest, history };
}

module.exports = { buildBreadth, buildBroadMarketBreadth, mapBroadMarketRow };
