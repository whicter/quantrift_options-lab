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
