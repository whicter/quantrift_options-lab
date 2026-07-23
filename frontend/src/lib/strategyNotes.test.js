import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES } from '../data/strategies.js';

test('every strategy exposes numeric IV, DTE, profit-taking, and stop-loss guidance', () => {
  for (const strategy of STRATEGIES) {
    for (const field of ['iv', 'dte', 'tp', 'sl']) {
      assert.match(strategy.notes[field], /\d/, `${strategy.id} ${field} needs a numeric rule`);
    }
  }
});
