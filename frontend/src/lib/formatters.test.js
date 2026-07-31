import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCompactNumber,
  formatInteger,
  formatNumber,
  formatPercent,
  formatSignedInteger,
  formatSignedNumber,
} from './formatters.js';

test('numeric formatters share the missing-value contract', () => {
  assert.equal(formatNumber(null), '--');
  assert.equal(formatPercent(Number.NaN), '--');
  assert.equal(formatInteger(undefined), '--');
  assert.equal(formatNumber(12.345, 2), '12.35');
  assert.equal(formatNumber('12.345', 2), '--');
  assert.equal(formatPercent(42.5), '42.5%');
  assert.equal(formatInteger(12345), '12,345');
});

test('signed and compact formatters preserve existing market presentation', () => {
  assert.equal(formatSignedInteger(1000), '+1,000');
  assert.equal(formatSignedInteger(0), '0');
  assert.equal(formatSignedNumber(0), '+0.0');
  assert.equal(formatSignedNumber(-1.25, 2), '-1.25');
  assert.equal(formatCompactNumber(1250000), '1.3M');
  assert.equal(formatCompactNumber(12500), '13k');
  assert.equal(formatCompactNumber(null), '');
});
