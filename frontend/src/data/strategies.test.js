import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES } from './strategies.js';

test('includes the expanded advanced, FX, and index strategy templates', () => {
  const ids = new Set(STRATEGIES.map((strategy) => strategy.id));
  const added = [
    'long_call_ladder', 'long_put_ladder', 'call_ratio_calendar', 'put_ratio_calendar',
    'calendar_condor', 'double_diagonal_condor', 'fx_risk_reversal', 'fx_seagull',
    'index_iron_condor', 'index_broken_wing_butterfly',
  ];

  assert.ok(STRATEGIES.length >= 88);
  assert.equal(ids.size, STRATEGIES.length);
  added.forEach((id) => assert.ok(ids.has(id)));
});
