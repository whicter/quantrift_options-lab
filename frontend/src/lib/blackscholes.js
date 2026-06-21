// Black-Scholes pricing engine + Greeks
// All Greeks are for a single contract (qty=1, dir=long)
// Caller must multiply by qty and dir (+1 long, -1 short)

/** Standard normal CDF using rational approximation (Abramowitz & Stegun) */
function normCDF(x) {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Standard normal PDF */
function normPDF(x) {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes option price
 * @param {number} S  - current stock price
 * @param {number} K  - strike price
 * @param {number} T  - time to expiry in years
 * @param {number} r  - risk-free rate (decimal)
 * @param {number} q  - dividend yield (decimal)
 * @param {number} v  - implied volatility (decimal)
 * @param {'call'|'put'} type
 * @returns {number} option price
 */
export function bsPrice(S, K, T, r, q, v, type) {
  if (S <= 0 || K <= 0 || v <= 0) return 0;
  if (T <= 0) {
    return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  if (type === 'call') {
    return (
      S * Math.exp(-q * T) * normCDF(d1) -
      K * Math.exp(-r * T) * normCDF(d2)
    );
  } else {
    return (
      K * Math.exp(-r * T) * normCDF(-d2) -
      S * Math.exp(-q * T) * normCDF(-d1)
    );
  }
}

/**
 * Black-Scholes Greeks for a single long option
 * @returns {{ delta, gamma, theta, vega, rho }}
 * theta: per calendar day
 * vega:  per 1% IV change
 * rho:   per 1% rate change
 */
export function bsGreeks(S, K, T, r, q, v, type) {
  if (S <= 0 || K <= 0 || v <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  if (T <= 0) {
    const delta =
      type === 'call' ? (S >= K ? 1 : 0) : S <= K ? -1 : 0;
    return { delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  const nd1 = normPDF(d1);
  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);

  const gamma = (eqT * nd1) / (S * v * sqrtT);
  const vega = (S * eqT * nd1 * sqrtT) / 100; // per 1%

  let delta, theta, rho;
  if (type === 'call') {
    delta = eqT * Nd1;
    theta =
      ((-S * eqT * nd1 * v) / (2 * sqrtT) -
        r * K * erT * Nd2 +
        q * S * eqT * Nd1) /
      365;
    rho = (K * T * erT * Nd2) / 100; // per 1%
  } else {
    delta = eqT * (Nd1 - 1);
    theta =
      ((-S * eqT * nd1 * v) / (2 * sqrtT) +
        r * K * erT * normCDF(-d2) -
        q * S * eqT * normCDF(-d1)) /
      365;
    rho = (-K * T * erT * normCDF(-d2)) / 100;
  }

  return { delta, gamma, theta, vega, rho };
}

/**
 * Calculate full position P&L and Greeks for an array of legs
 * @param {number} S        - current/hypothetical stock price
 * @param {object[]} legs   - array of leg objects
 * @param {number} r        - risk-free rate
 * @param {number} q        - dividend yield
 * @param {number} ivShift  - IV adjustment in percentage points (e.g. 5 = +5%)
 * @param {number} dteOverride - override all legs' DTE (null = use leg.dte)
 * @returns {{ price, delta, gamma, theta, vega, rho }}
 */
export function positionValue(S, legs, r, q, ivShift, dteOverride = null) {
  let price = 0, delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;
  for (const leg of legs) {
    const T = ((dteOverride ?? leg.dte) / 365);
    const v = Math.max(0.001, leg.iv + ivShift / 100);
    const p = bsPrice(S, leg.K, T, r, q, v, leg.type);
    const g = bsGreeks(S, leg.K, T, r, q, v, leg.type);
    const sign = leg.dir * leg.qty;
    price += sign * p;
    delta += sign * g.delta;
    gamma += sign * g.gamma;
    theta += sign * g.theta;
    vega  += sign * g.vega;
    rho   += sign * g.rho;
  }
  return { price, delta, gamma, theta, vega, rho };
}

/**
 * P&L at expiration (intrinsic value only)
 * Uses shortest DTE leg as the expiry reference
 */
export function expiryPL(S, legs, netPremium, contracts) {
  let value = 0;
  for (const leg of legs) {
    const intrinsic =
      leg.type === 'call'
        ? Math.max(0, S - leg.K)
        : Math.max(0, leg.K - S);
    value += leg.dir * leg.qty * intrinsic;
  }
  return (value - netPremium) * contracts;
}

/**
 * Net premium paid/received to enter the position at a reference spot S0
 * Positive = debit (cost), Negative = credit (received)
 */
export function calcNetPremium(legs, S0, r, q) {
  let net = 0;
  for (const leg of legs) {
    const T = leg.dte / 365;
    const p = bsPrice(S0, leg.K, T, r, q, leg.iv, leg.type);
    net += leg.dir * leg.qty * p;
  }
  return net;
}

/**
 * Find breakeven price(s) at expiration (numerical search)
 * Returns array of breakeven stock prices
 */
export function findBreakevens(legs, netPremium) {
  const strikes = legs.map((l) => l.K);
  const minK = Math.min(...strikes);
  const maxK = Math.max(...strikes);
  const lo = minK * 0.5;
  const hi = maxK * 1.5;
  const steps = 2000;
  const step = (hi - lo) / steps;

  const beps = [];
  let prevPL = null;

  for (let i = 0; i <= steps; i++) {
    const S = lo + i * step;
    let value = 0;
    for (const leg of legs) {
      const intrinsic =
        leg.type === 'call'
          ? Math.max(0, S - leg.K)
          : Math.max(0, leg.K - S);
      value += leg.dir * leg.qty * intrinsic;
    }
    const pl = value - netPremium;
    if (prevPL !== null && Math.sign(pl) !== Math.sign(prevPL)) {
      beps.push(+(lo + (i - 0.5) * step).toFixed(2));
    }
    prevPL = pl;
  }
  return beps;
}

/**
 * Probability of profit (log-normal approximation)
 * Based on probability that expiry P&L > 0
 */
export function probOfProfit(S0, legs, netPremium, r, q, dte) {
  const beps = findBreakevens(legs, netPremium);
  if (beps.length === 0) {
    // Check if always profit or always loss
    const testPL = expiryPL(S0, legs, netPremium, 1);
    return testPL > 0 ? 1 : 0;
  }

  // Use average IV across legs for log-normal distribution
  const avgIV =
    legs.reduce((sum, l) => sum + l.iv * l.qty, 0) /
    legs.reduce((sum, l) => sum + l.qty, 0);
  const T = dte / 365;
  const sigma = avgIV * Math.sqrt(T);
  const mu = (r - q - 0.5 * avgIV * avgIV) * T;

  // P(S_T > bep) = normCDF( (log(S0/bep) + mu... no, (log(bep/S0) - mu) / sigma )
  // P(S_T > X) = normCDF( (log(S0/X) + mu) / sigma ) but adjusted
  const probAbove = (X) => {
    const d = (Math.log(S0 / X) + mu) / sigma;
    return normCDF(d);
  };
  const probBelow = (X) => 1 - probAbove(X);

  if (beps.length === 1) {
    const testPL = expiryPL(beps[0] * 1.01, legs, netPremium, 1);
    return testPL > 0 ? probAbove(beps[0]) : probBelow(beps[0]);
  }

  if (beps.length >= 2) {
    // Profitable zone is outside the two beps or between them
    const testInside = expiryPL((beps[0] + beps[1]) / 2, legs, netPremium, 1);
    if (testInside > 0) {
      // Profit between beps
      return probAbove(beps[0]) - probAbove(beps[1]);
    } else {
      // Profit outside beps
      return probBelow(beps[0]) + probAbove(beps[1]);
    }
  }

  return 0.5;
}
