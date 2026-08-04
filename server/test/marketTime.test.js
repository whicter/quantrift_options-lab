const assert = require('node:assert/strict');
const test = require('node:test');
const { isRegularMarketSession } = require('../src/lib/marketTime');

// Executable bid/ask only exists while market makers are quoting. Queueing an
// IB quote job overnight burns the retry budget on a job whose failure is
// guaranteed, then marks the symbol permanently unquotable -- observed live on
// SPCX, fetched at 16:31 ET and returning 70 contracts with no bid/ask at all.

test('a weekday inside 09:30-16:00 ET is a session', () => {
  // 2026-08-03 is a Monday. 14:00 UTC = 10:00 EDT.
  assert.equal(isRegularMarketSession(new Date('2026-08-03T14:00:00Z')), true);
});

test('after the close is not a session', () => {
  // 20:31 UTC = 16:31 EDT -- the exact time the SPCX chain came back quoteless.
  assert.equal(isRegularMarketSession(new Date('2026-08-03T20:31:00Z')), false);
});

test('before the open is not a session', () => {
  // 13:00 UTC = 09:00 EDT
  assert.equal(isRegularMarketSession(new Date('2026-08-03T13:00:00Z')), false);
});

test('the open and close boundaries are handled inclusively/exclusively', () => {
  assert.equal(isRegularMarketSession(new Date('2026-08-03T13:30:00Z')), true, '09:30 ET is open');
  assert.equal(isRegularMarketSession(new Date('2026-08-03T20:00:00Z')), false, '16:00 ET is closed');
});

test('weekends are not sessions', () => {
  assert.equal(isRegularMarketSession(new Date('2026-08-01T14:00:00Z')), false, 'Saturday');
  assert.equal(isRegularMarketSession(new Date('2026-08-02T14:00:00Z')), false, 'Sunday');
});

test('midnight ET does not wrap to a session', () => {
  // Guards the hour12:false "24" rendering: 04:00 UTC = 00:00 EDT.
  assert.equal(isRegularMarketSession(new Date('2026-08-04T04:00:00Z')), false);
});
