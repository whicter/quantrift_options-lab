const test = require('node:test');
const assert = require('node:assert');
const {
  buildPositioning, describe: describeRow, gapBand, concentrationBand,
} = require('../src/domain/market/positioning');

const row = (over = {}) => ({
  symbol: 'TEST',
  market_date: '2026-08-11',
  spot: 100,
  top_strike: 105,
  distance_to_top_strike_pct: 5,
  call_oi_above: 50000,
  put_oi_above: 5000,
  concentration: 0.4,
  call_put_ratio_above: 10,
  unusual_oi_count: 3,
  days_to_cover: null,
  gex_confidence: 'high',
  fee_rate: null,
  shortable_shares: null,
  ...over,
});

test('empty input reports missing rather than an empty success', () => {
  const dto = buildPositioning([]);
  assert.strictEqual(dto.status, 'missing');
  assert.strictEqual(dto.counted, 0);
  assert.deepStrictEqual(dto.rows, []);
});

test('the DTO always declares itself uncalibrated', () => {
  // Nothing has been scored against an outcome yet; the client must not be able
  // to present these as validated signals.
  assert.strictEqual(buildPositioning([row()]).calibrated, false);
  assert.strictEqual(buildPositioning([]).calibrated, false);
});

test('no note prescribes an action', () => {
  const notes = describeRow(row({
    distance_to_top_strike_pct: 0.5,
    concentration: 0.8,
    call_put_ratio_above: 25,
    unusual_oi_count: 90,
    days_to_cover: 9,
    fee_rate: 32.23,
  }));
  const banned = ['买', '卖', '做多', '做空', '目标', '止损', '建仓', '入场'];
  for (const word of banned) {
    assert.ok(!notes.join('').includes(word), `note prescribes an action: ${word}`);
  }
  assert.ok(notes.length >= 4);
});

test('notes never claim a dealer position', () => {
  const notes = describeRow(row({ concentration: 0.9, call_put_ratio_above: 40 })).join('');
  // Open interest cannot identify who holds which side, and compute_gex's sign
  // convention assumes the opposite of this setup, so dealer language is wrong
  // here in both directions.
  for (const word of ['做市商', '被迫', 'dealer']) {
    assert.ok(!notes.includes(word), `note claims dealer behaviour: ${word}`);
  }
});

test('borrow cost only surfaces above ordinary levels', () => {
  // Universe median is ~0.34%, so an ordinary name must not gain a note that
  // implies something is unusual about it.
  assert.ok(!describeRow(row({ fee_rate: 0.3 })).join('').includes('借券'));
  assert.ok(describeRow(row({ fee_rate: 4 })).join('').includes('借券成本高于常见水平'));
  assert.ok(describeRow(row({ fee_rate: 11.44 })).join('').includes('借券费率 11.4%'));
});

test('borrow cost reaches the DTO', () => {
  const out = buildPositioning([row({ fee_rate: 11.44, shortable_shares: 20000 })]).rows[0];
  assert.strictEqual(out.fee_rate, 11.44);
  assert.strictEqual(out.shortable_shares, 20000);
});

test('a missing borrow reading stays null, never zero', () => {
  // Zero would read as "free to borrow", the opposite conclusion.
  const out = buildPositioning([row()]).rows[0];
  assert.strictEqual(out.fee_rate, null);
  assert.strictEqual(out.shortable_shares, null);
});

test('gap bands run from at-the-strike to far', () => {
  assert.strictEqual(gapBand(0.4).id, 'at');
  assert.strictEqual(gapBand(2).id, 'near');
  assert.strictEqual(gapBand(5).id, 'mid');
  assert.strictEqual(gapBand(30).id, 'far');
  assert.strictEqual(gapBand(null), null);
});

test('concentration bands describe spread vs single-strike', () => {
  assert.strictEqual(concentrationBand(0.75).id, 'tight');
  assert.strictEqual(concentrationBand(0.4).id, 'moderate');
  assert.strictEqual(concentrationBand(0.1).id, 'spread');
});

test('null measures stay null instead of becoming zero', () => {
  const dto = buildPositioning([row({
    concentration: null, call_put_ratio_above: null, days_to_cover: null,
    distance_to_top_strike_pct: null,
  })]);
  const out = dto.rows[0];
  assert.strictEqual(out.concentration, null);
  assert.strictEqual(out.call_put_ratio, null);
  assert.strictEqual(out.days_to_cover, null);
  assert.strictEqual(out.gap_band, null);
});

test('days to cover only appears once it is meaningful', () => {
  assert.ok(!describeRow(row({ days_to_cover: 2 })).join('').includes('回补天数'));
  assert.ok(describeRow(row({ days_to_cover: 7.4 })).join('').includes('回补天数 7.4'));
});

test('market date is carried through for display', () => {
  const dto = buildPositioning([row()], { marketDate: '2026-08-11' });
  assert.strictEqual(dto.market_date, '2026-08-11');
  assert.strictEqual(dto.status, 'ok');
});
