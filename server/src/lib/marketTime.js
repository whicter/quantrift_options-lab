const NEW_YORK_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const NEW_YORK_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function newYorkDate(value = new Date()) {
  return NEW_YORK_DATE_FORMATTER.format(new Date(value));
}

/**
 * Whether US equities are in their regular 09:30-16:00 ET session.
 *
 * Weekday + clock only: this deliberately does NOT know about market holidays,
 * so it is a necessary-but-not-sufficient gate. Callers use it to avoid work
 * that is guaranteed to be pointless (an options book has no quotes overnight),
 * never to assert that the market IS open -- on a holiday it returns true and
 * the request simply comes back empty, which is the same outcome as any other
 * quoteless response and is handled by the caller's normal path.
 */
function isRegularMarketSession(value = new Date()) {
  const parts = NEW_YORK_PARTS_FORMATTER.formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  // en-US hour12:false renders midnight as "24"; normalize so 24:xx is 00:xx.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

module.exports = { newYorkDate, isRegularMarketSession };
