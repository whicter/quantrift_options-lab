import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEarningsWeekView } from './earningsCalendar.js';

test('earnings calendar creates five weekday columns and groups real dates', () => {
  const view = buildEarningsWeekView({
    status: 'ready', week_start: '2026-07-27', week_end: '2026-07-31', today: '2026-07-29',
    earnings: [
      { symbol: 'MSFT', name: 'Microsoft Corporation', icon_url: 'https://cdn.example/msft.png', date: '2026-07-29' },
      { symbol: 'AAPL', date: '2026-07-30' },
      { symbol: 'OUT', date: '2026-08-01' },
    ],
  });
  assert.equal(view.days.length, 5);
  assert.equal(view.days[2].isToday, true);
  assert.deepEqual(view.days[2].earnings.map(item => item.symbol), ['MSFT']);
  assert.equal(view.days[2].earnings[0].iconUrl, 'https://cdn.example/msft.png');
  assert.deepEqual(view.days[3].earnings.map(item => item.symbol), ['AAPL']);
});

test('next-week calendar does not incorrectly mark a current-week day as today', () => {
  const view = buildEarningsWeekView({
    status: 'ready', week_start: '2026-08-03', week_end: '2026-08-07', today: '2026-07-30',
    earnings: [{ symbol: 'DIS', date: '2026-08-05' }],
  });
  assert.equal(view.days.some(day => day.isToday), false);
  assert.deepEqual(view.days[2].earnings.map(item => item.symbol), ['DIS']);
});
