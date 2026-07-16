function number(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactMoney(value) {
  const n = number(value);
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${n < 0 ? '-' : ''}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${n < 0 ? '-' : ''}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${n < 0 ? '-' : ''}$${(abs / 1e3).toFixed(0)}K`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

function strikePrice(value) {
  const n = number(value);
  if (n == null) return '--';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function gammaRegimeLabel(regime) {
  if (regime === 'positive') return '正 Gamma';
  if (regime === 'negative') return '负 Gamma';
  if (regime === 'neutral') return '中性 Gamma';
  return 'Gamma 未采集';
}

export function gammaSummary({ total, regime, status }) {
  const exposure = number(total);
  if (exposure == null) return '净 GEX 未采集';
  const behavior = regime === 'negative'
    ? '波动更可能放大'
    : regime === 'positive'
      ? '波动更可能收敛'
      : '波动影响中性';
  const freshness = status === 'stale' ? '快照延迟' : status === 'missing' ? '未采集' : null;
  return `${gammaRegimeLabel(regime)} · 净 GEX ${compactMoney(exposure)} · ${behavior}${freshness ? ` · ${freshness}` : ''}`;
}

export function wallSummary({ callWall, putWall, nearestWall }, spot) {
  const wall = nearestWall?.side === 'Call' ? number(callWall) : number(putWall);
  const side = nearestWall?.side;
  const currentPrice = number(spot);
  if (wall == null || !side) return 'Wall 未采集';
  if (currentPrice == null || currentPrice === 0) return `${side} Wall $${strikePrice(wall)}`;
  const pct = ((wall - currentPrice) / currentPrice) * 100;
  const location = pct >= 0 ? '上方' : '下方';
  return `${location} ${side} Wall $${strikePrice(wall)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}
