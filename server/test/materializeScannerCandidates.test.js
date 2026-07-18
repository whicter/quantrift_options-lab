const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALGORITHM_VERSION,
  strategyFamily,
  candidateKey,
  buildCandidateBatch,
  pruneOldBatches,
  runMaterialization,
} = require('../src/jobs/materializeScannerCandidates');

function contract({ expiry, dte, strike, right, bid, ask, delta, iv, oi = 500, volume = 50 }) {
  return {
    expiry, dte, strike, right, bid, ask, delta, iv,
    openInterest: oi, volume, mark: (bid + ask) / 2, contractSymbol: `${right}${strike}`,
  };
}

// A vertical-friendly call chain: a 45 DTE bear-call spread clears the score gate.
function callSpreadRow(symbol, { spot = 100 } = {}) {
  return {
    symbol,
    price_close: spot,
    call_wall: 120,
    put_wall: 80,
    gamma_regime: 'positive',
    signal_score: 42,
    gex_snapshot_ts: '2026-07-17T18:00:00.000Z',
    snapshot_ts: '2026-07-17T18:05:00.000Z',
    quote_snapshot_ts: '2026-07-17T17:55:00.000Z',
    option_contracts: [
      contract({ expiry: '2026-08-29', dte: 45, strike: 110, right: 'C', bid: 2.0, ask: 2.1, delta: 0.22, iv: 0.3 }),
      contract({ expiry: '2026-08-29', dte: 45, strike: 115, right: 'C', bid: 0.9, ask: 1.0, delta: 0.12, iv: 0.3 }),
    ],
  };
}

test('strategyFamily maps known strategies and defaults unknown to other', () => {
  assert.equal(strategyFamily('Bull Put Spread'), 'credit_vertical');
  assert.equal(strategyFamily('Iron Condor'), 'iron');
  assert.equal(strategyFamily('Calendar Spread'), 'time_spread');
  assert.equal(strategyFamily('Long Call'), 'single_leg');
  assert.equal(strategyFamily('Jade Lizard'), 'combo');
  assert.equal(strategyFamily('Nonexistent'), 'other');
});

test('candidateKey is stable for the same legs and differs by strike', () => {
  const legs = [
    { action: 'SELL', expiry: '2026-08-29', strike: 110, right: 'C' },
    { action: 'BUY', expiry: '2026-08-29', strike: 115, right: 'C' },
  ];
  const a = candidateKey('AAPL', { strategy: 'Bear Call Spread', legs });
  const b = candidateKey('AAPL', { strategy: 'Bear Call Spread', legs: [...legs].reverse() });
  assert.equal(a, b, 'leg order must not change the key');

  const shifted = candidateKey('AAPL', {
    strategy: 'Bear Call Spread',
    legs: [
      { action: 'SELL', expiry: '2026-08-29', strike: 111, right: 'C' },
      { action: 'BUY', expiry: '2026-08-29', strike: 116, right: 'C' },
    ],
  });
  assert.notEqual(a, shifted);
});

test('buildCandidateBatch ranks globally by score and counts the universe', () => {
  const { universeCount, candidateCount, candidates } = buildCandidateBatch({
    rows: [callSpreadRow('AAA'), callSpreadRow('BBB')],
  });
  assert.equal(universeCount, 2);
  assert.ok(candidateCount >= 2, 'each symbol yields at least one candidate');
  // ranks are dense and monotonic by score
  candidates.forEach((candidate, index) => assert.equal(candidate.rank, index + 1));
  for (let i = 1; i < candidates.length; i += 1) {
    assert.ok(candidates[i - 1].score >= candidates[i].score, 'candidates sorted by score desc');
  }
  const first = candidates[0];
  assert.equal(first.strategy_family, strategyFamily(first.strategy));
  assert.ok(Array.isArray(first.legs_json) && first.legs_json.length >= 1);
  assert.equal(first.freshness_json.input_snapshot_ts, '2026-07-17T17:55:00.000Z');
  assert.equal(first.signals_json.gamma_regime, 'positive');
});

test('buildCandidateBatch dedupes identical setups across rows to the best score', () => {
  const { candidates } = buildCandidateBatch({ rows: [callSpreadRow('AAA'), callSpreadRow('AAA')] });
  const keys = candidates.map(candidate => candidate.candidate_key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate candidate_key survives');
});

test('buildCandidateBatch counts universe even when a symbol yields no candidate', () => {
  const barren = {
    symbol: 'CCC', price_close: 100, call_wall: null, put_wall: null,
    option_contracts: [],
  };
  const { universeCount, candidateCount } = buildCandidateBatch({ rows: [barren] });
  assert.equal(universeCount, 1);
  assert.equal(candidateCount, 0);
});

test('buildCandidateBatch tolerates empty input', () => {
  const result = buildCandidateBatch({ rows: [] });
  assert.deepEqual(result, { universeCount: 0, candidateCount: 0, candidates: [] });
  assert.deepEqual(buildCandidateBatch({}), { universeCount: 0, candidateCount: 0, candidates: [] });
});

function recordingPool(batchId = 77) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM scanner_results_snapshots/.test(sql) && /latest_batch/.test(sql)) {
        return { rows: [callSpreadRow('AAA'), callSpreadRow('BBB')] };
      }
      if (/INSERT INTO scanner_candidate_batches/.test(sql)) {
        return { rows: [{ id: batchId }] };
      }
      if (/DELETE FROM scanner_candidate_batches/.test(sql)) {
        return { rowCount: 2 };
      }
      return { rows: [] };
    },
  };
}

test('runMaterialization inserts a batch, the candidates, and marks it completed', async () => {
  const pool = recordingPool(101);
  const result = await runMaterialization(pool, { scanKey: 'watchlist_v1' });

  assert.equal(result.status, 'completed');
  assert.equal(result.batchId, 101);
  assert.equal(result.algorithmVersion, ALGORITHM_VERSION);
  assert.equal(result.universeCount, 2);
  assert.ok(result.candidateCount >= 2);

  const insertBatch = pool.queries.find(q => /INSERT INTO scanner_candidate_batches/.test(q.sql));
  assert.ok(insertBatch, 'batch row inserted');
  assert.equal(insertBatch.params[0], 'watchlist_v1');
  assert.equal(insertBatch.params[1], ALGORITHM_VERSION);

  const insertCandidates = pool.queries.find(q => /INSERT INTO scanner_candidate_snapshots/.test(q.sql));
  assert.ok(insertCandidates, 'candidate rows inserted');

  const complete = pool.queries.find(q => /UPDATE scanner_candidate_batches/.test(q.sql) && /completed/.test(q.sql));
  assert.ok(complete, 'batch marked completed');
  assert.equal(complete.params[0], 101);

  const prune = pool.queries.find(q => /DELETE FROM scanner_candidate_batches/.test(q.sql));
  assert.ok(prune, 'old batches pruned after completion');
  assert.equal(prune.params[0], 'watchlist_v1');
  assert.equal(prune.params[2], 101, 'the just-written batch is never pruned');
  assert.equal(result.prunedBatches, 2);
});

test('pruneOldBatches keeps the newest N completed and spares the current batch', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 3 };
    },
  };
  const deleted = await pruneOldBatches(pool, 'watchlist_v1', 42);
  assert.equal(deleted, 3);
  assert.match(calls[0].sql, /DELETE FROM scanner_candidate_batches/);
  assert.equal(calls[0].params[0], 'watchlist_v1');
  assert.equal(calls[0].params[1], 5, 'default keep is 5');
  assert.equal(calls[0].params[2], 42);
});

test('pruneOldBatches is disabled when keep <= 0', async () => {
  const original = process.env.SCANNER_CANDIDATE_BATCH_KEEP;
  process.env.SCANNER_CANDIDATE_BATCH_KEEP = '0';
  try {
    let called = false;
    const pool = { async query() { called = true; return { rowCount: 0 }; } };
    const result = await pruneOldBatches(pool, 'watchlist_v1', 1);
    assert.equal(result, null);
    assert.equal(called, false, 'no delete runs when pruning is disabled');
  } finally {
    if (original === undefined) delete process.env.SCANNER_CANDIDATE_BATCH_KEEP;
    else process.env.SCANNER_CANDIDATE_BATCH_KEEP = original;
  }
});

test('pruneOldBatches swallows a delete failure and returns null', async () => {
  const pool = { async query() { throw new Error('delete boom'); } };
  const result = await pruneOldBatches(pool, 'watchlist_v1', 1);
  assert.equal(result, null);
});

test('runMaterialization marks the batch failed when a candidate insert throws', async () => {
  let failedUpdate = null;
  const pool = {
    async query(sql, params) {
      if (/FROM scanner_results_snapshots/.test(sql) && /latest_batch/.test(sql)) {
        return { rows: [callSpreadRow('AAA')] };
      }
      if (/INSERT INTO scanner_candidate_batches/.test(sql)) return { rows: [{ id: 9 }] };
      if (/INSERT INTO scanner_candidate_snapshots/.test(sql)) throw new Error('boom');
      if (/UPDATE scanner_candidate_batches/.test(sql) && /failed/.test(sql)) {
        failedUpdate = { sql, params };
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(runMaterialization(pool, { scanKey: 'watchlist_v1' }), /boom/);
  assert.ok(failedUpdate, 'batch marked failed on error');
  assert.equal(failedUpdate.params[0], 9);
  assert.match(failedUpdate.params[1], /boom/);
});
