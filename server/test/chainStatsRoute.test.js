const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const optionsPath = require.resolve('../src/routes/options');
const chainPath = require.resolve('../src/routes/chain');
const queryResults = [];
const pool = { async query() { return queryResults.shift(); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
require.cache[optionsPath] = {
  id: optionsPath, filename: optionsPath, loaded: true,
  exports: { sendChainSnapshot() {} },
};
delete require.cache[chainPath];
const { deriveChainStats, deriveOiDensity, sendChainStats } = require(chainPath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const snapshot = { id: 7, underlying_price: 101, source: 'ib_internal', snapshot_ts: new Date().toISOString() };
const contracts = [
  { expiry: '2026-08-21', strike: 100, option_right: 'C', iv: 0.30, delta: 0.55, open_interest: 100 },
  { expiry: '2026-08-21', strike: 100, option_right: 'P', iv: 0.34, delta: -0.45, open_interest: 120 },
  { expiry: '2026-08-21', strike: 105, option_right: 'C', iv: 0.29, delta: 0.35, open_interest: 80 },
  { expiry: '2026-09-18', strike: 100, option_right: 'C', iv: 0.32, delta: 0.56, open_interest: 90 },
  { expiry: '2026-09-18', strike: 100, option_right: 'P', iv: 0.36, delta: -0.44, open_interest: 95 },
];

test('derives ATM term structure and call/put skew from actual contracts', () => {
  const result = deriveChainStats(snapshot, contracts);
  assert.equal(result.term_structure.length, 2);
  assert.equal(result.term_structure[0].atm_iv, 0.32);
  assert.equal(result.skew.expiry, '2026-08-21');
  assert.equal(result.skew.points[0].put_iv, 0.34);
  assert.equal(result.iv_contract_count, 5);
});

test('prefers the stored full-expiry term structure over deriving from the trimmed chain', () => {
  const withStored = {
    ...snapshot,
    term_structure: [
      { expiration_date: '2026-08-21', atm_strike: 100, atm_iv: 0.31, contract_count: 40 },
      { expiration_date: '2026-08-28', atm_strike: 100, atm_iv: 0.33, contract_count: 38 },
      { expiration_date: '2026-09-18', atm_strike: 100, atm_iv: 0.35, contract_count: 36 },
    ],
  };
  const result = deriveChainStats(withStored, contracts);
  // 3 stored expiries, not the 2 that the trimmed contract set would derive
  assert.equal(result.term_structure.length, 3);
  assert.equal(result.term_structure[0].expiry, '2026-08-21');
  assert.equal(result.term_structure[1].expiry, '2026-08-28');
  assert.equal(result.term_structure[2].atm_iv, 0.35);
  // skew still comes from the contract set
  assert.equal(result.skew.expiry, '2026-08-21');
});

test('falls back to deriving term structure when stored is empty or absent', () => {
  assert.equal(deriveChainStats({ ...snapshot, term_structure: [] }, contracts).term_structure.length, 2);
  assert.equal(deriveChainStats(snapshot, contracts).term_structure.length, 2);
});

test('serializes PostgreSQL Date expiries as sortable ISO dates', () => {
  const dated = contracts.map(row => ({ ...row, expiry: new Date(`${row.expiry}T00:00:00Z`) }));
  const result = deriveChainStats(snapshot, dated);
  assert.equal(result.term_structure[0].expiry, '2026-08-21');
  assert.equal(result.term_structure[1].expiry, '2026-09-18');
});

test('aggregates real call and put open interest across nonexpired expiries by strike', () => {
  const result = deriveOiDensity(snapshot, contracts);
  assert.equal(result.status, 'ready');
  assert.equal(result.expiry_count, 2);
  assert.equal(result.points[0].strike, 100);
  assert.equal(result.points[0].call_oi, 190);
  assert.equal(result.points[0].put_oi, 215);
  assert.equal(result.points[0].total_oi, 405);
  assert.equal(result.total_open_interest, 485);
});

test('prefers the wide stored OI-by-strike over the sparse contract chain', () => {
  const withWide = {
    ...snapshot,
    oi_by_strike: {
      window_pct: 29.8,
      max_pain: 105,
      points: [
        { strike: 90, call_oi: 10, put_oi: 4000, total_oi: 4010 },
        { strike: 100, call_oi: 500, put_oi: 500, total_oi: 1000 },
        { strike: 110, call_oi: 3000, put_oi: 20, total_oi: 3020 },
      ],
    },
  };
  const result = deriveOiDensity(withWide, contracts);
  assert.equal(result.aggregation, 'wide_oi_only_adaptive_window');
  assert.equal(result.points.length, 3);         // wide set, not the 2-strike chain
  assert.equal(result.max_pain, 105);
  assert.equal(result.window_pct, 29.8);
  assert.equal(result.points[0].strike, 90);
});

test('falls back to the chain when no wide OI is stored', () => {
  const result = deriveOiDensity(snapshot, contracts);
  assert.equal(result.aggregation, 'all_nonexpired_expiries');
});

test('route returns explicit missing when no IV snapshot exists', async () => {
  queryResults.push({ rows: [] }, { rows: [] });
  const res = responseRecorder();
  await sendChainStats({ params: { symbol: 'MISS' } }, res);
  assert.equal(res.body.status, 'missing');
  assert.deepEqual(res.body.term_structure, []);
});

test('route returns source and derived arrays', async () => {
  queryResults.push({ rows: [snapshot] }, { rows: [snapshot] }, { rows: contracts }, { rows: contracts });
  const res = responseRecorder();
  await sendChainStats({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.source, 'ib_internal');
  assert.equal(res.body.term_structure.length, 2);
  assert.equal(res.body.oi_density.status, 'ready');
  assert.equal(res.body.oi_density.points[0].total_oi, 405);
});

test('route returns OI density when latest usable OI snapshot has no IV', async () => {
  queryResults.push({ rows: [] }, { rows: [snapshot] }, { rows: contracts });
  const res = responseRecorder();
  await sendChainStats({ params: { symbol: 'AAPL' } }, res);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.iv_contract_count, 0);
  assert.equal(res.body.oi_density.status, 'ready');
});
