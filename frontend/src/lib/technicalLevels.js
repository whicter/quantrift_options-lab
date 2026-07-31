function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeZone(zone) {
  return {
    side: zone?.side,
    low: numberOrNull(zone?.low),
    high: numberOrNull(zone?.high),
    center: numberOrNull(zone?.center),
    strength: zone?.strength || null,
    distance_pct: numberOrNull(zone?.distance_pct),
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
    status: payload.status || 'missing',
    symbol: payload.symbol || null,
    latest_date: payload.latest_date || null,
    spot: numberOrNull(payload.spot),
    indicators: {
      dma50: numberOrNull(payload.indicators?.dma50),
      dma100: numberOrNull(payload.indicators?.dma100),
      dma200: numberOrNull(payload.indicators?.dma200),
      atr14: numberOrNull(payload.indicators?.atr14),
    },
    supports: Array.isArray(payload.supports) ? payload.supports.map(normalizeZone) : [],
    resistances: Array.isArray(payload.resistances) ? payload.resistances.map(normalizeZone) : [],
    volume_profile: {
      status: payload.volume_profile?.status || 'missing',
      poc: payload.volume_profile?.poc ? { price: numberOrNull(payload.volume_profile.poc.price) } : null,
    },
    anchored_vwap: {
      status: payload.anchored_vwap?.status || 'missing',
      value: numberOrNull(payload.anchored_vwap?.value),
      anchor: payload.anchored_vwap?.anchor?.date ? { date: payload.anchored_vwap.anchor.date } : null,
    },
    options: {
      status: payload.options?.status || 'missing',
      freshness: payload.options?.freshness || 'missing',
      snapshot_ts: payload.options?.snapshot_ts || null,
      gex: {
        status: payload.options?.gex?.status || 'missing',
        gamma_regime: payload.options?.gex?.gamma_regime || null,
        put_wall: numberOrNull(payload.options?.gex?.put_wall),
        call_wall: numberOrNull(payload.options?.gex?.call_wall),
      },
      oi: {
        status: payload.options?.oi?.status || 'missing',
        put_wall: payload.options?.oi?.put_wall
          ? { price: numberOrNull(payload.options.oi.put_wall.price) }
          : null,
        call_wall: payload.options?.oi?.call_wall
          ? { price: numberOrNull(payload.options.oi.call_wall.price) }
          : null,
      },
    },
  };
}

export function technicalLevelsPath(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(normalized)) throw new Error('invalid symbol');
  return `/api/technical-levels/${encodeURIComponent(normalized)}`;
}
