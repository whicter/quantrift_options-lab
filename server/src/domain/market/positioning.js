'use strict';

/**
 * Call-side positioning view over `squeeze_watch`.
 *
 * Pure: takes rows, returns the DTO. Same contract as the State Matrix -- every
 * label DESCRIBES the option chain and none prescribes an action, because the
 * page is a compliance boundary, not a suggestion box.
 *
 * Two claims this module must never make:
 *
 *   1. That any dealer is positioned a particular way. Open interest does not
 *      identify who holds which side, and compute_gex's own sign convention
 *      assumes dealers are LONG calls -- the opposite of the setup this view
 *      surfaces. `gamma_regime` is therefore not read here at all.
 *   2. That a listed name is likely to move. Nothing has been scored against
 *      outcomes yet; the capture layer started 2026-08-11. The DTO carries
 *      `calibrated: false` so the client cannot present these as validated.
 */

// Descriptive bands. Deliberately coarse: finer buckets would imply a precision
// the underlying thresholds have not earned.
const GAP_BANDS = [
  { max: 1, id: 'at', label: '贴近集中价位' },
  { max: 3, id: 'near', label: '临近集中价位' },
  { max: 6, id: 'mid', label: '价位上方有距离' },
  { max: Infinity, id: 'far', label: '距集中价位较远' },
];

const CONCENTRATION_BANDS = [
  { min: 0.6, id: 'tight', label: '持仓高度集中于单一价位' },
  { min: 0.35, id: 'moderate', label: '持仓相对集中' },
  { min: 0, id: 'spread', label: '持仓分散于多个价位' },
];

function band(list, value, pick) {
  if (value == null) return null;
  return list.find((entry) => pick(entry, value)) || null;
}

function gapBand(pct) {
  return band(GAP_BANDS, pct, (entry, value) => value <= entry.max);
}

function concentrationBand(ratio) {
  return band(CONCENTRATION_BANDS, ratio, (entry, value) => value >= entry.min);
}

/**
 * Facts, in the reader's words. Each string states something measured; none
 * suggests what to do about it.
 */
function describe(row) {
  const notes = [];
  const gap = gapBand(row.distance_to_top_strike_pct);
  if (gap) notes.push(gap.label);
  const concentration = concentrationBand(row.concentration);
  if (concentration) notes.push(concentration.label);

  if (row.call_put_ratio_above != null) {
    if (row.call_put_ratio_above >= 10) notes.push('看涨持仓远超看跌');
    else if (row.call_put_ratio_above >= 4) notes.push('看涨持仓明显占优');
  }
  if (row.unusual_oi_count >= 40) {
    notes.push(`${row.unusual_oi_count} 项持仓异动`);
  }
  if (row.days_to_cover != null && row.days_to_cover >= 5) {
    // "Shares outstanding", never "float": Polygon exposes no true float, so a
    // float-based percentage would be systematically understated.
    notes.push(`回补天数 ${Number(row.days_to_cover).toFixed(1)} 天`);
  }
  return notes;
}

function toRow(row) {
  const spot = Number(row.spot);
  return {
    symbol: row.symbol,
    spot,
    concentration_strike: row.top_strike == null ? null : Number(row.top_strike),
    gap_pct: row.distance_to_top_strike_pct == null
      ? null : Number(row.distance_to_top_strike_pct),
    gap_band: gapBand(row.distance_to_top_strike_pct)?.id ?? null,
    call_oi_above: row.call_oi_above == null ? null : Number(row.call_oi_above),
    put_oi_above: row.put_oi_above == null ? null : Number(row.put_oi_above),
    concentration: row.concentration == null ? null : Number(row.concentration),
    call_put_ratio: row.call_put_ratio_above == null
      ? null : Number(row.call_put_ratio_above),
    unusual_oi_count: row.unusual_oi_count ?? 0,
    days_to_cover: row.days_to_cover == null ? null : Number(row.days_to_cover),
    chain_quality: row.gex_confidence ?? null,
    notes: describe(row),
  };
}

function buildPositioning(rows, { marketDate = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      status: 'missing',
      market_date: marketDate,
      calibrated: false,
      counted: 0,
      rows: [],
    };
  }
  return {
    status: 'ok',
    market_date: marketDate || rows[0].market_date || null,
    // The client must not render these as validated signals. Capture began
    // 2026-08-11 and no row has been scored against an outcome yet.
    calibrated: false,
    counted: rows.length,
    rows: rows.map(toRow),
  };
}

module.exports = {
  buildPositioning,
  describe,
  gapBand,
  concentrationBand,
  GAP_BANDS,
  CONCENTRATION_BANDS,
};
