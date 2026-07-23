const express = require('express');
const pool = require('../db');

const router = express.Router();
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,11}$/;
const PROFILE_LIMIT = 2000;
const DAILY_LIMIT = 250;
const OPTION_FRESH_MINUTES = Math.max(30, Number(process.env.OPTION_FRESH_MINUTES || 180));

function toNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits));
}

function toDateString(value) {
  return value?.toISOString?.().slice(0, 10) || String(value || '').slice(0, 10);
}

function newYorkDateFor(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function movingAverage(values, period) {
  return values.length >= period ? average(values.slice(-period)) : null;
}

function normalizeDaily(rows) {
  return rows.map(row => ({
    date: toDateString(row.date),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume) || 0,
    source: row.source,
    createdAt: row.created_at,
  })).filter(row => row.date && [row.high, row.low, row.close].every(Number.isFinite));
}

function normalizeIntraday(rows) {
  return rows.map(row => ({
    timestamp: row.bar_ts || row.timestamp,
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume) || 0,
    source: row.source,
  })).filter(row => row.timestamp && [row.high, row.low, row.close].every(Number.isFinite));
}

function calculateAtr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const ranges = [];
  for (let index = bars.length - period; index < bars.length; index += 1) {
    const bar = bars[index];
    const priorClose = bars[index - 1].close;
    ranges.push(Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - priorClose),
      Math.abs(bar.low - priorClose),
    ));
  }
  return average(ranges);
}

function niceBinSize(rawSize) {
  if (!Number.isFinite(rawSize) || rawSize <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawSize));
  const normalized = rawSize / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function deriveVolumeProfile(rows, spot, maxNodes = 10) {
  const bars = normalizeIntraday(rows).filter(row => row.volume > 0);
  if (!bars.length || !Number.isFinite(spot)) {
    return {
      status: 'missing',
      reason: 'requires_regular_session_30m_volume',
      points: [],
      high_volume_nodes: [],
      poc: null,
    };
  }

  const binSize = niceBinSize(Math.max(spot * 0.005, 0.01));
  const bins = new Map();
  bars.forEach(bar => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const price = Math.round(typicalPrice / binSize) * binSize;
    bins.set(price, (bins.get(price) || 0) + bar.volume);
  });

  const points = [...bins.entries()]
    .map(([price, volume]) => ({ price: round(price), volume: Math.round(volume) }))
    .sort((left, right) => left.price - right.price);
  const ranked = [...points].sort((left, right) => right.volume - left.volume);
  const totalVolume = points.reduce((sum, point) => sum + point.volume, 0);

  return {
    status: 'ready',
    approximation: '30m_bar_typical_price',
    session: 'regular',
    bar_count: bars.length,
    window_start: newYorkDateFor(bars[0].timestamp),
    window_end: newYorkDateFor(bars.at(-1).timestamp),
    price_low: round(Math.min(...bars.map(bar => bar.low))),
    price_high: round(Math.max(...bars.map(bar => bar.high))),
    bin_size: round(binSize),
    total_volume: totalVolume,
    poc: ranked[0] || null,
    high_volume_nodes: ranked.slice(0, maxNodes),
    points,
  };
}

function findPivots(bars, window = 2) {
  const lows = [];
  const highs = [];
  for (let index = window; index < bars.length - window; index += 1) {
    const neighborhood = bars.slice(index - window, index + window + 1);
    if (bars[index].low <= Math.min(...neighborhood.map(bar => bar.low))) {
      lows.push({ ...bars[index], index });
    }
    if (bars[index].high >= Math.max(...neighborhood.map(bar => bar.high))) {
      highs.push({ ...bars[index], index });
    }
  }
  return { lows, highs };
}

function chooseAnchoredVwapAnchor(rows) {
  const bars = normalizeDaily(rows);
  if (bars.length < 20) return null;
  const recentStart = Math.max(2, bars.length - 80);
  const { lows, highs } = findPivots(bars, 2);
  const candidates = [
    ...lows.map(row => ({ ...row, pivotType: 'swing_low', pivotPrice: row.low })),
    ...highs.map(row => ({ ...row, pivotType: 'swing_high', pivotPrice: row.high })),
  ].filter(row => row.index >= recentStart).map(row => {
    const priorVolumes = bars
      .slice(Math.max(0, row.index - 20), row.index)
      .map(bar => bar.volume)
      .filter(value => value > 0);
    const baseline = average(priorVolumes) || 0;
    const volumeRatio = baseline > 0 ? row.volume / baseline : 0;
    const recency = row.index / Math.max(1, bars.length - 1);
    return {
      date: row.date,
      price: row.pivotPrice,
      pivot_type: row.pivotType,
      volume: row.volume,
      volume_ratio: volumeRatio,
      score: volumeRatio * 2 + recency,
    };
  });
  if (!candidates.length) return null;
  const highVolume = candidates.filter(candidate => candidate.volume_ratio >= 1.2);
  const selected = (highVolume.length ? highVolume : candidates)
    .sort((left, right) => right.score - left.score)[0];
  return {
    date: selected.date,
    price: round(selected.price),
    type: `${highVolume.length ? 'high_volume' : 'recent'}_${selected.pivot_type}`,
    reason: highVolume.length
      ? 'highest_scoring_recent_pivot_with_volume_confirmation'
      : 'highest_scoring_recent_pivot_without_volume_confirmation',
    volume: selected.volume,
    volume_ratio: round(selected.volume_ratio, 3),
  };
}

function deriveAnchoredVwap(rows, anchor) {
  if (!anchor) {
    return { status: 'missing', reason: 'anchor_unavailable', value: null, anchor: null };
  }
  const bars = normalizeIntraday(rows)
    .filter(row => newYorkDateFor(row.timestamp) >= anchor.date && row.volume > 0);
  if (!bars.length) {
    return {
      status: 'missing',
      reason: 'intraday_history_does_not_cover_anchor',
      value: null,
      anchor,
    };
  }
  const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
  const value = bars.reduce(
    (sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume,
    0,
  ) / volume;
  return {
    status: 'ready',
    value: round(value),
    anchor,
    interval: '30m',
    session: 'regular',
    bar_count: bars.length,
    window_end: newYorkDateFor(bars.at(-1).timestamp),
  };
}

function weekKey(value) {
  const date = new Date(`${toDateString(value)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function aggregateWeekly(rows) {
  const weekly = [];
  normalizeDaily(rows).forEach(bar => {
    const week = weekKey(bar.date);
    if (!week) return;
    const current = weekly.at(-1);
    if (!current || current.week !== week) {
      weekly.push({
        week,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
      return;
    }
    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume += bar.volume;
  });
  return weekly;
}

function deriveWeeklyStructure(rows) {
  const bars = aggregateWeekly(rows);
  if (bars.length < 12) {
    return { status: 'missing', reason: 'requires_12_weekly_bars', pivots: [], moving_averages: {} };
  }
  const closes = bars.map(bar => bar.close);
  const { lows, highs } = findPivots(bars.map(bar => ({ ...bar, date: bar.week })), 2);
  return {
    status: 'ready',
    bar_count: bars.length,
    latest_week: bars.at(-1).week,
    moving_averages: {
      ma4: round(movingAverage(closes, 4)),
      ma12: round(movingAverage(closes, 12)),
      ma20: round(movingAverage(closes, 20)),
      ma40: round(movingAverage(closes, 40)),
    },
    supports: lows.slice(-5).map(row => ({ price: round(row.low), week: row.date })),
    resistances: highs.slice(-5).map(row => ({ price: round(row.high), week: row.date })),
    bars: bars.slice(-12),
  };
}

function clusterPivotPrices(pivots, tolerancePct = 0.01) {
  const clusters = [];
  [...pivots].sort((left, right) => left.price - right.price).forEach(pivot => {
    const cluster = clusters.find(item => Math.abs(pivot.price / item.price - 1) <= tolerancePct);
    if (!cluster) {
      clusters.push({
        price: pivot.price,
        touches: 1,
        last_date: pivot.date,
      });
      return;
    }
    cluster.price = ((cluster.price * cluster.touches) + pivot.price) / (cluster.touches + 1);
    cluster.touches += 1;
    if (pivot.date > cluster.last_date) cluster.last_date = pivot.date;
  });
  return clusters;
}

function deriveDailyStructure(rows, spot) {
  const bars = normalizeDaily(rows);
  const { lows, highs } = findPivots(bars, 2);
  const supports = clusterPivotPrices(lows.map(row => ({ price: row.low, date: row.date })))
    .filter(level => level.price < spot)
    .sort((left, right) => right.price - left.price)
    .slice(0, 5);
  const resistances = clusterPivotPrices(highs.map(row => ({ price: row.high, date: row.date })))
    .filter(level => level.price > spot)
    .sort((left, right) => left.price - right.price)
    .slice(0, 5);
  return {
    status: bars.length >= 5 ? 'ready' : 'missing',
    supports: supports.map(level => ({ ...level, price: round(level.price) })),
    resistances: resistances.map(level => ({ ...level, price: round(level.price) })),
  };
}

function deriveMovingAverages(rows) {
  const closes = normalizeDaily(rows).map(row => row.close);
  return {
    dma50: round(movingAverage(closes, 50)),
    dma100: round(movingAverage(closes, 100)),
    dma200: round(movingAverage(closes, 200)),
  };
}

function ageMinutes(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 60000) : null;
}

function deriveOptionStructure(spot, gexRow, optionRows = []) {
  const byStrike = new Map();
  optionRows.forEach(row => {
    const strike = toNumber(row.strike);
    const openInterest = toNumber(row.open_interest);
    if (strike == null || openInterest == null || openInterest < 0) return;
    const item = byStrike.get(strike) || { strike, call_oi: 0, put_oi: 0 };
    if (String(row.option_right).toUpperCase() === 'C') item.call_oi += openInterest;
    if (String(row.option_right).toUpperCase() === 'P') item.put_oi += openInterest;
    byStrike.set(strike, item);
  });
  const density = [...byStrike.values()].sort((left, right) => left.strike - right.strike);
  const callWall = density
    .filter(point => point.strike >= spot)
    .sort((left, right) => right.call_oi - left.call_oi)[0] || null;
  const putWall = density
    .filter(point => point.strike <= spot)
    .sort((left, right) => right.put_oi - left.put_oi)[0] || null;
  const snapshotTs = gexRow?.snapshot_ts || optionRows[0]?.snapshot_ts || null;
  const age = ageMinutes(snapshotTs);
  const hasGex = Boolean(gexRow);
  const hasOi = density.length > 0;
  return {
    status: hasGex || hasOi ? 'ready' : 'missing',
    source: gexRow?.source || optionRows[0]?.source || null,
    snapshot_ts: snapshotTs,
    age_minutes: round(age, 1),
    freshness: age != null && age <= OPTION_FRESH_MINUTES ? 'fresh' : hasGex || hasOi ? 'stale' : 'missing',
    dte_window: { min: 7, max: 60 },
    coverage: {
      provider_status: gexRow?.provider_status || null,
      contract_count: toNumber(gexRow?.contract_count),
      completeness_pct: toNumber(gexRow?.completeness_pct),
      missing_greeks_ratio: toNumber(gexRow?.missing_greeks_ratio),
      missing_oi_ratio: toNumber(gexRow?.missing_oi_ratio),
    },
    gex: hasGex ? {
      status: 'ready',
      global_gex: toNumber(gexRow.global_gex),
      local_gamma: toNumber(gexRow.local_gamma),
      gamma_flip: toNumber(gexRow.gamma_flip),
      gamma_regime: gexRow.gamma_regime,
      call_wall: toNumber(gexRow.call_wall),
      put_wall: toNumber(gexRow.put_wall),
      confidence: gexRow.confidence,
    } : { status: 'missing' },
    oi: hasOi ? {
      status: 'ready',
      call_wall: callWall ? { price: callWall.strike, open_interest: callWall.call_oi } : null,
      put_wall: putWall ? { price: putWall.strike, open_interest: putWall.put_oi } : null,
      total_open_interest: density.reduce((sum, point) => sum + point.call_oi + point.put_oi, 0),
      points: density,
    } : { status: 'missing', call_wall: null, put_wall: null, points: [] },
  };
}

function evidence(type, label, price, weight, source, detail = {}) {
  return price == null || !Number.isFinite(Number(price)) ? null : {
    type,
    label,
    price: round(Number(price)),
    weight,
    source,
    ...detail,
  };
}

function collectEvidence({
  spot,
  movingAverages,
  volumeProfile,
  anchoredVwap,
  dailyStructure,
  weeklyStructure,
  options,
}) {
  const items = [
    evidence('dma50', '50DMA', movingAverages.dma50, 14, 'daily_price'),
    evidence('dma100', '100DMA', movingAverages.dma100, 16, 'daily_price'),
    evidence('dma200', '200DMA', movingAverages.dma200, 20, 'daily_price'),
  ];
  if (volumeProfile.status === 'ready') {
    items.push(evidence(
      'volume_poc',
      'Volume Profile POC',
      volumeProfile.poc?.price,
      30,
      '30m_volume_profile',
      { volume: volumeProfile.poc?.volume },
    ));
    volumeProfile.high_volume_nodes.slice(1, 8).forEach((node, index) => {
      items.push(evidence(
        'volume_hvn',
        `Volume HVN ${index + 1}`,
        node.price,
        12,
        '30m_volume_profile',
        { volume: node.volume },
      ));
    });
  }
  if (anchoredVwap.status === 'ready') {
    items.push(evidence(
      'anchored_vwap',
      'Anchored VWAP',
      anchoredVwap.value,
      22,
      '30m_price_volume',
      { anchor_date: anchoredVwap.anchor.date, anchor_type: anchoredVwap.anchor.type },
    ));
  }
  dailyStructure.supports.forEach(level => {
    items.push(evidence(
      'daily_pivot',
      `日线结构 · ${level.touches}次触碰`,
      level.price,
      Math.min(22, 8 + level.touches * 3),
      'daily_price',
      { touches: level.touches, last_date: level.last_date },
    ));
  });
  dailyStructure.resistances.forEach(level => {
    items.push(evidence(
      'daily_pivot',
      `日线结构 · ${level.touches}次触碰`,
      level.price,
      Math.min(22, 8 + level.touches * 3),
      'daily_price',
      { touches: level.touches, last_date: level.last_date },
    ));
  });
  if (weeklyStructure.status === 'ready') {
    Object.entries(weeklyStructure.moving_averages).forEach(([key, value]) => {
      const period = key.replace('ma', '');
      items.push(evidence(`weekly_${key}`, `周 MA${period}`, value, 14, 'weekly_price'));
    });
    weeklyStructure.supports.slice(-3).forEach(level => {
      items.push(evidence('weekly_pivot', '周线结构低点', level.price, 24, 'weekly_price', { week: level.week }));
    });
    weeklyStructure.resistances.slice(-3).forEach(level => {
      items.push(evidence('weekly_pivot', '周线结构高点', level.price, 24, 'weekly_price', { week: level.week }));
    });
  }
  if (options.gex.status === 'ready') {
    items.push(evidence('gex_put_wall', 'Put GEX Wall', options.gex.put_wall, 28, 'gex_snapshot'));
    items.push(evidence('gex_call_wall', 'Call GEX Wall', options.gex.call_wall, 28, 'gex_snapshot'));
    items.push(evidence('gamma_flip', 'Gamma Flip', options.gex.gamma_flip, 18, 'gex_snapshot'));
  }
  if (options.oi.status === 'ready') {
    items.push(evidence(
      'put_oi_wall',
      '最大 Put OI Wall',
      options.oi.put_wall?.price,
      25,
      'option_oi',
      { open_interest: options.oi.put_wall?.open_interest },
    ));
    items.push(evidence(
      'call_oi_wall',
      '最大 Call OI Wall',
      options.oi.call_wall?.price,
      25,
      'option_oi',
      { open_interest: options.oi.call_wall?.open_interest },
    ));
  }
  return items.filter(Boolean).map(item => ({
    ...item,
    side: item.price <= spot ? 'support' : 'resistance',
  }));
}

function strengthForScore(score) {
  if (score >= 75) return 'very_high';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function clusterConfluence(evidenceItems, spot, atr14) {
  const tolerance = Math.max(
    Number.isFinite(atr14) ? atr14 * 0.5 : 0,
    spot * 0.005,
  );
  const clusterSide = side => {
    const clusters = [];
    evidenceItems
      .filter(item => item.side === side)
      .sort((left, right) => left.price - right.price)
      .forEach(item => {
        const cluster = clusters.find(candidate => Math.abs(item.price - candidate.center) <= tolerance);
        if (!cluster) {
          clusters.push({
            low: item.price,
            high: item.price,
            center: item.price,
            totalWeight: item.weight,
            evidence: [item],
          });
          return;
        }
        cluster.low = Math.min(cluster.low, item.price);
        cluster.high = Math.max(cluster.high, item.price);
        cluster.evidence.push(item);
        cluster.totalWeight += item.weight;
        cluster.center = cluster.evidence.reduce(
          (sum, current) => sum + current.price * current.weight,
          0,
        ) / cluster.totalWeight;
      });
    return clusters.map(cluster => {
      const uniqueTypes = new Set(cluster.evidence.map(item => item.type)).size;
      const score = Math.min(100, Math.round(cluster.totalWeight + Math.max(0, uniqueTypes - 1) * 4));
      return {
        side,
        low: round(cluster.low),
        high: round(cluster.high),
        center: round(cluster.center),
        distance_pct: round((cluster.center / spot - 1) * 100),
        score,
        strength: strengthForScore(score),
        evidence_count: cluster.evidence.length,
        evidence: cluster.evidence.sort((left, right) => right.weight - left.weight),
      };
    });
  };

  return {
    method: 'side_first_atr_confluence',
    tolerance: round(tolerance),
    supports: clusterSide('support').sort((left, right) => right.center - left.center).slice(0, 5),
    resistances: clusterSide('resistance').sort((left, right) => left.center - right.center).slice(0, 5),
  };
}

async function loadOptionData(symbol) {
  const gexQuery = pool.query(
    `SELECT g.*, c.underlying_price, c.provider_status, c.contract_count,
            c.completeness_pct, c.missing_greeks_ratio, c.missing_oi_ratio
     FROM gex_snapshots g
     JOIN option_chain_snapshots c ON c.id = g.snapshot_id
     WHERE g.symbol = $1
     ORDER BY g.snapshot_ts DESC
     LIMIT 1`,
    [symbol],
  );
  const oiQuery = pool.query(
    `WITH latest AS (
       SELECT s.id, s.snapshot_ts, s.source
       FROM option_chain_snapshots s
       WHERE s.symbol = $1
         AND EXISTS (
           SELECT 1 FROM option_contract_snapshots c
           WHERE c.snapshot_id = s.id AND c.open_interest IS NOT NULL
         )
       ORDER BY s.snapshot_ts DESC
       LIMIT 1
     )
     SELECT c.strike, c.option_right, c.open_interest,
            latest.snapshot_ts, latest.source
     FROM latest
     JOIN option_contract_snapshots c ON c.snapshot_id = latest.id
     WHERE c.open_interest IS NOT NULL
       AND c.expiry >= (NOW() AT TIME ZONE 'America/New_York')::date + 7
       AND c.expiry <= (NOW() AT TIME ZONE 'America/New_York')::date + 60
     ORDER BY c.strike, c.option_right`,
    [symbol],
  );
  const [gexResult, oiResult] = await Promise.allSettled([gexQuery, oiQuery]);
  return {
    gexRow: gexResult.status === 'fulfilled' ? gexResult.value.rows[0] : null,
    optionRows: oiResult.status === 'fulfilled' ? oiResult.value.rows : [],
    errors: [
      gexResult.status === 'rejected' ? 'gex_query_failed' : null,
      oiResult.status === 'rejected' ? 'oi_query_failed' : null,
    ].filter(Boolean),
  };
}

async function sendTechnicalLevels(req, res) {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const [dailyResult, intradayResult] = await Promise.all([
      pool.query(
        `SELECT date, open, high, low, close, volume, source, created_at
         FROM (
           SELECT date, open, high, low, close, volume, source, created_at
           FROM price_history
           WHERE symbol = $1
           ORDER BY date DESC
           LIMIT $2
         ) recent
         ORDER BY date ASC`,
        [symbol, DAILY_LIMIT],
      ),
      pool.query(
        `SELECT bar_ts, open, high, low, close, volume, source
         FROM (
           SELECT bar_ts, open, high, low, close, volume, source
           FROM price_history_30m
           WHERE symbol = $1
             AND (bar_ts AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
             AND (bar_ts AT TIME ZONE 'America/New_York')::time < TIME '16:00'
           ORDER BY bar_ts DESC
           LIMIT $2
         ) recent
         ORDER BY bar_ts ASC`,
        [symbol, PROFILE_LIMIT],
      ),
    ]);
    const daily = normalizeDaily(dailyResult.rows);
    if (!daily.length) {
      return res.json({
        symbol,
        status: 'missing',
        reason: 'no_daily_price_history',
        supports: [],
        resistances: [],
        options: { status: 'missing', gex: { status: 'missing' }, oi: { status: 'missing' } },
      });
    }

    const spot = daily.at(-1).close;
    const movingAverages = deriveMovingAverages(dailyResult.rows);
    const atr14 = calculateAtr(daily);
    const volumeProfile = deriveVolumeProfile(intradayResult.rows, spot);
    const anchor = chooseAnchoredVwapAnchor(dailyResult.rows);
    const anchoredVwap = deriveAnchoredVwap(intradayResult.rows, anchor);
    const dailyStructure = deriveDailyStructure(dailyResult.rows, spot);
    const weeklyStructure = deriveWeeklyStructure(dailyResult.rows);
    const optionData = await loadOptionData(symbol);
    const options = deriveOptionStructure(spot, optionData.gexRow, optionData.optionRows);
    if (optionData.errors.length) options.query_warnings = optionData.errors;
    const evidenceItems = collectEvidence({
      spot,
      movingAverages,
      volumeProfile,
      anchoredVwap,
      dailyStructure,
      weeklyStructure,
      options,
    });
    const confluence = clusterConfluence(evidenceItems, spot, atr14);
    const latest = daily.at(-1);

    return res.json({
      symbol,
      status: 'ready',
      source: latest.source,
      latest_date: latest.date,
      snapshot_ts: latest.createdAt,
      spot: round(spot),
      bar_count: daily.length,
      indicators: {
        ...movingAverages,
        atr14: round(atr14),
      },
      volume_profile: volumeProfile,
      anchored_vwap: anchoredVwap,
      daily_structure: dailyStructure,
      weekly_structure: weeklyStructure,
      options,
      confluence: {
        method: confluence.method,
        tolerance: confluence.tolerance,
      },
      supports: confluence.supports,
      resistances: confluence.resistances,
    });
  } catch (error) {
    console.error('GET /api/technical-levels/:symbol error:', error.message);
    return res.status(500).json({ status: 'error', error: 'database error' });
  }
}

router.get('/:symbol', sendTechnicalLevels);

module.exports = {
  router,
  aggregateWeekly,
  calculateAtr,
  chooseAnchoredVwapAnchor,
  clusterConfluence,
  deriveAnchoredVwap,
  deriveDailyStructure,
  deriveMovingAverages,
  deriveOptionStructure,
  deriveVolumeProfile,
  deriveWeeklyStructure,
  sendTechnicalLevels,
};
