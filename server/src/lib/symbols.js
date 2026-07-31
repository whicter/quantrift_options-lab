function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidSymbol(symbol, { maxLength = 12, requireLeadingLetter = false } = {}) {
  if (!symbol || symbol.length > maxLength || !/^[A-Z0-9.-]+$/.test(symbol)) return false;
  return !requireLeadingLetter || /^[A-Z]/.test(symbol);
}

function normalizeSymbolList(values, { limit = Infinity, ...validation } = {}) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map(normalizeSymbol)
    .filter(symbol => isValidSymbol(symbol, validation));
  return [...new Set(normalized)].slice(0, limit);
}

module.exports = { normalizeSymbol, isValidSymbol, normalizeSymbolList };
