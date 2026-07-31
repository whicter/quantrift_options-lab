const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');

export function formatNumber(value, digits = 1) {
  return value == null || !Number.isFinite(value) ? '--' : value.toFixed(digits);
}

export function formatPercent(value) {
  return value == null || !Number.isFinite(value) ? '--' : `${value}%`;
}

export function formatInteger(value) {
  return value == null || !Number.isFinite(value) ? '--' : INTEGER_FORMATTER.format(value);
}

export function formatSignedInteger(value) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${formatInteger(value)}`;
}

export function formatSignedNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const number = Number(value);
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

export function formatCompactNumber(value, fallback = '') {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  const number = Number(value);
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${Math.round(number / 1e3)}k`;
  return `${number}`;
}

export function formatEtTimestamp(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} ET`;
}
