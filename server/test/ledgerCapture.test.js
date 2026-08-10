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
