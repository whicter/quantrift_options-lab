const express = require('express');
const pool = require('../db');
const { evaluateOutcome, aggregateLedger } = require('../domain/scanner/ledger.cjs');

const router = express.Router();

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
            CASE WHEN s.signals_json->'pop'->>'status' = 'unavailable' THEN NULL
                 ELSE (s.signals_json->'pop'->>'rate')::numeric END,
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

/**
 * Resolve ledger rows whose expiry has passed: fetch the underlying close on or
 * after expiry and evaluate the payoff. Best-effort per row.
 */
async function evaluateLedger(db) {
  const { rows } = await db.query(
    `SELECT id, symbol, expiry, legs_json, entry_cash, max_loss
     FROM candidate_ledger
     WHERE outcome IS NULL AND expiry < (NOW() AT TIME ZONE 'America/New_York')::date
     LIMIT 2000`,
  );
  let resolved = 0;
  for (const row of rows) {
    const { rows: priceRows } = await db.query(
      `SELECT close FROM price_history
       WHERE symbol = $1 AND source = 'polygon_licensed' AND close IS NOT NULL AND date >= $2
       ORDER BY date ASC LIMIT 1`,
      [row.symbol, row.expiry],
    );
    const closeAtExpiry = priceRows[0] ? num(priceRows[0].close) : null;
    const result = evaluateOutcome(
      { legs: row.legs_json || [], entry_cash: num(row.entry_cash), max_loss: num(row.max_loss) },
      closeAtExpiry,
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

async function sendLedger(req, res) {
  try {
    const [resolvedRes, countRes] = await Promise.all([
      pool.query(
        `SELECT strategy_family, outcome, return_on_risk, pop
         FROM candidate_ledger WHERE outcome IS NOT NULL`,
      ),
      pool.query(
        `SELECT COUNT(*) tracked,
                COUNT(*) FILTER (WHERE outcome IS NULL) pending,
                MIN(expiry) FILTER (WHERE outcome IS NULL) next_expiry
         FROM candidate_ledger`,
      ),
    ]);
    // aggregateLedger's own `tracked` means "resolved rows passed into it"
    // (ledger.cjs is tested on that meaning directly) -- a different concept
    // from this route's `tracked` (every candidate ever captured, resolved or
    // not). Destructure it out so the spread cannot silently overwrite the
    // correct total with "count of resolved rows" (which is 0 until anything
    // expires, and was clobbering the real total -- e.g. 23,342 captured
    // candidates rendering as "追踪中 0" while "待到期" correctly showed 23,342).
    const { tracked: _aggTracked, ...agg } = aggregateLedger(resolvedRes.rows.map(r => ({
      strategy_family: r.strategy_family, outcome: r.outcome,
      return_on_risk: num(r.return_on_risk), pop: num(r.pop),
    })));
    const c = countRes.rows[0] || {};
    return res.json({
      status: 'ready',
      tracked: Number(c.tracked || 0),
      pending: Number(c.pending || 0),
      // pg parses `date` columns into a JS Date at local midnight; String(date)
      // gives its verbose form ("Wed Jul 29 2026 00:00:00 GMT...") rather than
      // ISO, so slice(0,10) on that produced "Wed Jul 29" instead of a real
      // date. toISOString().slice(0,10) matches this codebase's existing
      // convention for date columns (technicalLevels.js, supportResistance.js).
      next_expiry: c.next_expiry ? new Date(c.next_expiry).toISOString().slice(0, 10) : null,
      ...agg,
    });
  } catch (error) {
    console.error('GET /api/scanner/ledger error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/ledger', sendLedger);

module.exports = { router, captureLedger, evaluateLedger, sendLedger };
