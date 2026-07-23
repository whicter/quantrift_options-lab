const runtimeEnv = import.meta.env || {};
const API_BASE = (
  runtimeEnv.VITE_API_URL
  || runtimeEnv.VITE_API_BASE_URL
  || 'http://localhost:3001'
).replace(/\/$/, '');

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEvidence(item) {
  return {
    ...item,
    price: numberOrNull(item?.price),
    weight: numberOrNull(item?.weight),
  };
}

function normalizeZone(zone) {
  return {
    ...zone,
    low: numberOrNull(zone?.low),
    high: numberOrNull(zone?.high),
    center: numberOrNull(zone?.center),
    score: numberOrNull(zone?.score),
    distance_pct: numberOrNull(zone?.distance_pct),
    evidence: Array.isArray(zone?.evidence) ? zone.evidence.map(normalizeEvidence) : [],
  };
}

export function normalizeTechnicalLevels(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      status: 'missing',
      reason: 'invalid_payload',
      supports: [],
      resistances: [],
      options: { status: 'missing', gex: { status: 'missing' }, oi: { status: 'missing' } },
    };
  }
  return {
    ...payload,
    spot: numberOrNull(payload.spot),
    indicators: {
      dma50: numberOrNull(payload.indicators?.dma50),
      dma100: numberOrNull(payload.indicators?.dma100),
      dma200: numberOrNull(payload.indicators?.dma200),
      atr14: numberOrNull(payload.indicators?.atr14),
    },
    supports: Array.isArray(payload.supports) ? payload.supports.map(normalizeZone) : [],
    resistances: Array.isArray(payload.resistances) ? payload.resistances.map(normalizeZone) : [],
    options: {
      status: payload.options?.status || 'missing',
      freshness: payload.options?.freshness || 'missing',
      source: payload.options?.source || null,
      snapshot_ts: payload.options?.snapshot_ts || null,
      gex: payload.options?.gex || { status: 'missing' },
      oi: payload.options?.oi || { status: 'missing' },
    },
  };
}

export async function getTechnicalLevels(symbol, fetchImpl = fetch) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(normalized)) throw new Error('invalid symbol');
  const response = await fetchImpl(`${API_BASE}/api/technical-levels/${encodeURIComponent(normalized)}`);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return normalizeTechnicalLevels(await response.json());
}

export { API_BASE };
