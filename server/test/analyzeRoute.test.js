const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const refreshPath = require.resolve('../src/lib/refreshJobs');
const routePath = require.resolve('../src/routes/analyze');
const queryResults = [];
const refreshCalls = [];
const queries = [];
const pool = { async query(sql, params) { queries.push({ sql, params }); return queryResults.shift() || { rows: [] }; } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
require.cache[refreshPath] = {
  id: refreshPath, filename: refreshPath, loaded: true,
  exports: { enqueueRefreshJob: async job => { refreshCalls.push(job); return 'queued'; } },
};
delete require.cache[routePath];
const { sendAnalyzeStatus } = require(routePath);

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test.beforeEach(() => { queryResults.length = 0; refreshCalls.length = 0; queries.length = 0; });

test('unknown symbol is registered and enqueues the complete data bundle', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: false, has_metrics: false, has_options: false, has_quoted_options: false, has_gex: false,
    active_jobs: 0, queue_depth: 3,
    metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'new1' } }, res);
  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.estimated_wait, '约 1 分钟');
  assert.deepEqual(refreshCalls.map(call => call.jobType), [
    'price_history_snapshot', 'symbol_metrics_snapshot', 'option_chain_snapshot',
  ]);
  assert.ok(refreshCalls.every(call => call.requestParams.priority === 100));
});

test('symbol with an existing chain but outdated GEX queues local recompute without refetching options', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: true, has_gex: false,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'RKLB' } }, res);
  assert.equal(res.body.status, 'queued');
  assert.deepEqual(refreshCalls.map(call => call.jobType), ['gex_recompute']);
  assert.equal(refreshCalls[0].provider, 'internal');
  assert.equal(refreshCalls[0].requestParams.priority, 100);
});

test('fully covered symbol returns ready without duplicate jobs', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0,
    metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(refreshCalls.length, 0);
});

test('derived IV Rank readiness satisfies metrics without a Tastytrade job', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_derived_metrics: true, has_options: true, has_quoted_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.coverage.metrics_source, 'derived');
  assert.equal(refreshCalls.some(call => call.jobType === 'symbol_metrics_snapshot'), false);
});

test('recent non-retryable metrics failure is exposed without enqueue loop', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: false, has_options: true, has_quoted_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: true,
    metrics_last_error: 'tastytrade metrics auth unavailable: device challenge',
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'COST' } }, res);
  assert.equal(res.body.status, 'partial');
  assert.equal(res.body.refresh.metrics, 'blocked');
  assert.equal(res.body.blockers[0].field, 'metrics');
  assert.equal(refreshCalls.length, 0);
});

test('malformed ticker is rejected before persistence', async () => {
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: "SS'TS'T'X" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queryResults.length, 0);
});

test('existing chain without bid/ask quotes is queued for an immediate quote refresh', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: false, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'RKLB' } }, res);

  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.coverage.option_quotes, false);
  assert.deepEqual(refreshCalls.map(call => call.jobType), ['option_chain_snapshot']);
  assert.equal(refreshCalls[0].requestParams.reason, 'analyze_on_demand_missing_option_quotes');
  assert.equal(refreshCalls[0].requestParams.require_quotes, true);
  assert.equal(refreshCalls[0].requestParams.priority, 100);
  assert.equal(refreshCalls[0].minIntervalSeconds, 60);
});

test('failed quote collection is exposed without an enqueue loop', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: false, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
    quotes_blocked: true,
    quotes_last_error: 'option quote unavailable: tastytrade returned no usable bid/ask quotes',
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'RKLB' } }, res);

  assert.equal(res.body.status, 'partial');
  assert.equal(res.body.refresh.options, 'blocked');
  assert.deepEqual(res.body.blockers, [{
    field: 'option_quotes',
    reason: 'option quote unavailable: tastytrade returned no usable bid/ask quotes',
  }]);
  assert.equal(refreshCalls.length, 0);
});

test('transient quote collection failure is retried instead of becoming a blocker', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: false, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
    quotes_blocked: false,
    quotes_last_error: null,
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'RKLB' } }, res);

  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.blockers.length, 0);
  assert.deepEqual(refreshCalls.map(call => call.jobType), ['option_chain_snapshot']);
});

test('worker-specific quote authentication failure does not block a different collector', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: false, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false,
    quotes_blocked: false,
    quotes_last_error: 'tastytrade auth unavailable: device challenge',
  }] });
  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'RKLB' } }, res);

  assert.equal(res.body.status, 'queued');
  assert.equal(refreshCalls.length, 1);
  assert.doesNotMatch(queries[1].sql, /tastytrade auth unavailable/);
  assert.doesNotMatch(queries[1].sql, /provider auth unavailable/);
});

test('Analyze candidate is built server-side from the latest quoted chain without returning that chain', async () => {
  const { sendAnalyzeCandidate } = require(routePath);
  queryResults.push(
    { rows: [{ snapshot_id: 42, snapshot_ts: '2026-07-17T15:00:00.000Z', price_close: 100, call_wall: 105, put_wall: 95 }] },
    { rows: [
      { expiry: '2026-08-31', dte: 45, strike: 105, right: 'C', bid: 2, ask: 2.1, volume: 50, openInterest: 500, delta: 0.2, gamma: 0.02, iv: 0.3, contractSymbol: 'TESTC105' },
      { expiry: '2026-08-31', dte: 45, strike: 110, right: 'C', bid: 0.8, ask: 0.9, volume: 50, openInterest: 500, delta: 0.1, gamma: 0.01, iv: 0.28, contractSymbol: 'TESTC110' },
    ] },
  );
  const res = responseRecorder();

  await sendAnalyzeCandidate({ params: { symbol: 'TEST' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.candidate.strategy, 'Bear Call Spread');
  assert.equal(res.body.candidate.legs.length, 2);
  assert.equal('option_contracts' in res.body, false);
  assert.equal('contractSymbol' in res.body.candidate.legs[0], false);
  assert.match(queries[0].sql, /latest_quote_chain/);
  assert.match(queries[0].sql, /model_version/);
  assert.match(queries[1].sql, /snapshot_id = \$1/);
});

test('per-product state reports stale data as stale rather than collapsing to ready', async () => {
  // A symbol can hold a current price and a two-week-old chain at the same
  // time. Existence checks alone would call this 'ready' and show the old
  // chain as if it were current.
  const now = new Date();
  const recent = new Date(now.getTime() - 30 * 60000).toISOString();
  const old = new Date(now.getTime() - 14 * 24 * 60 * 60000).toISOString();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false, quotes_blocked: false,
    price_daily_date: today, price_30m_date: today, price_30m_ts: recent,
    metrics_date: today, option_chain_ts: old, gex_ts: old,
  }] });

  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'TEST' } }, res);

  assert.equal(res.body.products.price_daily.state, 'fresh');
  assert.equal(res.body.products.price_30m.state, 'fresh');
  assert.equal(res.body.products.option_chain.state, 'stale');
  assert.equal(res.body.products.option_chain.is_stale, true);
  // Stale data still reports its real age so the UI can disclose it.
  assert.ok(res.body.products.option_chain.age_minutes > 60);
  assert.equal(res.body.products.gex.state, 'stale');
});

test('missing product with an in-flight refresh reports queued, not missing', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: false, has_metrics: false, has_options: false, has_quoted_options: false, has_gex: false,
    active_jobs: 0, queue_depth: 1, metrics_blocked: false, quotes_blocked: false,
    price_daily_date: null, price_30m_date: null, price_30m_ts: null,
    metrics_date: null, option_chain_ts: null, gex_ts: null,
  }] });

  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'NEW1' } }, res);

  assert.equal(res.body.products.price_daily.state, 'queued');
  assert.equal(res.body.products.option_chain.state, 'queued');
  // GEX is not enqueued while the chain it derives from is still missing.
  assert.equal(res.body.products.gex.state, 'missing');
});

test('a blocked product reports failed rather than a permanent queued spinner', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: false, has_options: false, has_quoted_options: false, has_gex: false,
    active_jobs: 0, queue_depth: 0,
    metrics_blocked: true, metrics_last_error: 'device challenge required',
    quotes_blocked: true, quotes_last_error: 'option quote unavailable: no bid/ask',
    price_daily_date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()),
    price_30m_date: null, price_30m_ts: null, metrics_date: null, option_chain_ts: null, gex_ts: null,
  }] });

  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'TEST' } }, res);

  assert.equal(res.body.products.metrics.state, 'failed');
  assert.equal(res.body.products.option_chain.state, 'failed');
  // A blocked product must not suppress the products that do have real data.
  assert.equal(res.body.products.price_daily.state, 'fresh');
});

test('option quotes are their own product state, not folded into the chain', async () => {
  // A chain can land with zero usable bid/ask. Reporting quotes as fresh
  // because the chain is fresh would claim a strategy leg we cannot build.
  const recent = new Date(Date.now() - 5 * 60000).toISOString();
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: false, has_gex: false,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false, quotes_blocked: false,
    price_daily_date: null, price_30m_date: null, price_30m_ts: null,
    metrics_date: null, option_chain_ts: recent, gex_ts: null,
  }] });

  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'TEST' } }, res);

  assert.equal(res.body.products.option_chain.state, 'fresh');
  assert.equal(res.body.products.option_quotes.state, 'queued');
  assert.equal(res.body.products.option_quotes.freshness, 'missing');
});

test('product states never leak provider or internal source names', async () => {
  queryResults.push({ rows: [] }, { rows: [{
    has_price: true, has_metrics: true, has_options: true, has_quoted_options: true, has_gex: true,
    active_jobs: 0, queue_depth: 0, metrics_blocked: false, quotes_blocked: false,
    price_daily_date: '2026-07-17', price_30m_date: '2026-07-17', price_30m_ts: new Date().toISOString(),
    metrics_date: '2026-07-17', option_chain_ts: new Date().toISOString(), gex_ts: new Date().toISOString(),
  }] });

  const res = responseRecorder();
  await sendAnalyzeStatus({ params: { symbol: 'TEST' } }, res);

  const serialized = JSON.stringify(res.body.products);
  for (const name of ['polygon_licensed', 'ib_internal', 'tt_internal', 'tastytrade', 'stooq']) {
    assert.equal(serialized.includes(name), false, `products must not disclose ${name}`);
  }
});

test('summary endpoint assembles positioning and scenarios server-side', async () => {
  const { sendAnalyzeSummary } = require(routePath);
  queryResults.push(
    { rows: [{
      snapshot_id: 5, source: 'polygon_licensed', provider_status: 'ok',
      snapshot_ts: new Date().toISOString(), confidence: 'high', underlying_price: 210,
      global_gex: 1_100_000_000, local_gamma: 5_000_000, gamma_flip: 205, gamma_regime: 'positive',
      call_wall: 220, put_wall: 200, max_pain: 210, pcr_oi: 0.85, pcr_volume: 0.9,
      raw_metrics: { model_version: 'gex-v2-1pct-positioning-proxy', unit: 'usd_delta_change_per_1pct_move' },
    }] },
    { rows: [{ strike: 210, net_gex: 1 }] },
  );
  const res = responseRecorder();
  await sendAnalyzeSummary({ params: { symbol: 'AAPL' }, get: () => '' }, res);

  assert.equal(res.body.positioning.available, true);
  assert.match(res.body.positioning.conclusion, /正Gamma/);
  assert.equal(res.body.scenarios.up_trigger, 220);
  assert.equal(res.body.data_status.label.includes('polygon'), false);
  // Normal (no admin token) response hides provenance.
  assert.equal('provenance' in res.body, false);
});

test('summary endpoint returns an unavailable positioning when no GEX exists', async () => {
  const { sendAnalyzeSummary } = require(routePath);
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendAnalyzeSummary({ params: { symbol: 'ZZZZ' }, get: () => '' }, res);

  assert.equal(res.body.positioning.available, false);
  assert.equal(res.body.scenarios, null);
  assert.equal(res.body.data_status.freshness, 'missing');
});
