const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../src/db');
const routePath = require.resolve('../src/routes/ledger');
const queryResults = [];
const pool = {
  async query() {
    assert.ok(queryResults.length, 'unexpected database query');
    return queryResults.shift();
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
delete require.cache[routePath];
const { sendLedger } = require(routePath);

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => { queryResults.length = 0; });

test('the overall captured-candidate total is not clobbered by the resolved-only aggregate', async () => {
  // Regression for a real production bug (2026-07-30): aggregateLedger's own
  // `tracked` field means "resolved rows passed into it" (0, since nothing
  // has expired yet) -- a completely different concept from this route's
  // `tracked` (every candidate ever captured). Spreading the aggregate last
  // silently overwrote 23,342 with 0, so the UI showed "追踪中 0" next to
  // "待到期 23,342" for the same dataset.
  queryResults.push(
    { rows: [] }, // resolvedRes: nothing resolved yet
    { rows: [{ tracked: '23342', pending: '23342', next_expiry: new Date('2026-07-29T00:00:00.000Z') }] },
  );
  const res = responseRecorder();
  await sendLedger({}, res);
  assert.equal(res.body.tracked, 23342);
  assert.equal(res.body.pending, 23342);
  assert.equal(res.body.resolved, 0); // aggregateLedger's own (correct) resolved count
});

test('next_expiry renders as a real ISO date, not a Date object\'s verbose toString', async () => {
  // Regression: next_expiry was built via String(dateObject).slice(0, 10),
  // which for a JS Date gives "Wed Jul 29" (from "Wed Jul 29 2026 00:00:00
  // GMT...") instead of "2026-07-29".
  queryResults.push(
    { rows: [] },
    { rows: [{ tracked: '1', pending: '1', next_expiry: new Date('2026-07-29T00:00:00.000Z') }] },
  );
  const res = responseRecorder();
  await sendLedger({}, res);
  assert.equal(res.body.next_expiry, '2026-07-29');
});

test('a null next_expiry (nothing pending) stays null, not a string', async () => {
  queryResults.push({ rows: [] }, { rows: [{ tracked: '5', pending: '0', next_expiry: null }] });
  const res = responseRecorder();
  await sendLedger({}, res);
  assert.equal(res.body.next_expiry, null);
});
