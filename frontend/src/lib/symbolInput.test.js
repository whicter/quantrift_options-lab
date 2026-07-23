import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTickerInput, sanitizeTickerForSubmit } from './symbolInput.js';

test('normalizes ordinary and full-width ticker input', () => {
  assert.equal(normalizeTickerInput(' stx '), 'STX');
  assert.equal(sanitizeTickerForSubmit('ｔｓｌａ'), 'TSLA');
});

test('rejects malformed IME composition artifacts', () => {
  assert.equal(sanitizeTickerForSubmit("SS'TS'T'XSTX"), '');
  assert.equal(sanitizeTickerForSubmit('苹果'), '');
});
