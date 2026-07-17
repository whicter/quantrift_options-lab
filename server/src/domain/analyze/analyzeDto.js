'use strict';

/**
 * Unified Analyze summary DTO, assembled server-side.
 *
 * The browser used to fetch GEX and assemble the positioning conclusion,
 * scenarios and data labels itself. This assembles them here so the frontend
 * only renders. For normal users the DTO carries a user-facing data label and
 * hides internal source/provider names; an admin view keeps raw provenance.
 */

const { buildPositioningSummary } = require('./positioningSummary');
const { buildScenarios } = require('./scenarioEngine');

/**
 * User-facing data status. Never leaks provider names -- it says how current
 * the data is and whether it is refreshing, not where it came from.
 */
function dataStatusLabel({ freshness, ageMinutes, refreshStatus }) {
  if (refreshStatus === 'queued' || refreshStatus === 'running') return '刷新中';
  if (freshness === 'missing') return '正在准备数据';
  if (freshness === 'stale') {
    const age = ageLabel(ageMinutes);
    return age ? `延迟行情 · ${age}` : '延迟行情';
  }
  const age = ageLabel(ageMinutes);
  return age ? `数据更新于${age}` : '数据已更新';
}

function ageLabel(ageMinutes) {
  const minutes = Number(ageMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

/**
 * Assemble the summary DTO from a GEX snapshot response object.
 *
 * `gex` is the shape /api/gex returns (freshness, walls, raw_metrics, strikes).
 * `opts.admin` keeps raw source/provider provenance; without it those fields are
 * dropped so normal users never see internal provider names.
 */
function buildAnalyzeSummary(symbol, gex, opts = {}) {
  const admin = Boolean(opts.admin);
  const positioning = buildPositioningSummary(gex, opts.price);
  const scenarios = positioning.available
    ? buildScenarios(positioning.call_wall, positioning.put_wall, positioning.underlying_price)
    : null;

  const dto = {
    symbol,
    data_status: {
      label: dataStatusLabel({
        freshness: gex?.freshness ?? 'missing',
        ageMinutes: gex?.age_minutes,
        refreshStatus: gex?.refresh_status,
      }),
      freshness: gex?.freshness ?? 'missing',
      is_stale: Boolean(gex?.is_stale),
      age_minutes: gex?.age_minutes ?? null,
      refresh_status: gex?.refresh_status ?? null,
    },
    positioning,
    scenarios,
    // Recommendation stays at GET /api/analyze/:symbol/candidate, which already
    // builds legs server-side. Referenced here so the client has one contract.
    recommendation_ref: `/api/analyze/${symbol}/candidate`,
  };

  if (admin) {
    dto.provenance = {
      source: gex?.source ?? null,
      provider_status: gex?.provider_status ?? null,
      snapshot_ts: gex?.snapshot_ts ?? null,
      confidence: gex?.confidence ?? null,
      model_version: gex?.raw_metrics?.model_version ?? null,
    };
  }

  return dto;
}

module.exports = { buildAnalyzeSummary, dataStatusLabel, ageLabel };
