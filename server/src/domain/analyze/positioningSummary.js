'use strict';

/**
 * Positioning summary: the GEX/Wall conclusion, computed server-side.
 *
 * This narrative and its structured fields used to be assembled in the browser
 * (frontend/src/lib/analyzeData.js applyGex). A product conclusion is exactly
 * the kind of logic that belongs behind the API, so it moves here. The output
 * is byte-identical to the former client output for the usable case.
 */

const SUPPORTED_GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';
const SUPPORTED_GEX_UNIT = 'usd_delta_change_per_1pct_move';

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Compact money label, ported verbatim from the client so text does not shift. */
function compactMoney(value) {
  const n = toNumber(value);
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 5e8) return compactUnit(n, 'B', 1e9, abs >= 1e10 ? 0 : 1);
  if (abs >= 1e6) return compactUnit(n, 'M', 1e6, abs >= 1e7 ? 0 : 1);
  if (abs >= 1e3) return compactUnit(n, 'K', 1e3, abs >= 1e4 ? 0 : 1);
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

function compactUnit(value, unit, divisor, digits) {
  const amount = Math.abs(value) / divisor;
  const formatted = amount.toFixed(digits).replace(/\.0+$|(?<=\.[0-9])0+$/, '');
  return `${value < 0 ? '-' : ''}$${formatted}${unit}`;
}

/** A GEX snapshot is usable only with the current model version and full fields. */
function isUsableGex(gex) {
  if (!gex || gex.freshness === 'missing') return false;
  return toNumber(gex.global_gex) != null
    && toNumber(gex.call_wall) != null
    && toNumber(gex.put_wall) != null
    && Array.isArray(gex.strikes) && gex.strikes.length > 0
    && gex.raw_metrics?.model_version === SUPPORTED_GEX_MODEL_VERSION
    && gex.raw_metrics?.unit === SUPPORTED_GEX_UNIT;
}

function regimeLabel(regime) {
  if (regime === 'positive') return '正';
  if (regime === 'negative') return '负';
  return '近零';
}

/**
 * Reason a positioning conclusion cannot be shown. Distinguishes the states the
 * old client distinguished: legacy model, stale snapshot, and plain unusable.
 */
function unavailableReason(gex) {
  if (gex?.raw_metrics?.model_version && gex.raw_metrics.model_version !== SUPPORTED_GEX_MODEL_VERSION) {
    return { code: 'legacy_model', message: 'GEX 快照使用旧模型口径，等待新模型重算后再生成 GEX / Wall 结论和期权策略腿。' };
  }
  if (gex?.freshness === 'stale') {
    return { code: 'stale', message: 'GEX/Wall 快照已过期，暂不生成 Call Wall / Put Wall 结论和期权策略腿。' };
  }
  return { code: 'unusable', message: 'GEX/Wall 快照不可用，暂不生成 Call Wall / Put Wall 结论和期权策略腿。' };
}

/**
 * Build the positioning summary from a GEX snapshot object.
 *
 * `price` is the analyze page's current underlying price, used only when the
 * snapshot omits its own. Returns { available, ... } and never throws on
 * absent input: unusable GEX yields available:false with a reason.
 */
function buildPositioningSummary(gex, price = null) {
  if (!isUsableGex(gex)) {
    return {
      available: false,
      unavailable_reason: unavailableReason(gex),
      conclusion: 'GEX/Wall 数据不可用或已过期；当前不显示 Call Wall / Put Wall 结论。',
    };
  }

  const gexTotal = toNumber(gex.global_gex);
  const callWall = toNumber(gex.call_wall);
  const putWall = toNumber(gex.put_wall);
  const pcr = toNumber(gex.pcr_oi);
  const maxPain = toNumber(gex.max_pain);
  const regime = gex.gamma_regime;

  return {
    available: true,
    gamma_regime: regime,
    gamma_regime_label: regimeLabel(regime),
    global_gex: gexTotal,
    global_gex_display: compactMoney(gexTotal),
    local_gamma: toNumber(gex.local_gamma),
    gamma_flip: toNumber(gex.gamma_flip),
    call_wall: callWall,
    put_wall: putWall,
    pcr_oi: pcr,
    pcr_volume: toNumber(gex.pcr_volume),
    max_pain: maxPain,
    underlying_price: toNumber(gex.underlying_price) ?? toNumber(price),
    conclusion: `${regimeLabel(regime)}Gamma ${compactMoney(gexTotal)}，Call Wall $${callWall.toFixed(2)} / Put Wall $${putWall.toFixed(2)}；PCR(OI) ${(pcr ?? 0).toFixed(2)}，Max Pain $${(maxPain ?? putWall).toFixed(2)}。`,
  };
}

module.exports = {
  SUPPORTED_GEX_MODEL_VERSION,
  SUPPORTED_GEX_UNIT,
  toNumber,
  compactMoney,
  isUsableGex,
  buildPositioningSummary,
};
