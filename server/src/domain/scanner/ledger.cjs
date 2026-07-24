'use strict';

/**
 * Candidate result ledger (R2.1) — pure outcome evaluation + aggregation.
 *
 * This scores PAST scanner candidates by their actual outcome, for a trust
 * layer (an honest track record) and as the labeled data needed to fit the
 * candidate scoring weights (repaying the "打分权重未经验证" debt). It is model
 * validation, never a copy-trade signal.
 *
 * Outcomes are computed at expiry from the underlying close and the candidate's
 * legs. Multi-expiry structures (calendars/diagonals) cannot be settled at a
 * single expiry without repricing the far leg, so they are marked
 * `not_evaluable` and excluded from win-rate stats — disclosed, never guessed.
 */

// Intrinsic value of one option leg at expiry given the underlying close.
function intrinsic(right, strike, underlying) {
  const k = Number(strike);
  const s = Number(underlying);
  if (!Number.isFinite(k) || !Number.isFinite(s)) return null;
  return String(right).toUpperCase() === 'P' ? Math.max(0, k - s) : Math.max(0, s - k);
}

function distinctExpiries(legs) {
  return [...new Set((legs || []).map(l => String(l.expiry).slice(0, 10)))];
}

/**
 * entry: { legs:[{action,right,strike,expiry}], entry_cash, max_loss }
 *   entry_cash = net cash at entry per share (credit positive, debit negative).
 * underlyingAtExpiry: the underlying close on/after the (single) expiry.
 * Returns { outcome, realized_pnl, return_on_risk } (per share).
 */
function evaluateOutcome(entry, underlyingAtExpiry) {
  const legs = entry.legs || [];
  if (!legs.length) return { outcome: 'not_evaluable', reason: 'no_legs' };
  if (distinctExpiries(legs).length > 1) {
    return { outcome: 'not_evaluable', reason: 'multi_expiry' };
  }
  if (underlyingAtExpiry == null || !Number.isFinite(Number(underlyingAtExpiry))) {
    return { outcome: 'no_price', reason: 'underlying_close_missing' };
  }
  const entryCash = Number(entry.entry_cash);
  if (!Number.isFinite(entryCash)) return { outcome: 'not_evaluable', reason: 'no_entry_cash' };

  // Cash to close each leg at expiry: a long leg is worth +intrinsic to you; a
  // short leg you must buy back at -intrinsic.
  let closing = 0;
  for (const leg of legs) {
    const iv = intrinsic(leg.right, leg.strike, underlyingAtExpiry);
    if (iv == null) return { outcome: 'not_evaluable', reason: 'bad_leg' };
    closing += String(leg.action).toUpperCase() === 'BUY' ? iv : -iv;
  }

  const pnl = Math.round((entryCash + closing) * 100) / 100;
  const maxLoss = Number(entry.max_loss);
  const ror = Number.isFinite(maxLoss) && maxLoss > 0 ? Math.round((pnl / maxLoss) * 1000) / 1000 : null;
  return { outcome: pnl > 0 ? 'win' : 'loss', realized_pnl: pnl, return_on_risk: ror };
}

// POP-calibration buckets: does the predicted probability of profit match the
// realized win rate? Well-calibrated model => realized ≈ predicted per bucket.
const POP_BUCKETS = [
  { id: '0-40', lo: 0, hi: 0.4 },
  { id: '40-55', lo: 0.4, hi: 0.55 },
  { id: '55-70', lo: 0.55, hi: 0.7 },
  { id: '70-100', lo: 0.7, hi: 1.01 },
];

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

/**
 * resolved: [{ strategy_family, outcome, return_on_risk, pop }] — ledger rows
 * whose expiry has passed. Aggregates win rate by family and POP calibration
 * over the win/loss rows only (not_evaluable / no_price are counted but excluded
 * from rates, and surfaced so the coverage is honest).
 */
function aggregateLedger(resolved) {
  const rows = resolved || [];
  const scored = rows.filter(r => r.outcome === 'win' || r.outcome === 'loss');

  const famMap = new Map();
  for (const r of scored) {
    const key = r.strategy_family || 'unknown';
    const f = famMap.get(key) || { strategy_family: key, wins: 0, total: 0, ror_sum: 0 };
    f.total += 1;
    if (r.outcome === 'win') f.wins += 1;
    if (Number.isFinite(Number(r.return_on_risk))) f.ror_sum += Number(r.return_on_risk);
    famMap.set(key, f);
  }
  const by_family = [...famMap.values()]
    .map(f => ({ strategy_family: f.strategy_family, resolved: f.total, win_rate: pct(f.wins, f.total), avg_return_on_risk: f.total ? Math.round((f.ror_sum / f.total) * 1000) / 1000 : null }))
    .sort((a, b) => b.resolved - a.resolved);

  const calibration = POP_BUCKETS.map(b => {
    const inBucket = scored.filter(r => Number.isFinite(Number(r.pop)) && Number(r.pop) >= b.lo && Number(r.pop) < b.hi);
    const wins = inBucket.filter(r => r.outcome === 'win').length;
    return {
      bucket: b.id,
      predicted_mid: Math.round(((b.lo + Math.min(b.hi, 1)) / 2) * 100),
      resolved: inBucket.length,
      actual_win_rate: pct(wins, inBucket.length),
    };
  });

  return {
    tracked: rows.length,
    resolved: scored.length,
    not_evaluable: rows.filter(r => r.outcome === 'not_evaluable').length,
    no_price: rows.filter(r => r.outcome === 'no_price').length,
    overall_win_rate: pct(scored.filter(r => r.outcome === 'win').length, scored.length),
    by_family,
    calibration,
  };
}

module.exports = { evaluateOutcome, aggregateLedger, intrinsic, POP_BUCKETS };
