function number(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  return value?.toISOString?.().slice(0, 10) || String(value || '').slice(0, 10);
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function percentile(values, p) {
  const clean = values
    .filter(value => value != null && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const index = (clean.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return clean[low];
  return clean[low] + (clean[high] - clean[low]) * (index - low);
}

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : null;
}

module.exports = { number, isoDate, average, percentile, pct };
