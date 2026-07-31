const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五'];

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return month && day ? `${Number(month)}月${Number(day)}日` : isoDate;
}

// The API is the source of truth. Dates outside Monday-Friday are omitted
// rather than displayed beneath a guessed weekday.
export function buildEarningsWeekView(raw) {
  if (!raw || raw.status !== 'ready' || !dateKey(raw.week_start)) {
    return { status: raw?.status || 'loading', days: [] };
  }
  const today = dateKey(raw.today);
  const days = WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(raw.week_start, index);
    return { label, date, dateLabel: shortDate(date), isToday: date === today, earnings: [] };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  (raw.earnings || []).forEach(item => {
    const day = byDate.get(dateKey(item.date));
    if (day && item?.symbol) day.earnings.push({ symbol: item.symbol, name: item.name || null, iconUrl: item.icon_url || null });
  });
  return { status: 'ready', days, count: raw.earnings?.length || 0, weekStart: raw.week_start, weekEnd: raw.week_end };
}
