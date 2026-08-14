const { evaluateOutcome, legKey } = require('../domain/scanner/ledger.cjs');

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// How many top-ranked candidates per symbol enter the ledger. The ledger's
// purpose is to score what the product actually put in front of a user, so it
// must track recommendations -- not the enumeration they were chosen from.
const LEDGER_CAPTURE_TOP_N_PER_SYMBOL = Math.max(
  parseInt(process.env.LEDGER_CAPTURE_TOP_N_PER_SYMBOL ?? 3, 10) || 3, 1,
);

/**
 * Capture the top-ranked candidates of a completed batch into the durable
 * ledger, once (first-seen = entry). entry_cash is credit-positive /
 * debit-negative; POP is dropped when the engine marked it unavailable (a
 * placeholder, not a real probability). Existing (candidate_key, expiry) rows
 * are left untouched so the entry price is fixed at first sighting.
 *
 * Only the top N per symbol are captured. Until 2026-07-30 this captured the
 * ENTIRE batch -- ~11,000 rows per run, the full strike/expiry enumeration the
 * engine ranks internally, not the handful a user is ever shown. That made the
 * ledger useless for its one job: 23,430 rows accumulated in under a week, of
 * which 64% were Diagonal/Calendar permutations that are multi-expiry and
 * therefore structurally `not_evaluable`, which is why 98.7% of resolved rows
 * could never be scored. Ranking is already computed and stored by
 * buildCandidateBatch, so this is a filter, not a new judgement.
 */
async function captureLedger(db, batchId) {
  const { rowCount } = await db.query(
    `WITH ranked AS (
       SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.symbol ORDER BY s.rank ASC) AS symbol_rank
       FROM scanner_candidate_snapshots s
       WHERE s.batch_id = $1 AND s.expiry IS NOT NULL
     )
     INSERT INTO candidate_ledger
       (candidate_key, symbol, strategy, strategy_family, expiry, entry_date,
        entry_spot, entry_cash, max_loss, pop, single_expiry, legs_json, algorithm_version)
     SELECT s.candidate_key, s.symbol, s.strategy, s.strategy_family, s.expiry,
            (s.created_at AT TIME ZONE 'America/New_York')::date,
            s.spot,
            COALESCE((s.economics_json->>'credit')::numeric, -(s.economics_json->>'debit')::numeric),
            (s.economics_json->>'maxLoss')::numeric,
            -- 'probability', NOT 'rate'. Until 2026-08-09 this read pop->>'rate',
            -- which is RISK_FREE_RATE -- so every captured row stored 0.045 and
            -- the calibration buckets in aggregateLedger put 100% of the ledger
            -- in the 0-40 bin. Verified against production: all 212 non-null
            -- pop rows held exactly 0.0450. Those rows are unrecoverable (their
            -- source batch is pruned) and are excluded by CALIBRATION_FROM_DATE
            -- rather than backfilled.
            CASE WHEN s.signals_json->'pop'->>'status' = 'unavailable' THEN NULL
                 ELSE (s.signals_json->'pop'->>'probability')::numeric END,
            (SELECT COUNT(DISTINCT l->>'expiry') = 1 FROM jsonb_array_elements(s.legs_json) l),
            s.legs_json,
            b.algorithm_version
     FROM ranked s
     JOIN scanner_candidate_batches b ON b.id = $1
     WHERE s.symbol_rank <= $2
     ON CONFLICT (candidate_key, expiry) DO NOTHING`,
    [batchId, LEDGER_CAPTURE_TOP_N_PER_SYMBOL],
  );
  return rowCount;
}

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

// The date a row settles on: the earliest expiry among its legs. Derived from
// the legs rather than read off the `expiry` column so the two can never
// disagree about which leg is the near one.
function settlementDate(legs) {
  const expiries = (legs || []).map(l => toIsoDate(l.expiry)).filter(Boolean).sort();
  return expiries[0] || null;
}

/**
 * Marks for the legs of a multi-expiry row that were still alive on its
 * settlement date, keyed for `evaluateOutcome`. Only rows with a usable `mark`
 * are returned: a captured row with mark NULL records that we looked and the
 * quote was not two-sided, which must stay a miss rather than become a zero.
 */
async function loadFarLegMarks(db, settleOn, symbol) {
  const { rows } = await db.query(
    `SELECT expiry, strike, option_right, mark
       FROM ledger_far_leg_marks
      WHERE settlement_date = $1 AND symbol = $2 AND mark IS NOT NULL`,
    [settleOn, symbol],
  );
  const marks = {};
  for (const r of rows) {
    marks[legKey({ right: r.option_right, strike: r.strike, expiry: toIsoDate(r.expiry) })] = num(r.mark);
  }
  return marks;
}

/**
 * Resolve ledger rows whose (near) expiry has passed: fetch the underlying
 * close on or after that expiry and evaluate the payoff. Best-effort per row.
 *
 * Multi-expiry rows additionally need each surviving leg's mark on the
 * settlement date, captured that day by the collector. Marks are looked up
 * whenever a row has more than one expiry, so an uncaptured far leg resolves as
 * `no_price` — an honest data gap that improving coverage fixes — instead of
 * `not_evaluable`, which claimed the structure itself could never be scored.
 */
async function evaluateLedger(db) {
  const { rows } = await db.query(
    `SELECT id, symbol, expiry, legs_json, entry_cash, max_loss
     FROM candidate_ledger
     WHERE outcome IS NULL AND expiry < (NOW() AT TIME ZONE 'America/New_York')::date
     LIMIT 2000`,
  );
  let resolved = 0;
  const markCache = new Map();
  for (const row of rows) {
    const legs = row.legs_json || [];
    const { rows: priceRows } = await db.query(
      `SELECT close FROM price_history
       WHERE symbol = $1 AND source = 'polygon_licensed' AND close IS NOT NULL AND date >= $2
       ORDER BY date ASC LIMIT 1`,
      [row.symbol, row.expiry],
    );
    const closeAtExpiry = priceRows[0] ? num(priceRows[0].close) : null;

    const settleOn = settlementDate(legs);
    const multiExpiry = new Set(legs.map(l => toIsoDate(l.expiry))).size > 1;
    let farLegMarks = null;
    if (multiExpiry && settleOn) {
      const cacheKey = `${row.symbol}|${settleOn}`;
      if (!markCache.has(cacheKey)) {
        markCache.set(cacheKey, await loadFarLegMarks(db, settleOn, row.symbol));
      }
      farLegMarks = markCache.get(cacheKey);
    }

    const result = evaluateOutcome(
      { legs, entry_cash: num(row.entry_cash), max_loss: num(row.max_loss) },
      closeAtExpiry,
      { farLegMarks },
    );
    await db.query(
      `UPDATE candidate_ledger
         SET outcome = $2, underlying_at_expiry = $3, realized_pnl = $4, return_on_risk = $5, resolved_at = NOW()
       WHERE id = $1`,
      [row.id, result.outcome, closeAtExpiry, result.realized_pnl ?? null, result.return_on_risk ?? null],
    );
    resolved += 1;
  }
  return resolved;
}

module.exports = { captureLedger, evaluateLedger };
