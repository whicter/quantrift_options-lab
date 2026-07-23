export function strategyIvProfile(note = '') {
  const text = String(note);
  const firstSignal = text.match(/IV\s*Rank\s*([<>])\s*\d+|(低|高)\s*IV|IV\s*(低|高)/i);

  if (!firstSignal) return 'medium';
  if (firstSignal[1] === '<' || firstSignal[2] === '低' || firstSignal[3] === '低') return 'low';
  if (firstSignal[1] === '>' || firstSignal[2] === '高' || firstSignal[3] === '高') return 'high';
  return 'medium';
}
