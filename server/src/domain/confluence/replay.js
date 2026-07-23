const { buildConfluence } = require('./engine');
const { deriveSupportResistance } = require('../../routes/supportResistance');
const { deriveVolumeProfile } = require('../../routes/volumeProfile');
const { wilderAtr } = require('./indicators');

const REPLAY_MODEL_VERSION = 'confluence-g5-v1';
const CONTROL_BAND_PCT = 0.005;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function intersects(bar, zone) {
  return finite(bar.low) <= zone.high && finite(bar.high) >= zone.low;
}

function baselineZones(structure) {
  const makeZones = levels => levels.map(level => ({
    low: level.price * (1 - CONTROL_BAND_PCT),
    high: level.price * (1 + CONTROL_BAND_PCT),
    center: level.price,
  }));
  return {
    support: makeZones(structure?.supports || []),
    resistance: makeZones(structure?.resistances || []),
  };
}

function summarizeSide({ zones, side, futureBars, currentClose, atr14 }) {
  const firstTouches = zones.map(zone => ({ zone, index: futureBars.findIndex(bar => intersects(bar, zone)) }))
    .filter(item => item.index >= 0);
  if (!firstTouches.length) return { touched: false, held: null, reversal: false };
  const touch = firstTouches.sort((a, b) => a.index - b.index)[0];
  const fromTouch = futureBars.slice(touch.index);
  const held = side === 'support'
    ? fromTouch.every(bar => finite(bar.close) >= touch.zone.low)
    : fromTouch.every(bar => finite(bar.close) <= touch.zone.high);
  const touchClose = finite(futureBars[touch.index].close);
  const lastClose = finite(futureBars.at(-1).close);
  const minimumMove = (atr14 || currentClose * 0.01) * 0.5;
  const reversal = side === 'support'
    ? lastClose - touchClose >= minimumMove
    : touchClose - lastClose >= minimumMove;
  return { touched: true, held, reversal };
}

function actualReversalSides(history, futureBars, atr14) {
  const current = finite(history.at(-1).close);
  const prior = finite(history.at(-6)?.close);
  const final = finite(futureBars.at(-1)?.close);
  const threshold = (atr14 || current * 0.01) * 0.5;
  if (!current || !prior || !final) return new Set();
  const incoming = current - prior;
  const outgoing = final - current;
  const sides = new Set();
  if (incoming <= -threshold && outgoing >= threshold) sides.add('support');
  if (incoming >= threshold && outgoing <= -threshold) sides.add('resistance');
  return sides;
}

function emptyStats() {
  return { opportunities: 0, touches: 0, holds: 0, reversal_events: 0, reversal_hits: 0 };
}

function recordSide(stats, outcome, actualReversal) {
  stats.opportunities += 1;
  if (outcome.touched) {
    stats.touches += 1;
    if (outcome.held) stats.holds += 1;
    if (actualReversal && outcome.reversal) stats.reversal_hits += 1;
  }
  if (actualReversal) stats.reversal_events += 1;
}

function finalize(stats) {
  return {
    ...stats,
    hold_rate: stats.touches ? stats.holds / stats.touches : null,
    reversal_recall: stats.reversal_events ? stats.reversal_hits / stats.reversal_events : null,
  };
}

function metricAverage(result) {
  const values = [result.hold_rate, result.reversal_recall].filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function evaluateConfluenceReplay(rows, { minHistory = 90, horizonDays = 5 } = {}) {
  const bars = (rows || []).filter(row => [row.high, row.low, row.close].every(value => finite(value) != null));
  const confluenceStats = emptyStats();
  const controlStats = emptyStats();
  const decisions = [];
  for (let index = Math.max(minHistory - 1, 5); index + horizonDays < bars.length; index += 1) {
    // Every derived input is built from this prefix only. Future bars below are
    // used solely to score the published decision, never to create it.
    const history = bars.slice(0, index + 1);
    const futureBars = bars.slice(index + 1, index + 1 + horizonDays);
    const structure = deriveSupportResistance(history);
    const atr14 = wilderAtr(history, 14);
    if (!structure || !atr14) continue;
    const confluence = buildConfluence({
      bars: history,
      structure,
      volumeProfile: deriveVolumeProfile(history, 40),
      gex: null,
      maxZones: 1,
    });
    if (confluence.status !== 'ready') continue;
    const control = baselineZones(structure);
    const actual = actualReversalSides(history, futureBars, atr14);
    for (const side of ['support', 'resistance']) {
      const confluenceOutcome = summarizeSide({ zones: confluence[side], side, futureBars, currentClose: structure.spot, atr14 });
      const controlOutcome = summarizeSide({ zones: control[side], side, futureBars, currentClose: structure.spot, atr14 });
      recordSide(confluenceStats, confluenceOutcome, actual.has(side));
      recordSide(controlStats, controlOutcome, actual.has(side));
    }
    decisions.push({
      as_of_date: history.at(-1).date,
      confluence_zone_counts: { support: confluence.support.length, resistance: confluence.resistance.length },
      control_zone_counts: { support: control.support.length, resistance: control.resistance.length },
    });
  }
  const confluence = finalize(confluenceStats);
  const control = finalize(controlStats);
  const confluenceAverage = metricAverage(confluence);
  const controlAverage = metricAverage(control);
  const relativeImprovement = controlAverage && confluenceAverage != null
    ? (confluenceAverage - controlAverage) / controlAverage
    : null;
  const holdImproved = confluence.hold_rate != null && control.hold_rate != null && confluence.hold_rate > control.hold_rate;
  const recallImproved = confluence.reversal_recall != null && control.reversal_recall != null
    && confluence.reversal_recall > control.reversal_recall;
  return {
    model_version: REPLAY_MODEL_VERSION,
    gamma_mode: 'disabled_for_historical_replay',
    horizon_days: horizonDays,
    min_history: minHistory,
    control: { type: 'single_point_sr_band', band_pct: CONTROL_BAND_PCT, ...control },
    confluence,
    relative_improvement: relativeImprovement,
    gate: {
      threshold: 0.15,
      passed: relativeImprovement != null && relativeImprovement >= 0.15 && holdImproved && recallImproved,
      reason: 'requires_at_least_15pct_composite_lift_and_both_component_metrics_to_improve',
    },
    decisions,
  };
}

module.exports = { REPLAY_MODEL_VERSION, CONTROL_BAND_PCT, baselineZones, evaluateConfluenceReplay };
