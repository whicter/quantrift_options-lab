const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeTickerInput(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

export function isValidTicker(value) {
  return TICKER_PATTERN.test(normalizeTickerInput(value));
}

export function sanitizeTickerForSubmit(value) {
  const normalized = normalizeTickerInput(value);
  return isValidTicker(normalized) ? normalized : '';
}
