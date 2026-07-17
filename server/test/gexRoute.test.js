const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const optionsPath = require.resolve('../src/routes/options');

const queryResults = [];
const refreshCalls = [];
const pool = {
  async query() {
    assert.ok(queryResults.length > 0, 'unexpected database query');
    return queryResults.shift();
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: pool,
};
require.cache[refreshPath] = {
  id: refreshPath,
  filename: refreshPath,
  loaded: true,
  exports: {
    enqueueRefreshJob: async (job) => {
      refreshCalls.push(job);
      return 'queued';
    },
  },
};
delete require.cache[optionsPath];
const { sendGexSnapshot } = require(optionsPath);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function seededSnapshot(symbol, snapshotTs) {
  return {
    symbol,
    snapshot_id: 42,
    source: 'polygon_licensed',
    snapshot_ts: snapshotTs,
    provider_status: 'ok',
    underlying_price: 100,
    global_gex: 123456,
    local_gamma: 4567,
    gamma_flip: 99.5,
    gamma_regime: 'positive',
    spot_vs_flip_distance_pct: 0.5,
    call_wall: 105,
    put_wall: 95,
    wall_method: 'gex',
    max_pain: 100,
    pcr_oi: 1.1,
    pcr_volume: 0.9,
    confidence: 'high',
    raw_metrics: {
      unit: 'usd_delta_change_per_1pct_move',
      model_version: 'gex-v2-1pct-positioning-proxy',
      formula_id: 'gamma_oi_spot_squared_1pct',
      positioning_model: 'call_positive_put_negative_proxy',
      positioning_assumption: 'Public OI is a positioning proxy.',
      underlying_move_pct: 1,
      contract_multiplier: 100,
    },
    gamma_curve: [{ price: 100, net_gex: 123456 }],
    contract_count: 40,
    completeness_pct: 98,
    missing_greeks_ratio: 0.01,
    missing_oi_ratio: 0.02,
  };
}

test.beforeEach(() => {
  queryResults.length = 0;
  refreshCalls.length = 0;
});

test('seeded GEX snapshot returns computed fields without refresh', async () => {
  queryResults.push(
    { rows: [seededSnapshot('FRESH1', new Date().toISOString())] },
    { rows: [{ strike: 100, call_gex: 200000, put_gex: -100000, net_gex: 100000 }] },
  );
  const res = responseRecorder();

  await sendGexSnapshot({ params: { symbol: 'FRESH1' }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.freshness, 'fresh');
  assert.equal(res.body.source, 'polygon_licensed');
  assert.equal(res.body.gamma_flip, 99.5);
  assert.equal(res.body.call_wall, 105);
  assert.equal(res.body.put_wall, 95);
  assert.equal(res.body.raw_metrics.unit, 'usd_delta_change_per_1pct_move');
  assert.equal(res.body.gex_metadata.model.version, 'gex-v2-1pct-positioning-proxy');
  assert.equal(res.body.gex_metadata.model.unit, 'usd_delta_change_per_1pct_move');
  assert.equal(res.body.gex_metadata.data_state.source_label, '期权链快照');
  assert.equal(res.body.gex_metadata.coverage.contract_count, 40);
  assert.equal(Object.hasOwn(res.body.gex_metadata.data_state, 'source'), false);
  assert.equal(res.body.strikes.length, 1);
  assert.equal(refreshCalls.length, 0);
  assert.equal(queryResults.length, 0);
});

test('missing GEX snapshot returns missing and enqueues one refresh', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();

  await sendGexSnapshot({ params: { symbol: 'MISS1' }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.freshness, 'missing');
  assert.equal(res.body.refresh_status, 'queued');
  assert.equal(res.body.gex_metadata.data_state.status, 'missing');
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].symbol, 'MISS1');
  assert.equal(refreshCalls[0].jobType, 'option_chain_snapshot');
  assert.equal(queryResults.length, 0);
});

test('stale GEX snapshot is returned and only enqueues asynchronous refresh', async () => {
  const staleTs = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  queryResults.push(
    { rows: [seededSnapshot('STALE1', staleTs)] },
    { rows: [] },
  );
  const res = responseRecorder();

  await sendGexSnapshot({ params: { symbol: 'STALE1' }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.freshness, 'stale');
  assert.equal(res.body.is_stale, true);
  assert.equal(res.body.global_gex, 123456);
  assert.equal(res.body.refresh_status, 'queued');
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].requestParams.reason, 'stale_gex_snapshot');
  assert.equal(queryResults.length, 0);
});
