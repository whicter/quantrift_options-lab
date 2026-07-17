'use strict';

/**
 * Scenario triggers and targets from Wall positioning, computed server-side.
 *
 * Ported from the browser (analyzeData.js applyGex). The upside path triggers at
 * the Call Wall and targets one wall-distance beyond it; the downside path
 * mirrors it at the Put Wall. A minimum 3% distance floors the target so two
 * walls sitting almost on spot do not collapse into a zero-width scenario.
 */

const { toNumber } = require('./positioningSummary');

const MIN_DISTANCE_PCT = 0.03;

/**
 * Returns { up_trigger, up_target, down_trigger, down_target } or null when the
 * inputs are incomplete. A scenario is a wall-relative research frame, not a
 * prediction; the caller labels it as such.
 */
function buildScenarios(callWall, putWall, price) {
  const call = toNumber(callWall);
  const put = toNumber(putWall);
  const spot = toNumber(price);
  if (call == null || put == null || spot == null) return null;

  const upDistance = Math.max(call - spot, Math.abs(spot) * MIN_DISTANCE_PCT);
  const downDistance = Math.max(spot - put, Math.abs(spot) * MIN_DISTANCE_PCT);

  return {
    up_trigger: round2(call),
    up_target: round2(call + upDistance),
    down_trigger: round2(put),
    down_target: round2(put - downDistance),
  };
}

function round2(value) {
  return Number(value.toFixed(2));
}

module.exports = { buildScenarios, MIN_DISTANCE_PCT };
