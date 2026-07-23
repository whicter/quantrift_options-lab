const assert = require('node:assert/strict');
const test = require('node:test');

const freshness = require('../src/domain/status/freshness');

const NOW = new Date('2026-07-17T18:00:00Z'); // Friday, 14:00 New York

test('absent data is missing, not an error', () => {
  for (const product of freshness.PRODUCTS) {
    const state = freshness.freshnessFor(product, {}, NOW);
    assert.equal(state.freshness, 'missing', `${product} should be missing`);
    assert.equal(state.is_stale, false);
  }
});

test('unknown product is rejected rather than silently defaulting to fresh', () => {
  assert.throws(() => freshness.freshnessFor('not_a_product', {}, NOW), /unknown data product/);
});

test('daily price is judged by market date so a weekend is not stale', () => {
  // Friday's bar seen the following Sunday: no session has occurred since, so
  // the last close is still current.
  const sunday = new Date('2026-07-19T18:00:00Z');
  const state = freshness.freshnessFor('price_daily', { marketDate: '2026-07-17' }, sunday);
  assert.equal(state.freshness, 'fresh');
  assert.equal(state.age_days, 2);
});

test('daily price past the tolerance is stale and reports its age', () => {
  const state = freshness.freshnessFor('price_daily', { marketDate: '2026-07-01' }, NOW);
  assert.equal(state.freshness, 'stale');
  assert.equal(state.is_stale, true);
  assert.equal(state.age_days, 16);
});

test('30M bars lagging the daily close are stale even when recent', () => {
  // The core P1.4 rule: a strong intraday score from a previous session must
  // never be presented as current confirmation.
  const state = freshness.freshnessFor('price_30m', {
    marketDate: '2026-07-16',
    latestDailyMarketDate: '2026-07-17',
    snapshotTs: '2026-07-16T20:00:00Z',
  }, NOW);
  assert.equal(state.freshness, 'stale');
  assert.equal(state.is_stale, true);
});

test('30M bars matching the daily market date are fresh', () => {
  const state = freshness.freshnessFor('price_30m', {
    marketDate: '2026-07-17',
    latestDailyMarketDate: '2026-07-17',
    snapshotTs: '2026-07-17T17:30:00Z',
  }, NOW);
  assert.equal(state.freshness, 'fresh');
  assert.equal(state.age_minutes, 30);
});

test('30M without a daily bar falls back to the daily tolerance', () => {
  const state = freshness.freshnessFor('price_30m', { marketDate: '2026-07-17' }, NOW);
  assert.equal(state.freshness, 'fresh');
});

test('metrics use a trading-day cadence', () => {
  assert.equal(freshness.freshnessFor('metrics', { marketDate: '2026-07-16' }, NOW).freshness, 'fresh');
  assert.equal(freshness.freshnessFor('metrics', { marketDate: '2026-07-10' }, NOW).freshness, 'stale');
});

test('option chain and GEX are judged by clock age', () => {
  const fresh = freshness.freshnessFor('option_chain', { snapshotTs: '2026-07-17T17:30:00Z' }, NOW);
  assert.equal(fresh.freshness, 'fresh');
  assert.equal(fresh.age_minutes, 30);

  const stale = freshness.freshnessFor('gex', { snapshotTs: '2026-07-17T13:00:00Z' }, NOW);
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.age_minutes, 300);
});

test('age is never negative when a snapshot timestamp is slightly ahead', () => {
  const state = freshness.freshnessFor('option_chain', { snapshotTs: '2026-07-17T18:00:30Z' }, NOW);
  assert.equal(state.age_minutes, 0);
  assert.equal(state.freshness, 'fresh');
});

test('an unparseable timestamp is missing rather than fresh', () => {
  assert.equal(freshness.freshnessFor('option_chain', { snapshotTs: 'not-a-date' }, NOW).freshness, 'missing');
  assert.equal(freshness.freshnessFor('price_daily', { marketDate: 'nonsense' }, NOW).freshness, 'missing');
});

test('real data outranks refresh state so stale never reads as failed', () => {
  // A stale snapshot with a failed refresh is still real data the user can see.
  assert.equal(freshness.resolveState('stale', 'failed'), 'stale');
  assert.equal(freshness.resolveState('stale', 'queued'), 'stale');
  assert.equal(freshness.resolveState('fresh', 'queued'), 'fresh');
});

test('with no usable data the refresh state decides the label', () => {
  assert.equal(freshness.resolveState('missing', 'queued'), 'queued');
  assert.equal(freshness.resolveState('missing', 'running'), 'queued');
  assert.equal(freshness.resolveState('missing', 'failed'), 'failed');
  assert.equal(freshness.resolveState('missing', 'blocked'), 'failed');
  assert.equal(freshness.resolveState('missing', null), 'missing');
});
