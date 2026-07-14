const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json();
}

export function getMetrics(symbols) {
  const query = symbols.map(symbol => symbol.toUpperCase()).join(',');
  return getJson(`/api/metrics?symbols=${encodeURIComponent(query)}`);
}

export function getDataStatus() {
  return getJson('/api/status/data');
}

export function getPrices(symbol, limit = 60) {
  return getJson(`/api/prices/${encodeURIComponent(symbol.toUpperCase())}?limit=${limit}`);
}

export { API_BASE };
