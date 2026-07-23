/**
 * Trend-spread series for the Analyze trend chart.
 *
 * `dailySpread` is the daily deviation of price from its trailing 5-bar mean, in
 * percent — the "Trend Spread" bars. `weeklySpread` resamples the daily bars to
 * weekly closes (last close of each ISO week) and computes the same deviation on
 * the weekly series, then expands each weekly value back across that week's daily
 * indices so it can be drawn as a full-width second layer aligned to the daily
 * x-axis (the competitor's "Weekly Spread Context" resonance row).
 *
 * Pure JS, no dependencies, unit-testable.
 */

export function dailySpread(prices) {
  return (prices || []).map((p, i) => {
    const w = prices.slice(Math.max(0, i - 4), i + 1);
    const avg = w.reduce((a, b) => a + b, 0) / w.length;
    return avg ? ((p - avg) / avg) * 100 : 0;
  });
}

/** ISO week key (year + week number) for grouping daily bars into weeks. */
function isoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Weekly spread expanded to the daily index space. `bars` is [{date, close}].
 * Falls back to fixed 5-bar chunks when dates are missing, so it degrades
 * gracefully rather than throwing. Returns an array the same length as `bars`.
 */
export function weeklySpread(bars) {
  const rows = Array.isArray(bars) ? bars : [];
  if (!rows.length) return [];

  // Group daily indices by ISO week (or fixed 5-bar chunks without dates).
  const groups = [];
  let currentKey = null;
  rows.forEach((bar, i) => {
    const key = bar?.date ? isoWeekKey(bar.date) : `chunk-${Math.floor(i / 5)}`;
    if (key !== currentKey) {
      groups.push({ key, indices: [], close: null });
      currentKey = key;
    }
    const g = groups[groups.length - 1];
    g.indices.push(i);
    const close = Number(bar?.close);
    if (Number.isFinite(close)) g.close = close; // last finite close of the week
  });

  const weeklyCloses = groups.map(g => g.close).filter(v => Number.isFinite(v));
  const spreadByGroup = dailySpread(groups.map(g => (Number.isFinite(g.close) ? g.close : weeklyCloses[0] ?? 0)));

  // Expand each group's weekly spread across its daily indices.
  const out = new Array(rows.length).fill(0);
  groups.forEach((g, gi) => {
    g.indices.forEach(idx => { out[idx] = spreadByGroup[gi]; });
  });
  return out;
}
