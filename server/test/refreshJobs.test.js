const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_OPTIONS_REFRESH_PROVIDER,
  SUPPORTED_OPTIONS_REFRESH_PROVIDERS,
  normalizeRefreshSymbol,
} = require('../src/lib/refreshJobs');

test('default option-chain refresh provider is executable by the worker', () => {
  assert.equal(DEFAULT_OPTIONS_REFRESH_PROVIDER, 'tt_internal');
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
