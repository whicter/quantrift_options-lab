export function calculateProbabilityCone({ spot, legs, rate = 0, div = 0 }) {
  const validSpot = Number(spot);
  const activeLegs = (legs || []).filter((leg) => Number(leg?.iv) > 0 && Number(leg?.dte) > 0);

  if (!Number.isFinite(validSpot) || validSpot <= 0 || !activeLegs.length) return null;

  const totalWeight = activeLegs.reduce((sum, leg) => sum + Math.max(1, Number(leg.qty) || 1), 0);
  const averageIv = activeLegs.reduce(
    (sum, leg) => sum + Number(leg.iv) * Math.max(1, Number(leg.qty) || 1),
    0,
  ) / totalWeight;
  const dte = Math.max(...activeLegs.map((leg) => Number(leg.dte)));
  const time = dte / 365;
  const volatility = averageIv * Math.sqrt(time);
  const median = validSpot * Math.exp((Number(rate) - Number(div) - 0.5 * averageIv ** 2) * time);

  return {
    averageIv,
    dte,
    lower: median * Math.exp(-volatility),
    upper: median * Math.exp(volatility),
  };
}
