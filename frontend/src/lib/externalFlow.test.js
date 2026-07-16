import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExternalFlow } from './externalFlow.js';

test('maps provider freshness, summary and typed flow events without inventing values', () => {
  const result = applyExternalFlow({ symbol: 'PLTR' }, {
    source: 'unusual_whales', status: 'active', freshness: 'fresh', is_stale: false,
    provider_last_message_at: '2026-07-15T20:00:00Z', window_hours: 24,
    summary: { option_flow_count: 2, sweep_count: 1, dark_pool_count: 1, option_premium: '50000', dark_pool_notional: '2000000' },
    items: [{ provider_event_id: 'f1', event_type: 'option_flow', contract_symbol: 'PLTR260821C00150000', right: 'C', strike: '150', premium: '50000', has_sweep: true }],
  });
  assert.equal(result.externalFlow.summary.sweepCount, 1);
  assert.equal(result.externalFlow.items[0].strike, 150);
  assert.equal(result.externalFlow.items[0].price, null);
  assert.equal(result.externalFlow.items[0].hasSweep, true);
});

test('preserves explicit missing state', () => {
  const result = applyExternalFlow({ symbol: 'AAPL' }, { status: 'missing', freshness: 'missing', summary: {}, items: [] });
  assert.equal(result.externalFlow.status, 'missing');
  assert.deepEqual(result.externalFlow.items, []);
});
