import test from 'node:test';
import assert from 'node:assert/strict';
import { OPPORTUNITY_PRESETS } from './scannerPresets.js';

test('opportunity presets expose explicit scanner filter values', () => {
  assert.deepEqual(OPPORTUNITY_PRESETS.income.values, {
    minIvr: 50, maxIvr: 100, gammaRegime: 'all', wall: 'all', nearWallPct: '', unusualOnly: false, minUnusualOi: '', sort: 'ivr',
  });
  assert.equal(OPPORTUNITY_PRESETS.wall.values.nearWallPct, '3');
  assert.equal(OPPORTUNITY_PRESETS.activity.values.unusualOnly, true);
  assert.equal(OPPORTUNITY_PRESETS.activity.values.minUnusualOi, '1');
});
