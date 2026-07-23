/**
 * Scalar Kalman filter with a local-linear-trend (constant-velocity) model.
 *
 * The Analyze trend chart previously called an EMA "KALMAN FILTER". This is the
 * real thing: a 2-state filter x = [level, slope] with transition
 *   level_t = level_{t-1} + slope_{t-1}
 *   slope_t = slope_{t-1}
 * observing the close each step. It adapts its gain from the process/measurement
 * noise ratio instead of a fixed alpha, so it tracks turns without the lag of a
 * plain EMA, and the posterior level variance gives an honest confidence band.
 *
 * Pure JS, no dependencies, fully unit-testable. Returns { smooth, slope, upper,
 * lower } aligned to the input prices. Tunables: `q` process noise (higher =
 * more responsive), `r` measurement noise (higher = smoother), `bandK` band
 * width in standard deviations.
 */

export function kalmanTrend(prices, { q = 0.02, r = 4, bandK = 2, bandFloorPct = 0.006 } = {}) {
  const smooth = [];
  const slopeSeries = [];
  const upper = [];
  const lower = [];
  if (!Array.isArray(prices) || prices.length === 0) {
    return { smooth, slope: slopeSeries, upper, lower };
  }

  // State x = [level, slope]; covariance P (2x2). Seed level at the first price,
  // slope at 0, with a wide prior so the first observations dominate.
  let level = Number(prices[0]);
  let slope = 0;
  let p00 = r; let p01 = 0; let p10 = 0; let p11 = r;

  // Process noise Q assigns most uncertainty growth to the slope so the level
  // stays smooth while the trend is free to bend.
  const q00 = q; const q11 = q * 4;

  for (let i = 0; i < prices.length; i += 1) {
    const z = Number(prices[i]);

    // Predict: x = F x, with F = [[1,1],[0,1]]
    const predLevel = level + slope;
    const predSlope = slope;
    // P = F P F^T + Q
    const a00 = p00 + p10 + p01 + p11; // (P00+P01)+(P10+P11)
    const a01 = p01 + p11;
    const a10 = p10 + p11;
    const a11 = p11;
    let pp00 = a00 + q00;
    let pp01 = a01;
    let pp10 = a10;
    let pp11 = a11 + q11;

    // Update with observation z (H = [1, 0])
    if (Number.isFinite(z)) {
      const s = pp00 + r;            // innovation covariance
      const k0 = pp00 / s;           // Kalman gain (level)
      const k1 = pp10 / s;           // Kalman gain (slope)
      const y = z - predLevel;       // innovation
      level = predLevel + k0 * y;
      slope = predSlope + k1 * y;
      // P = (I - K H) P
      const n00 = (1 - k0) * pp00;
      const n01 = (1 - k0) * pp01;
      const n10 = pp10 - k1 * pp00;
      const n11 = pp11 - k1 * pp01;
      p00 = n00; p01 = n01; p10 = n10; p11 = n11;
    } else {
      // Missing observation: keep the prediction.
      level = predLevel; slope = predSlope;
      p00 = pp00; p01 = pp01; p10 = pp10; p11 = pp11;
    }

    const sd = Math.sqrt(Math.max(p00, 0));
    const floor = Math.abs(level) * bandFloorPct;
    const halfBand = Math.max(bandK * sd, floor);
    smooth.push(level);
    slopeSeries.push(slope);
    upper.push(level + halfBand);
    lower.push(level - halfBand);
  }

  return { smooth, slope: slopeSeries, upper, lower };
}
