// Pure view-model for the /market State Matrix (R1.1 frontend). Groups the
// /api/market/state-matrix response into ordered per-state buckets + a
// distribution bar, and derives a compact per-symbol signal label. Kept pure so
// the grouping and the label geometry are unit-testable and the page stays dumb.

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// A short, honest signal for a symbol chip — describes the state trigger, never
// prescribes an action. Deterministic from the symbol's own signals.
export function compactSignal(sym) {
  const iv = num(sym.iv_rank);
  const ext = num(sym.ext50);
  const r20 = num(sym.ret20);
  const rv = num(sym.rvol);
  const ret20 = r20 == null ? null : `20日 ${r20 >= 0 ? '+' : ''}${r20.toFixed(0)}%`;
  switch (sym.state) {
    case 'S0': return iv != null && iv >= 80 ? `IVR ${Math.round(iv)}` : rv != null ? `RVol ${rv.toFixed(1)}×` : '高波动';
    case 'S3': return rv != null ? `破高 · RVol ${rv.toFixed(1)}×` : '破 20 日高';
    case 'S1': return ext != null && ext >= 3 ? `+${ext.toFixed(0)}% vs MA50` : (ret20 || '多头排列');
    case 'S2': return ret20 || '回调中';
    case 'S4': return ret20 || '企稳试探';
    case 'S5': return ret20 || '空头排列';
    case 'S6': return 'MA 交织';
    default: return '数据不足';
  }
}

export function buildStateMatrixView(res) {
  if (!res || res.status !== 'ready') return { status: res?.status || 'missing' };

  const meta = res.states || [];
  const symbols = res.symbols || [];
  const total = symbols.length;

  const byState = new Map();
  for (const s of symbols) {
    if (!byState.has(s.state)) byState.set(s.state, []);
    byState.get(s.state).push({
      symbol: s.symbol,
      state: s.state,
      reasons: s.reasons || [],
      ivRank: num(s.iv_rank),
      gammaRegime: s.gamma_regime ?? null,
      signal: compactSignal(s),
    });
  }

  // Every meta state becomes a bucket in the canonical order (zero-filled), so a
  // state with no members still renders its column, reading 0 rather than gone.
  const buckets = meta.map(m => ({
    id: m.id,
    label: m.label,
    tone: m.tone,
    symbols: byState.get(m.id) || [],
    count: (byState.get(m.id) || []).length,
  }));

  // Distribution bar: states with members, canonical order, insufficient excluded.
  const segments = buckets
    .filter(b => b.count > 0 && b.id !== 'insufficient')
    .map(b => ({ id: b.id, label: b.label, tone: b.tone, count: b.count, pct: total ? (b.count / total) * 100 : 0 }));

  return {
    status: 'ready',
    universeCount: res.universe_count ?? total,
    total,
    buckets,
    segments,
    thresholds: res.thresholds || null,
  };
}
