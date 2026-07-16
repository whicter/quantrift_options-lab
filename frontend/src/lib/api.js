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

export { API_BASE };
