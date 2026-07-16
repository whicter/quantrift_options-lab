function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function applyExternalFlow(data, flowData) {
  if (!data) return data;
  if (!flowData) return { ...data, externalFlow: null };
  return {
    ...data,
    externalFlow: {
      source: flowData.source,
      status: flowData.status,
      freshness: flowData.freshness,
      isStale: Boolean(flowData.is_stale),
      providerLastMessageAt: flowData.provider_last_message_at,
      windowHours: flowData.window_hours,
      summary: {
        optionFlowCount: Number(flowData.summary?.option_flow_count || 0),
        sweepCount: Number(flowData.summary?.sweep_count || 0),
        darkPoolCount: Number(flowData.summary?.dark_pool_count || 0),
        optionPremium: Number(flowData.summary?.option_premium || 0),
        darkPoolNotional: Number(flowData.summary?.dark_pool_notional || 0),
      },
      items: (flowData.items || []).map(item => ({
        id: item.provider_event_id,
        type: item.event_type,
        executedAt: item.executed_at,
        contract: item.contract_symbol,
        right: item.right,
        strike: numberOrNull(item.strike),
        expiry: item.expiry ? String(item.expiry).slice(0, 10) : null,
        price: numberOrNull(item.price),
        underlyingPrice: numberOrNull(item.underlying_price),
        size: Number(item.size || 0),
        premium: numberOrNull(item.premium),
        hasSweep: Boolean(item.has_sweep),
        allOpeningTrades: Boolean(item.all_opening_trades),
      })),
    },
  };
}
