const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/ledger');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { async query() { return { rows: [] }; } } };
delete require.cache[routePath];
const { captureLedger } = require(routePath);

function recordingDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
}

test('capture is limited to the top N candidates per symbol, not the whole batch', async () => {
  // Regression for the defect that made the ledger unusable (2026-07-30): this
  // used to insert every row of the batch -- ~11,000 enumerated strike/expiry
  // permutations per run -- so 23,430 rows accumulated in under a week and 64%
  // of them were multi-expiry Diagonal/Calendar structures that can never be
  // scored. The ledger must record what was recommended, not what was ranked.
  const db = recordingDb();
  await captureLedger(db, 2056);

  const { sql, params } = db.calls[0];
  assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY s\.symbol ORDER BY s\.rank ASC\)/);
  assert.match(sql, /WHERE s\.symbol_rank <= \$2/);
  assert.equal(params[0], 2056);
  assert.ok(params[1] >= 1, 'a positive per-symbol cap must be passed');
});

test('first-seen entry pricing is still preserved on repeat capture', async () => {
  // The entry price must stay fixed at first sighting, so a candidate already
  // in the ledger is never rewritten by a later batch.
  const db = recordingDb();
  await captureLedger(db, 2056);
  assert.match(db.calls[0].sql, /ON CONFLICT \(candidate_key, expiry\) DO NOTHING/);
});

test('candidates without an expiry are still excluded', async () => {
  const db = recordingDb();
  await captureLedger(db, 2056);
  assert.match(db.calls[0].sql, /s\.expiry IS NOT NULL/);
});

test('captured POP is the probability, never the risk-free rate', async () => {
  // Regression for a defect that silently disabled POP calibration from the day
  // the ledger shipped (found 2026-08-09): the capture read
  // signals_json->'pop'->>'rate', which is RISK_FREE_RATE, not ->>'probability'.
  // Production held 212 non-null pop rows and every single one was 0.0450, so
  // aggregateLedger's buckets put 100% of the ledger in the 0-40 bin and the
  // model could never be checked against reality. The two keys sit in the same
  // object and differ by one word, so assert on both directions -- a future edit
  // that reintroduces 'rate' fails here rather than in a silently useless chart.
  const db = recordingDb();
  await captureLedger(db, 2056);

  const { sql } = db.calls[0];
  assert.match(sql, /signals_json->'pop'->>'probability'/);
  assert.doesNotMatch(sql, /signals_json->'pop'->>'rate'/);
});

// --- evaluateLedger: retryable gaps must not be written as final outcomes ---

const { evaluateLedger } = require(routePath);

// Minimal db double: one unresolved row, a price lookup that returns nothing,
// and no far-leg marks. Records every statement so the test can assert on
// whether an UPDATE was issued at all.
function ledgerDb({ expiry, legs, close = null, marks = [] }) {
  const calls = [];
  return {
    calls,
    updates: () => calls.filter(c => /UPDATE candidate_ledger/.test(c.sql)),
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM candidate_ledger/.test(sql)) {
        return { rows: [{ id: 1, symbol: 'BAC', expiry, legs_json: legs, entry_cash: -3.77, max_loss: 3.77 }] };
      }
      if (/FROM price_history/.test(sql)) return { rows: close == null ? [] : [{ close }] };
      if (/FROM ledger_far_leg_marks/.test(sql)) return { rows: marks };
      return { rows: [], rowCount: 0 };
    },
  };
}

const DIAGONAL = [
  { action: 'SELL', right: 'C', strike: 65, expiry: '2026-09-11' },
  { action: 'BUY', right: 'C', strike: 58, expiry: '2026-10-16' },
];

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

test('a close that has not been published yet is deferred, never written as no_price', async () => {
  // 2026-08-14: Polygon had not published the daily bar for 270 of 319 symbols
  // by 21:26 ET, so every row expiring that day was finalised `no_price` and
  // could never be looked at again -- including 64 whose one-shot far-leg marks
  // had been captured correctly hours earlier and were never read.
  const db = ledgerDb({ expiry: isoDaysAgo(1), legs: DIAGONAL, close: null });
  const result = await evaluateLedger(db);
  assert.equal(result.resolved, 0);
  assert.equal(result.deferred, 1);
  assert.equal(db.updates().length, 0, 'a deferred row must not be written at all');
});

test('after the grace window the missing close is accepted as the answer', async () => {
  // Otherwise a delisted symbol retries forever and never reports anything.
  const db = ledgerDb({ expiry: isoDaysAgo(30), legs: DIAGONAL, close: null });
  const result = await evaluateLedger(db);
  assert.equal(result.resolved, 1);
  assert.equal(result.deferred, 0);
  const { params } = db.updates()[0];
  assert.equal(params[1], 'no_price');
  assert.equal(params[5], 'underlying_close_missing');
});

test('a missing far-leg mark is final immediately: that observation cannot be retaken', async () => {
  // The settlement date is gone; no later fetch can produce the mark, so
  // deferring would only postpone an outcome that is already decided.
  const db = ledgerDb({ expiry: isoDaysAgo(1), legs: DIAGONAL, close: 66, marks: [] });
  const result = await evaluateLedger(db);
  assert.equal(result.resolved, 1);
  assert.equal(result.deferred, 0);
  assert.equal(db.updates()[0].params[5], 'far_leg_mark_missing');
});

test('with the close and the mark both present the diagonal actually scores', async () => {
  const db = ledgerDb({
    expiry: isoDaysAgo(1), legs: DIAGONAL, close: 66,
    marks: [{ expiry: '2026-10-16', strike: 58, option_right: 'C', mark: 8.2 }],
  });
  const result = await evaluateLedger(db);
  assert.equal(result.resolved, 1);
  const { params } = db.updates()[0];
  assert.equal(params[1], 'win');
  assert.equal(params[3], 3.43);
  assert.equal(params[5], null);
});
