export function blankLeg() {
  return { side: 'long', option_right: 'C', expiry: '', strike: '', quantity: 1, entry_price: '' };
}

export function buildPositionPayload(draft) {
  const symbol = String(draft.symbol || '').trim().toUpperCase();
  const strategyName = String(draft.strategy_name || '').trim();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error('请输入有效标的');
  if (!strategyName) throw new Error('请输入策略名称');
  if (!Array.isArray(draft.legs) || !draft.legs.length) throw new Error('至少需要一条期权腿');
  const legs = draft.legs.map(leg => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.expiry || '')) throw new Error('请选择到期日');
    if (!(Number(leg.strike) > 0)) throw new Error('执行价必须大于 0');
    if (!(Number(leg.entry_price) >= 0) || leg.entry_price === '') throw new Error('请输入开仓价格');
    return {
      side: leg.side, option_right: leg.option_right, expiry: leg.expiry,
      strike: Number(leg.strike), quantity: Number(leg.quantity || 1), entry_price: Number(leg.entry_price),
    };
  });
  return { symbol, strategy_name: strategyName, quantity: Number(draft.quantity || 1), notes: draft.notes || '', legs };
}

export function money(value) {
  const number = Number(value || 0);
  return `${number < 0 ? '-' : ''}$${Math.abs(number).toFixed(2)}`;
}
