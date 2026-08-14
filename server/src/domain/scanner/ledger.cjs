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
 * legs. Legs expiring on the settlement date settle at intrinsic value; legs
 * expiring later must be CLOSED at their market price on that date, which is an
 * observation we either hold or do not — never a model price. See
 * `evaluateOutcome` for why the difference between "structurally unscoreable"
 * and "we lacked the quote" matters.
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
 * Identity of one leg, used to look its settlement-date mark up in `farLegMarks`.
 * Strike goes through Number so 62.5 and '62.50' cannot become two keys.
 */
function legKey(leg) {
  return [
    String(leg.right ?? '').toUpperCase(),
    Number(leg.strike),
    String(leg.expiry ?? '').slice(0, 10),
  ].join(':');
}

/**
 * entry: { legs:[{action,right,strike,expiry}], entry_cash, max_loss }
 *   entry_cash = net cash at entry per share (credit positive, debit negative).
 * underlyingAtExpiry: the underlying close on/after the settlement expiry.
 * opts.farLegMarks: { [legKey]: markPerShare } — the observed price at which
 *   each not-yet-expiring leg could be closed on the settlement date.
 *
 * Settlement date = the EARLIEST expiry among the legs. Legs expiring then
 * settle at intrinsic; later-dated legs are closed at their mark.
 *
 * On multi-expiry structures the distinction between the two failure modes is
 * the whole point. Passing no `farLegMarks` at all means the caller never tried
 * to price the far leg, which is the pre-2026-08-13 behaviour and still yields
 * `not_evaluable/multi_expiry`. Passing marks that turn out to be incomplete
 * means we tried and the quote was not there: that is `no_price`, the same
 * class as a missing underlying close, because it is a gap in our data and not
 * a property of the structure. Filing it under `not_evaluable` is what let 60%
 * of captured candidates look permanently unmeasurable when they were merely
 * unmeasured. Never substitute a model price for a missing mark — that would
 * make the ledger score the model against itself.
 *
 * Returns { outcome, realized_pnl, return_on_risk } (per share).
 */
function evaluateOutcome(entry, underlyingAtExpiry, { farLegMarks = null } = {}) {
  const legs = entry.legs || [];
  if (!legs.length) return { outcome: 'not_evaluable', reason: 'no_legs' };

  const expiries = distinctExpiries(legs);
  const multiExpiry = expiries.length > 1;
  if (multiExpiry && farLegMarks == null) {
    return { outcome: 'not_evaluable', reason: 'multi_expiry' };
  }
  if (underlyingAtExpiry == null || !Number.isFinite(Number(underlyingAtExpiry))) {
    return { outcome: 'no_price', reason: 'underlying_close_missing' };
  }
  const entryCash = Number(entry.entry_cash);
  if (!Number.isFinite(entryCash)) return { outcome: 'not_evaluable', reason: 'no_entry_cash' };

  const settlementExpiry = expiries.slice().sort()[0];

  // Cash to close each leg on the settlement date: a long leg is worth +value to
  // you; a short leg you must buy back at -value. Value is intrinsic for a leg
  // expiring that day, and the observed mark for one that is still alive.
  let closing = 0;
  for (const leg of legs) {
    const expiring = String(leg.expiry ?? '').slice(0, 10) === settlementExpiry;
    let value;
    if (expiring) {
      value = intrinsic(leg.right, leg.strike, underlyingAtExpiry);
      if (value == null) return { outcome: 'not_evaluable', reason: 'bad_leg' };
    } else {
      // Guard the empty values BEFORE Number(), which maps null, '' and false
      // to a perfectly finite 0 — silently settling the far leg as worthless
      // and turning every unpriced diagonal into a reported loss.
      const raw = farLegMarks?.[legKey(leg)];
      if (raw === null || raw === undefined || raw === '') {
        return { outcome: 'no_price', reason: 'far_leg_mark_missing' };
      }
      const mark = Number(raw);
      if (!Number.isFinite(mark) || mark < 0) {
        return { outcome: 'no_price', reason: 'far_leg_mark_missing' };
      }
      value = mark;
    }
    closing += String(leg.action).toUpperCase() === 'BUY' ? value : -value;
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

// Ledger rows captured before this date hold a corrupt `pop`: captureLedger read
// signals_json->'pop'->>'rate' (the risk-free rate) instead of ->>'probability',
// so every one of them stored 0.045 regardless of the real probability. Their
// source batches are pruned, so the true value is unrecoverable and backfilling
// would be fabrication. They are excluded from CALIBRATION ONLY -- the bug
// corrupted the prediction, never the outcome, so win rates over the same rows
// remain valid and deliberately keep counting them.
// Unset => no floor (every row with a finite pop is calibrated), which is the
// correct default for a fresh database.
const CALIBRATION_FROM_DATE = process.env.LEDGER_CALIBRATION_FROM_DATE || null;

function entryDateAtOrAfter(row, floor) {
  if (!floor) return true;
  const entry = row.entry_date instanceof Date
    ? row.entry_date.toISOString().slice(0, 10)
    : String(row.entry_date ?? '').slice(0, 10);
  return entry !== '' && entry >= floor;
}

/**
 * resolved: [{ strategy_family, outcome, return_on_risk, pop, entry_date }] —
 * ledger rows whose expiry has passed. Aggregates win rate by family and POP
 * calibration over the win/loss rows only (not_evaluable / no_price are counted
 * but excluded from rates, and surfaced so the coverage is honest).
 *
 * `calibrationFromDate` drops rows entered before a given YYYY-MM-DD from the
 * calibration table only. `calibration_excluded` reports how many were dropped,
 * so a thin calibration never reads as a broad one.
 */
function aggregateLedger(resolved, { calibrationFromDate = CALIBRATION_FROM_DATE } = {}) {
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

  const calibratable = scored.filter(r => entryDateAtOrAfter(r, calibrationFromDate));
  const calibration = POP_BUCKETS.map(b => {
    const inBucket = calibratable.filter(r => Number.isFinite(Number(r.pop)) && Number(r.pop) >= b.lo && Number(r.pop) < b.hi);
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
    calibration_from_date: calibrationFromDate,
    calibration_excluded: scored.length - calibratable.length,
  };
}

module.exports = { evaluateOutcome, aggregateLedger, intrinsic, legKey, POP_BUCKETS };
