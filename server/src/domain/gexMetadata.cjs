const GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGexMetadata(snapshot = {}, state = {}, options = {}) {
  const raw = snapshot.raw_metrics || snapshot.gex_raw_metrics || {};
  const hasModel = Boolean(raw.model_version || raw.unit || raw.positioning_model);
  const status = options.historical
    ? 'historical'
    : state.freshness || snapshot.gex_status || (hasModel ? 'partial' : 'missing');

  return {
    model: {
      metric: 'estimated_gamma_exposure',
      version: raw.model_version || null,
      unit: raw.unit || null,
      formula_id: raw.formula_id || null,
      positioning_model: raw.positioning_model || null,
      positioning_assumption: raw.positioning_assumption || null,
    },
    data_state: {
      status,
      snapshot_ts: snapshot.snapshot_ts || snapshot.gex_snapshot_ts || null,
      age_minutes: number(state.age_minutes),
      refresh_status: options.refreshStatus || snapshot.refresh_status || 'none',
      source_label: hasModel ? '期权链快照' : null,
      confidence: snapshot.confidence || snapshot.gex_confidence || null,
    },
    coverage: {
      contract_count: number(snapshot.contract_count ?? raw.contract_count_used),
      completeness_pct: number(snapshot.completeness_pct),
      missing_greeks_ratio: number(snapshot.missing_greeks_ratio ?? raw.missing_greeks_ratio),
      missing_oi_ratio: number(snapshot.missing_oi_ratio ?? raw.missing_oi_ratio),
      expiry_start: raw.expiry_start || null,
      expiry_end: raw.expiry_end || null,
      dte_min: number(raw.dte_min),
      dte_max: number(raw.dte_max),
      underlying_price: number(snapshot.underlying_price ?? raw.spot),
      underlying_price_as_of: raw.underlying_price_as_of || snapshot.snapshot_ts || snapshot.gex_snapshot_ts || null,
    },
    parameters: {
      underlying_move_pct: number(raw.underlying_move_pct),
      contract_multiplier: number(raw.contract_multiplier),
      local_gamma_window_pct: number(raw.local_gamma_window_pct),
      gamma_flip_grid_pct: number(raw.gamma_flip_grid_pct),
      gamma_flip_grid_steps: number(raw.gamma_flip_grid_steps),
      max_missing_ratio: number(raw.max_missing_ratio),
      risk_free_rate: number(raw.risk_free_rate),
    },
  };
}

module.exports = { GEX_MODEL_VERSION, buildGexMetadata };
