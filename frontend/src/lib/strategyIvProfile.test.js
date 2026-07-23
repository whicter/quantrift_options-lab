import test from 'node:test';
import assert from 'node:assert/strict';
import { strategyIvProfile } from './strategyIvProfile.js';

test('classifies a low IV strategy from its first explicit IV threshold', () => {
  assert.equal(strategyIvProfile('优选 IV Rank < 30 的低 IV 环境；高 IV 时成本更高。'), 'low');
});

test('classifies a high IV strategy from its first explicit IV threshold', () => {
  assert.equal(strategyIvProfile('仅在 IV Rank > 50 的高 IV 环境卖出；低 IV 时权利金薄。'), 'high');
});

test('uses medium when a strategy has no explicit IV regime', () => {
  assert.equal(strategyIvProfile('根据事件与方向选择到期日。'), 'medium');
});
