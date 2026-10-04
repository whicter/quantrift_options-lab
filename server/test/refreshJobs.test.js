const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_OPTIONS_REFRESH_PROVIDER,
  SUPPORTED_OPTIONS_REFRESH_PROVIDERS,
  normalizeRefreshSymbol,
} = require('../src/lib/refreshJobs');
const fs = require('node:fs');
const path = require('node:path');

test('default option-chain refresh provider is executable by the worker', () => {
  assert.equal(DEFAULT_OPTIONS_REFRESH_PROVIDER, 'polygon_licensed');
  assert.equal(SUPPORTED_OPTIONS_REFRESH_PROVIDERS.has(DEFAULT_OPTIONS_REFRESH_PROVIDER), true);
});

test('placeholder provider is not treated as executable', () => {
  assert.equal(SUPPORTED_OPTIONS_REFRESH_PROVIDERS.has('licensed_options_provider'), false);
});

test('refresh jobs reject malformed ticker symbols', () => {
  assert.equal(normalizeRefreshSymbol('STX', 'option_chain_snapshot'), 'STX');
  assert.equal(normalizeRefreshSymbol(' stx ', 'symbol_metrics_snapshot'), 'STX');
  assert.equal(normalizeRefreshSymbol("SS'TS'T'XSTX", 'symbol_metrics_snapshot'), null);
});

test('scanner materialize keeps the internal scan sentinel', () => {
  assert.equal(normalizeRefreshSymbol('__SCAN__', 'scanner_materialize'), '__SCAN__');
  assert.equal(normalizeRefreshSymbol('__SCAN__', 'option_chain_snapshot'), null);
});

test('active refresh jobs are deduplicated regardless of age', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/lib/refreshJobs.js'),
    'utf8',
  );
  assert.match(source, /status IN \('queued', 'running'\)/);
  assert.match(source, /OR created_at >= NOW\(\)/);
});

// The market-hours gate on the STALE paths. Option-chain freshness is clock
// based, so a Friday snapshot is stale all weekend and refetching it can only
// return what we already have. Observed 2026-10-04: 26 weekend jobs queued by
// page views, all of them re-fetching an unchanged chain.
const { enqueueRefreshJob } = require('../src/lib/refreshJobs');

const DURING_SESSION = new Date('2026-10-02T17:30:00Z');   // 13:30 ET Friday
const AFTER_CLOSE = new Date('2026-10-03T02:00:00Z');      // 22:00 ET Friday
const WEEKEND = new Date('2026-10-04T17:30:00Z');          // Sunday

test('a stale-path refresh is deferred when the market is shut', async () => {
  for (const when of [AFTER_CLOSE, WEEKEND]) {
    const status = await enqueueRefreshJob({
      symbol: 'AAPL',
      jobType: 'option_chain_snapshot',
      requestParams: { reason: 'stale_chain_snapshot' },
      onlyDuringMarketHours: true,
      now: when,
    });
    assert.equal(status, 'deferred_market_closed', `expected deferral at ${when.toISOString()}`);
  }
});

test('the gate is opt-in, so missing-path refreshes still run out of hours', async () => {
  // A symbol with no chain at all still benefits from its last known state, so
  // these paths deliberately do not pass the flag. Without a database this
  // reaches the query and fails closed rather than returning a deferral, which
  // is enough to prove the gate did not short-circuit it.
  const status = await enqueueRefreshJob({
    symbol: 'AAPL',
    jobType: 'option_chain_snapshot',
    requestParams: { reason: 'missing_chain_snapshot' },
    now: WEEKEND,
  });
  assert.notEqual(status, 'deferred_market_closed');
});

test('during the session the gate does not interfere', async () => {
  const status = await enqueueRefreshJob({
    symbol: 'AAPL',
    jobType: 'option_chain_snapshot',
    requestParams: { reason: 'stale_chain_snapshot' },
    onlyDuringMarketHours: true,
    now: DURING_SESSION,
  });
  assert.notEqual(status, 'deferred_market_closed');
});
