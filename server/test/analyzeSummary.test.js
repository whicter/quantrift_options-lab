const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPositioningSummary, isUsableGex, compactMoney, SUPPORTED_GEX_MODEL_VERSION } = require('../src/domain/analyze/positioningSummary');
const { buildScenarios } = require('../src/domain/analyze/scenarioEngine');
const { buildAnalyzeSummary, dataStatusLabel } = require('../src/domain/analyze/analyzeDto');

function usableGex(overrides = {}) {
  return {
    freshness: 'fresh',
    is_stale: false,
    age_minutes: 11,
    source: 'polygon_licensed',
    provider_status: 'ok',
    snapshot_ts: '2026-07-17T15:00:00Z',
    global_gex: 1_100_000_000,
    call_wall: 220,
    put_wall: 200,
    max_pain: 210,
    pcr_oi: 0.85,
    gamma_regime: 'positive',
    underlying_price: 210,
    raw_metrics: { model_version: SUPPORTED_GEX_MODEL_VERSION, unit: 'usd_delta_change_per_1pct_move' },
    strikes: [{ strike: 210, net_gex: 1 }],
    ...overrides,
  };
}

test('compactMoney matches the client formatting the copy was written against', () => {
  assert.equal(compactMoney(1_100_000_000), '$1.1B');
  assert.equal(compactMoney(-2_500_000), '-$2.5M');
  assert.equal(compactMoney(null), '--');
});

test('a legacy-model snapshot is not usable', () => {
  assert.equal(isUsableGex(usableGex({ raw_metrics: { model_version: 'gex-v1', unit: 'x' } })), false);
});

test('positioning conclusion is built server-side, not in the browser', () => {
  const p = buildPositioningSummary(usableGex());
  assert.equal(p.available, true);
  assert.equal(p.gamma_regime_label, '正');
  assert.equal(p.global_gex_display, '$1.1B');
  // The exact conclusion string the client used to assemble.
  assert.equal(p.conclusion, '正Gamma $1.1B，Call Wall $220.00 / Put Wall $200.00；PCR(OI) 0.85，Max Pain $210.00。');
});

test('unusable GEX yields a reason, never a fabricated wall', () => {
  const stale = buildPositioningSummary(usableGex({ freshness: 'stale' }));
  // freshness stale alone still has usable fields; the summary shows them.
  assert.equal(stale.available, true);

  const missing = buildPositioningSummary({ freshness: 'missing' });
  assert.equal(missing.available, false);
  assert.equal(missing.unavailable_reason.code, 'unusable');
  assert.equal(missing.call_wall, undefined);
});

test('a legacy-model reason is distinguished from a plain unusable one', () => {
  const legacy = buildPositioningSummary({ freshness: 'fresh', raw_metrics: { model_version: 'gex-v1' } });
  assert.equal(legacy.available, false);
  assert.equal(legacy.unavailable_reason.code, 'legacy_model');
});

test('scenarios trigger at the walls with a minimum distance floor', () => {
  const s = buildScenarios(220, 200, 210);
  assert.equal(s.up_trigger, 220);
  assert.equal(s.up_target, 230);   // callWall + max(220-210, 3% of 210 = 6.3) = 220 + 10
  assert.equal(s.down_trigger, 200);
  assert.equal(s.down_target, 190); // putWall - max(210-200, 6.3) = 200 - 10
});

test('the distance floor prevents a zero-width scenario when walls hug spot', () => {
  const s = buildScenarios(210.5, 209.5, 210);
  // Raw distances are 0.5, below the 3% floor of 6.3, so the floor applies.
  assert.equal(s.up_target, Number((210.5 + 6.3).toFixed(2)));
  assert.equal(s.down_target, Number((209.5 - 6.3).toFixed(2)));
});

test('scenarios are null when a wall is missing', () => {
  assert.equal(buildScenarios(null, 200, 210), null);
});

test('the data label never leaks a provider name', () => {
  assert.equal(dataStatusLabel({ freshness: 'fresh', ageMinutes: 11 }), '数据更新于11分钟前');
  assert.equal(dataStatusLabel({ freshness: 'stale', ageMinutes: 200 }), '延迟行情 · 3小时前');
  assert.equal(dataStatusLabel({ freshness: 'missing', refreshStatus: 'queued' }), '刷新中');
  assert.equal(dataStatusLabel({ freshness: 'missing' }), '正在准备数据');
});

test('normal DTO hides provenance; admin DTO keeps it', () => {
  const normal = buildAnalyzeSummary('AAPL', usableGex());
  assert.equal('provenance' in normal, false);
  const serialized = JSON.stringify(normal);
  for (const name of ['polygon_licensed', 'ib_internal', 'tt_internal', 'tastytrade']) {
    assert.equal(serialized.includes(name), false, `normal DTO must not disclose ${name}`);
  }

  const adminDto = buildAnalyzeSummary('AAPL', usableGex(), { admin: true });
  assert.equal(adminDto.provenance.source, 'polygon_licensed');
});

test('the DTO points recommendation at the server-side candidate endpoint', () => {
  const dto = buildAnalyzeSummary('AAPL', usableGex());
  assert.equal(dto.recommendation_ref, '/api/analyze/AAPL/candidate');
  assert.equal(dto.scenarios.up_trigger, 220);
});
