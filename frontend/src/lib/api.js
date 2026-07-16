const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json();
}

async function getAuthenticatedJson(path, token) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export function getMetrics(symbols) {
  const query = symbols.map(symbol => symbol.toUpperCase()).join(',');
  return getJson(`/api/metrics?symbols=${encodeURIComponent(query)}`);
}

export function getDataStatus() {
  return getJson('/api/status/data');
}

export function getScan({
  minIvr = 0,
  maxIvr = 100,
  minIvHv = -999,
  gammaRegime = 'all',
  wall = 'all',
  nearWallPct = '',
  minLocalGamma = '',
  minTotalOi = '',
  minTotalVolume = '',
  minVolumeOiRatio = '',
  minUnusualOi = '',
  minOiDelta = '',
  pcrMin = '',
  pcrMax = '',
  dteMin = '',
  dteMax = '',
  deltaMin = '',
  deltaMax = '',
  maxSpreadPct = '',
  minContractOi = '',
  minContractVolume = '',
  marketCapMin = '',
  marketCapMax = '',
  priceMin = '',
  priceMax = '',
  minUnderlyingVolume = '',
  minDollarVolume = '',
  optionable = 'all',
  sector = '',
  earningsMode = 'all',
  earningsDays = 14,
  unusualOnly = false,
  sort = 'ivr',
  limit = 50,
} = {}) {
  const params = {
    minIvr: String(minIvr),
    maxIvr: String(maxIvr),
    minIvHv: String(minIvHv),
    gammaRegime,
    wall,
    unusualOnly: String(unusualOnly),
    sort,
    limit: String(limit),
  };
  if (nearWallPct !== '') params.nearWallPct = String(nearWallPct);
  if (minLocalGamma !== '') params.minLocalGamma = String(minLocalGamma);
  if (minTotalOi !== '') params.minTotalOi = String(minTotalOi);
  if (minTotalVolume !== '') params.minTotalVolume = String(minTotalVolume);
  if (minVolumeOiRatio !== '') params.minVolumeOiRatio = String(minVolumeOiRatio);
  if (minUnusualOi !== '') params.minUnusualOi = String(minUnusualOi);
  if (minOiDelta !== '') params.minOiDelta = String(minOiDelta);
  if (pcrMin !== '') params.pcrMin = String(pcrMin);
  if (pcrMax !== '') params.pcrMax = String(pcrMax);
  if (dteMin !== '') params.dteMin = String(dteMin);
  if (dteMax !== '') params.dteMax = String(dteMax);
  if (deltaMin !== '') params.deltaMin = String(deltaMin);
  if (deltaMax !== '') params.deltaMax = String(deltaMax);
  if (maxSpreadPct !== '') params.maxSpreadPct = String(maxSpreadPct);
  if (minContractOi !== '') params.minContractOi = String(minContractOi);
  if (minContractVolume !== '') params.minContractVolume = String(minContractVolume);
  if (marketCapMin !== '') params.marketCapMin = String(marketCapMin);
  if (marketCapMax !== '') params.marketCapMax = String(marketCapMax);
  if (priceMin !== '') params.priceMin = String(priceMin);
  if (priceMax !== '') params.priceMax = String(priceMax);
  if (minUnderlyingVolume !== '') params.minUnderlyingVolume = String(minUnderlyingVolume);
  if (minDollarVolume !== '') params.minDollarVolume = String(minDollarVolume);
  if (optionable !== 'all') params.optionable = optionable;
  if (sector) params.sector = sector;
  if (earningsMode !== 'all') params.earningsMode = earningsMode;
  params.earningsDays = String(earningsDays);

  const query = new URLSearchParams(params);
  return getJson(`/api/scan?${query.toString()}`);
}

export function getPrices(symbol, limit = 60) {
  return getJson(`/api/prices/${encodeURIComponent(symbol.toUpperCase())}?limit=${limit}`);
}

export function getGex(symbol) {
  return getJson(`/api/gex/${encodeURIComponent(symbol.toUpperCase())}`);
}

export function getUnusual(symbol, limit = 20) {
  return getJson(`/api/unusual/${encodeURIComponent(symbol.toUpperCase())}?limit=${limit}`);
}

export function getSupportResistance(symbol) {
  return getJson(`/api/sr/${encodeURIComponent(symbol.toUpperCase())}`);
}

export function getChainStats(symbol) {
  return getJson(`/api/chain/stats/${encodeURIComponent(symbol.toUpperCase())}`);
}

export function getAnalyzeStatus(symbol) {
  return getJson(`/api/analyze/${encodeURIComponent(symbol.toUpperCase())}`);
}

export function getMarketRegime() {
  return getJson('/api/market/regime');
}

export function getWeekly(symbol) {
  return getJson(`/api/weekly/${encodeURIComponent(symbol.toUpperCase())}`);
}

export function getVapidPublicKey() {
  return getJson('/api/alerts/vapid-public-key');
}

export function getAccount(token) {
  return getAuthenticatedJson('/api/account/me', token);
}

export function getPortfolio(token) {
  return getAuthenticatedJson('/api/portfolio', token);
}

export async function createPosition(token, payload) {
  const response = await fetch(`${API_BASE}/api/portfolio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export async function closePosition(token, id) {
  const response = await fetch(`${API_BASE}/api/portfolio/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export async function createAlertSubscription(payload) {
  const response = await fetch(`${API_BASE}/api/alerts/subscriptions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export async function deleteAlertSubscription(token) {
  const response = await fetch(`${API_BASE}/api/alerts/subscriptions/${encodeURIComponent(token)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export { API_BASE };
