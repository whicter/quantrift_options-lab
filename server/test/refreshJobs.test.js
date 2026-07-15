const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_OPTIONS_REFRESH_PROVIDER,
  SUPPORTED_OPTIONS_REFRESH_PROVIDERS,
} = require('../src/lib/refreshJobs');

test('default option-chain refresh provider is executable by the worker', () => {
  assert.equal(DEFAULT_OPTIONS_REFRESH_PROVIDER, 'tt_internal');
  assert.equal(SUPPORTED_OPTIONS_REFRESH_PROVIDERS.has(DEFAULT_OPTIONS_REFRESH_PROVIDER), true);
});

test('placeholder provider is not treated as executable', () => {
  assert.equal(SUPPORTED_OPTIONS_REFRESH_PROVIDERS.has('licensed_options_provider'), false);
});
