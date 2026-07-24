const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateOutcome, aggregateLedger, intrinsic } = require('../src/domain/scanner/ledger.cjs');

test('intrinsic value of a leg at expiry', () => {
  assert.equal(intrinsic('C', 100, 110), 10);
  assert.equal(intrinsic('C', 100, 90), 0);
  assert.equal(intrinsic('P', 100, 90), 10);
  assert.equal(intrinsic('P', 100, 110), 0);
});

test('credit put spread: max profit above the short strike, max loss below the long', () => {
  // SELL 285P / BUY 280P, credit 0.90 -> entry_cash +0.90, max_loss 4.10
  const entry = {
    legs: [
      { action: 'SELL', right: 'P', strike: 285, expiry: '2026-08-28' },
      { action: 'BUY', right: 'P', strike: 280, expiry: '2026-08-28' },
    ],
    entry_cash: 0.9, max_loss: 4.1,
  };
  const above = evaluateOutcome(entry, 300);   // both puts worthless
  assert.equal(above.outcome, 'win');
  assert.equal(above.realized_pnl, 0.9);
  assert.equal(above.return_on_risk, Math.round((0.9 / 4.1) * 1000) / 1000);
  const below = evaluateOutcome(entry, 270);   // both ITM -> -5 + 0.9
  assert.equal(below.outcome, 'loss');
  assert.equal(below.realized_pnl, -4.1);
});

test('long call: pnl is intrinsic minus the debit', () => {
  const entry = { legs: [{ action: 'BUY', right: 'C', strike: 215, expiry: '2026-08-28' }], entry_cash: -8.95, max_loss: 8.95 };
  assert.equal(evaluateOutcome(entry, 230).realized_pnl, 6.05);  // 230-215-8.95, rounded
  assert.equal(evaluateOutcome(entry, 230).outcome, 'win');
  assert.equal(evaluateOutcome(entry, 210).outcome, 'loss');                 // expires worthless -> -8.95
});

test('long straddle wins on a big move beyond the debit', () => {
  const entry = { legs: [{ action: 'BUY', right: 'C', strike: 745, expiry: '2026-08-28' }, { action: 'BUY', right: 'P', strike: 745, expiry: '2026-08-28' }], entry_cash: -28.7, max_loss: 28.7 };
  assert.equal(evaluateOutcome(entry, 800).outcome, 'win');   // |800-745|=55 - 28.7 = +26.3
  assert.equal(evaluateOutcome(entry, 750).outcome, 'loss');  // 5 - 28.7 = -23.7
});

test('multi-expiry (calendar) is not evaluable at a single expiry', () => {
  const cal = { legs: [{ action: 'SELL', right: 'C', strike: 170, expiry: '2026-08-28' }, { action: 'BUY', right: 'C', strike: 170, expiry: '2026-10-16' }], entry_cash: -5.5, max_loss: 5.5 };
  assert.equal(evaluateOutcome(cal, 175).outcome, 'not_evaluable');
});

test('missing underlying close yields no_price, not a fabricated outcome', () => {
  const entry = { legs: [{ action: 'BUY', right: 'C', strike: 100, expiry: '2026-08-28' }], entry_cash: -2, max_loss: 2 };
  assert.equal(evaluateOutcome(entry, null).outcome, 'no_price');
});

test('aggregate: win rate by family + POP calibration, excluding unscored', () => {
  const resolved = [
    { strategy_family: 'credit_vertical', outcome: 'win', return_on_risk: 0.22, pop: 0.72 },
    { strategy_family: 'credit_vertical', outcome: 'loss', return_on_risk: -1, pop: 0.68 },
    { strategy_family: 'single_leg', outcome: 'win', return_on_risk: 0.5, pop: 0.35 },
    { strategy_family: 'time_spread', outcome: 'not_evaluable' },
    { strategy_family: 'single_leg', outcome: 'no_price' },
  ];
  const agg = aggregateLedger(resolved);
  assert.equal(agg.tracked, 5);
  assert.equal(agg.resolved, 3);              // only win/loss
  assert.equal(agg.not_evaluable, 1);
  assert.equal(agg.no_price, 1);
  assert.equal(agg.overall_win_rate, 66.7);   // 2 of 3
  const cv = agg.by_family.find(f => f.strategy_family === 'credit_vertical');
  assert.equal(cv.resolved, 2);
  assert.equal(cv.win_rate, 50);
  // POP 0.72 -> 70-100 bucket (1 win), 0.68 -> 55-70 (0 win of 1), 0.35 -> 0-40 (1 win)
  const b70 = agg.calibration.find(c => c.bucket === '70-100');
  assert.equal(b70.resolved, 1);
  assert.equal(b70.actual_win_rate, 100);
});

test('aggregate is empty-safe when nothing is resolved yet', () => {
  const agg = aggregateLedger([]);
  assert.equal(agg.resolved, 0);
  assert.equal(agg.overall_win_rate, null);
  assert.deepEqual(agg.by_family, []);
});
