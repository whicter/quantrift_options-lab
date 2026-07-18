const { fibonacciAnchors, movingAverageLevels, wilderAtr } = require('./indicators');

const CONFLUENCE_MODEL_VERSION = 'confluence-v1-prior';
const CONFLUENCE_WEIGHTS_V1 = Object.freeze({
  volume_profile: 40,
  market_structure: 25,
  atr: 15,
  moving_average: 10,
  gamma: 5,
  fibonacci: 5,
});

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function classifyStrength(score) {
  if (score >= 85) return '极强';
  if (score >= 70) return '强';
  if (score >= 50) return '中';
  return '弱';
}

function addSignal(signals, { price, side, module, score, label, detail = null }) {
  const parsedPrice = finite(price);
  if (!parsedPrice || !side || !module || !score) return;
  signals.push({ price: parsedPrice, side, module, score, label, detail });
}

function buildVolumeSignals(profile, spot) {
  const signals = [];
  if (!profile?.nodes?.length || !spot) return signals;
  const sideFor = price => (price <= spot ? 'support' : 'resistance');
  addSignal(signals, {
    price: profile.poc?.price, side: sideFor(profile.poc?.price), module: 'volume_profile', score: 40,
    label: '成交密集核心位 (POC)', detail: { kind: 'poc' },
  });
  for (const node of profile.high_volume_nodes || []) {
    if (node.price === profile.poc?.price) continue;
    addSignal(signals, {
      price: node.price, side: sideFor(node.price), module: 'volume_profile', score: 24,
      label: '高成交价位 (HVN)', detail: { kind: 'hvn' },
    });
  }
  const valueArea = profile.value_area;
  if (valueArea) {
    addSignal(signals, {
      price: valueArea.low, side: sideFor(valueArea.low), module: 'volume_profile', score: 14,
      label: '价值区下沿 (VAL)', detail: { kind: 'value_area_low' },
    });
    addSignal(signals, {
      price: valueArea.high, side: sideFor(valueArea.high), module: 'volume_profile', score: 14,
      label: '价值区上沿 (VAH)', detail: { kind: 'value_area_high' },
    });
  }
  for (const node of profile.low_volume_nodes || []) {
    addSignal(signals, {
      price: node.price, side: sideFor(node.price), module: 'volume_profile', score: 8,
      label: '低成交过渡位 (LVN)', detail: { kind: 'lvn' },
    });
  }
  return signals;
}

function buildStructureSignals(structure) {
  const signals = [];
  for (const level of structure?.supports || []) {
    const touches = Math.max(1, Number(level.touches) || 1);
    addSignal(signals, {
      price: level.price, side: 'support', module: 'market_structure', score: Math.min(25, 13 + touches * 3),
      label: `历史支撑转折 (${touches} 次)`, detail: { touches },
    });
  }
  for (const level of structure?.resistances || []) {
    const touches = Math.max(1, Number(level.touches) || 1);
    addSignal(signals, {
      price: level.price, side: 'resistance', module: 'market_structure', score: Math.min(25, 13 + touches * 3),
      label: `历史压力转折 (${touches} 次)`, detail: { touches },
    });
  }
  return signals;
}

function buildAtrSignals(bars, spot) {
  const atr14 = wilderAtr(bars, 14);
  const ma = movingAverageLevels(bars);
  if (!atr14 || !ma.ema20 || !spot) return { atr14, signals: [] };
  return {
    atr14,
    signals: [
      { price: ma.ema20 - (atr14 / 2), side: 'support', module: 'atr', score: 15, label: '20EMA 下方半 ATR', detail: { atr14 } },
      { price: ma.ema20 + (atr14 / 2), side: 'resistance', module: 'atr', score: 15, label: '20EMA 上方半 ATR', detail: { atr14 } },
    ],
  };
}

function buildMovingAverageSignals(bars, spot) {
  const levels = movingAverageLevels(bars);
  const signals = [];
  for (const [key, price] of Object.entries(levels)) {
    if (!price) continue;
    addSignal(signals, {
      price,
      side: price <= spot ? 'support' : 'resistance',
      module: 'moving_average',
      score: key === 'sma200' ? 6 : 4,
      label: key.replace('sma', 'SMA').replace('ema', 'EMA'),
      detail: { average: key },
    });
  }
  return signals;
}

function buildGammaSignals(gex) {
  const signals = [];
  addSignal(signals, { price: gex?.put_wall, side: 'support', module: 'gamma', score: 5, label: 'Put Wall', detail: { kind: 'put_wall' } });
  addSignal(signals, { price: gex?.call_wall, side: 'resistance', module: 'gamma', score: 5, label: 'Call Wall', detail: { kind: 'call_wall' } });
  if (gex?.gamma_flip && gex?.spot) {
    addSignal(signals, {
      price: gex.gamma_flip, side: gex.gamma_flip <= gex.spot ? 'support' : 'resistance', module: 'gamma', score: 3,
      label: 'Gamma Flip (模型阈值)', detail: { kind: 'gamma_flip' },
    });
  }
  return signals;
}

function buildFibonacciSignals(bars, spot) {
  const anchorSet = fibonacciAnchors(bars);
  const signals = [];
  for (const anchor of [anchorSet.long, anchorSet.short].filter(Boolean)) {
    for (const level of anchor.levels) {
      addSignal(signals, {
        price: level.price,
        side: level.price <= spot ? 'support' : 'resistance',
        module: 'fibonacci', score: 5,
        label: `${level.label} (${anchor.lookback}d)`, detail: { lookback: anchor.lookback, ratio: level.ratio },
      });
    }
  }
  return signals;
}

function clusterSignals(signals, atr14) {
  const radius = atr14 / 2;
  const widthFloor = atr14 / 4;
  const zones = [];
  for (const signal of [...signals].sort((a, b) => a.price - b.price)) {
    const zone = zones.find(item => Math.abs(signal.price - item.center) <= radius);
    if (!zone) {
      zones.push({ center: signal.price, min: signal.price, max: signal.price, signals: [signal] });
      continue;
    }
    zone.signals.push(signal);
    zone.min = Math.min(zone.min, signal.price);
    zone.max = Math.max(zone.max, signal.price);
    zone.center = zone.signals.reduce((sum, item) => sum + item.price, 0) / zone.signals.length;
  }
  return zones.map(zone => ({
    ...zone,
    low: round(Math.min(zone.min, zone.center - widthFloor)),
    high: round(Math.max(zone.max, zone.center + widthFloor)),
    center: round(zone.center),
  }));
}

function scoreZone(zone) {
  const strongestByModule = new Map();
  for (const signal of zone.signals) {
    const current = strongestByModule.get(signal.module);
    if (!current || current.score < signal.score) strongestByModule.set(signal.module, signal);
  }
  const contributions = [...strongestByModule.values()].map(signal => ({
    module: signal.module,
    score: signal.score,
    max_score: CONFLUENCE_WEIGHTS_V1[signal.module],
    label: signal.label,
  }));
  const score = Math.min(100, contributions.reduce((sum, item) => sum + item.score, 0));
  return {
    ...zone,
    score,
    strength: classifyStrength(score),
    reasons: contributions.sort((a, b) => b.score - a.score),
    signal_count: zone.signals.length,
    module_count: contributions.length,
  };
}

function buildConfluence({ bars, volumeProfile, structure, gex = null, maxZones = 3 }) {
  const normalizedBars = (bars || []).filter(bar => finite(bar.high) && finite(bar.low) && finite(bar.close));
  if (normalizedBars.length < 20) {
    return { status: 'missing', reason: 'requires_20_daily_bars', model_version: CONFLUENCE_MODEL_VERSION, support: [], resistance: [] };
  }
  const spot = finite(gex?.spot) || finite(normalizedBars.at(-1).close);
  const { atr14, signals: atrSignals } = buildAtrSignals(normalizedBars, spot);
  if (!atr14) {
    return { status: 'missing', reason: 'requires_15_daily_bars', model_version: CONFLUENCE_MODEL_VERSION, support: [], resistance: [] };
  }
  const signals = [
    ...buildVolumeSignals(volumeProfile, spot),
    ...buildStructureSignals(structure),
    ...atrSignals,
    ...buildMovingAverageSignals(normalizedBars, spot),
    ...buildGammaSignals({ ...gex, spot }),
    ...buildFibonacciSignals(normalizedBars, spot),
  ];
  const allZones = clusterSignals(signals, atr14).map(scoreZone);
  const toSide = side => allZones
    .filter(zone => (side === 'support' ? zone.center <= spot : zone.center >= spot))
    .sort((a, b) => b.score - a.score || Math.abs(a.center - spot) - Math.abs(b.center - spot))
    .slice(0, maxZones)
    .map(zone => ({
      low: zone.low, high: zone.high, center: zone.center, score: zone.score, strength: zone.strength,
      reasons: zone.reasons, signal_count: zone.signal_count, module_count: zone.module_count,
    }));
  return {
    status: signals.length ? 'ready' : 'missing',
    reason: signals.length ? null : 'no_usable_signals',
    model_version: CONFLUENCE_MODEL_VERSION,
    model_type: 'deterministic_prior',
    weights: CONFLUENCE_WEIGHTS_V1,
    spot,
    atr14: round(atr14),
    clustering: { radius: round(atr14 / 2), minimum_half_width: round(atr14 / 4) },
    input_summary: { daily_bars: normalizedBars.length, volume_profile: Boolean(volumeProfile?.nodes?.length), market_structure: Boolean(structure), gamma: Boolean(gex?.call_wall || gex?.put_wall || gex?.gamma_flip) },
    support: toSide('support'),
    resistance: toSide('resistance'),
  };
}

module.exports = {
  CONFLUENCE_MODEL_VERSION,
  CONFLUENCE_WEIGHTS_V1,
  buildConfluence,
  buildVolumeSignals,
  buildStructureSignals,
  buildAtrSignals,
  buildMovingAverageSignals,
  buildGammaSignals,
  buildFibonacciSignals,
  clusterSignals,
};
