/**
 * Scanner candidate materializer (V3A-2).
 *
 * Runs the candidate engine ahead of the request path and persists concrete
 * setups into scanner_candidate_batches + scanner_candidate_snapshots. Product
 * read paths serve the latest 'completed' batch, so no normal API needs the raw
 * option chain to produce actionable candidates -- the engine's IP stays on the
 * server.
 *
 * Pure functions (buildCandidateBatch, candidateKey, strategyFamily) carry the
 * batch logic and are unit-testable without a database. runMaterialization wires
 * them to PostgreSQL.
 *
 * CLI: node src/jobs/materializeScannerCandidates.js [scanKey]
 */

const { buildActionableSetups } = require('../domain/scanner/candidateEngine.cjs');

// Bump whenever candidate enumeration, scoring, or dedupe changes so a stored
// batch can be told apart from one produced by a different algorithm.
const ALGORITHM_VERSION = 'candidate-v1';

const DEFAULT_SCAN_KEY = process.env.SCAN_KEY || 'watchlist_v1';
const CANDIDATE_INSERT_CHUNK = 500;

const STRATEGY_FAMILY = {
  'Bull Put Spread': 'credit_vertical',
  'Bear Call Spread': 'credit_vertical',
  'Iron Condor': 'iron',
  'Iron Butterfly': 'iron',
  'Long Straddle': 'straddle_strangle',
  'Short Strangle': 'straddle_strangle',
  'Calendar Spread': 'time_spread',
  'Diagonal Spread': 'time_spread',
  'Long Call': 'single_leg',
  'Long Put': 'single_leg',
  'Short Put': 'single_leg',
  'Short Call': 'single_leg',
  'Jade Lizard': 'combo',
};

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strategyFamily(strategy) {
  return STRATEGY_FAMILY[strategy] || 'other';
}

function legSignature(legs) {
  return (legs || [])
    .map(leg => `${leg.action}:${leg.expiry}:${leg.strike}${leg.right}`)
    .sort()
    .join(',');
}

// Stable identity for a concrete setup within a batch: symbol + strategy + the
// exact legs. Two candidates on different strikes/expiries differ; the same
// structure surfacing twice collapses to one row (highest score wins).
function candidateKey(symbol, candidate) {
  return `${symbol}|${candidate.strategy}|${legSignature(candidate.legs)}`;
}

function toLeg(leg) {
  return {
    action: leg.action,
    expiry: leg.expiry,
    dte: leg.dte,
    strike: leg.strike,
    right: leg.right,
    bid: leg.bid,
    ask: leg.ask,
    delta: leg.delta,
  };
}

function candidateRow(symbol, row, candidate) {
  return {
    candidate_key: candidateKey(symbol, candidate),
    symbol,
    strategy: candidate.strategy,
    strategy_family: strategyFamily(candidate.strategy),
    expiry: candidate.expiry || null,
    dte: candidate.dte ?? null,
    spot: num(row.price_close),
    score: candidate.score,
    legs_json: candidate.legs.map(toLeg),
    economics_json: {
      credit: candidate.credit ?? null,
      debit: candidate.debit ?? null,
      maxLoss: candidate.maxLoss ?? null,
      returnOnRisk: candidate.returnOnRisk ?? null,
      breakevens: candidate.breakevens ?? [],
      riskType: candidate.riskType ?? 'defined',
      structure: candidate.structure ?? null,
      pricing: candidate.pricing ?? null,
      summary: candidate.summary ?? null,
      legLabels: candidate.legLabels ?? [],
      farExpiry: candidate.farExpiry ?? null,
      farDte: candidate.farDte ?? null,
    },
    signals_json: {
      score: candidate.score,
      minOpenInterest: candidate.minOpenInterest ?? null,
      totalVolume: candidate.totalVolume ?? null,
      avgSpreadPct: Number.isFinite(candidate.avgSpreadPct) ? candidate.avgSpreadPct : null,
      expected_move: candidate.expectedMove ?? null,
      pop: candidate.pop ?? null,
      gamma_regime: row.gamma_regime ?? null,
      call_wall: num(row.call_wall),
      put_wall: num(row.put_wall),
      signal_score: num(row.signal_score),
    },
    freshness_json: {
      input_snapshot_ts: row.quote_snapshot_ts ?? null,
      scanner_snapshot_ts: row.snapshot_ts ?? null,
      gex_snapshot_ts: row.gex_snapshot_ts ?? null,
    },
  };
}

/**
 * Pure batch builder. Given the positioning rows (each carrying its usable
 * option_contracts array), run the candidate engine per symbol, rank every
 * setup globally by score, dedupe by candidate_key, and assign a 1-based rank.
 */
function buildCandidateBatch({ rows = [], overrides = {} } = {}) {
  const universe = new Set();
  const collected = [];
  for (const row of rows) {
    if (row && row.symbol) universe.add(row.symbol);
    if (!row || !row.symbol) continue;
    const setups = buildActionableSetups(row.option_contracts, row, overrides);
    for (const candidate of setups) collected.push({ row, symbol: row.symbol, candidate });
  }

  collected.sort((a, b) => (
    b.candidate.score - a.candidate.score
    || (b.candidate.returnOnRisk ?? 0) - (a.candidate.returnOnRisk ?? 0)
    || a.symbol.localeCompare(b.symbol)
  ));

  const seen = new Set();
  const candidates = [];
  for (const item of collected) {
    const built = candidateRow(item.symbol, item.row, item.candidate);
    if (seen.has(built.candidate_key)) continue;
    seen.add(built.candidate_key);
    built.rank = candidates.length + 1;
    candidates.push(built);
  }

  return { universeCount: universe.size, candidateCount: candidates.length, candidates };
}

const MATERIALIZATION_INPUT_SQL = `
  WITH latest_batch AS (
    SELECT MAX(snapshot_ts) AS snapshot_ts
    FROM scanner_results_snapshots
    WHERE scan_key = $1
  ),
  latest_rows AS (
    SELECT s.symbol, s.price_close, s.call_wall, s.put_wall, s.gamma_regime,
           s.signal_score, s.gex_snapshot_ts, s.snapshot_ts
    FROM scanner_results_snapshots s
    JOIN latest_batch b ON b.snapshot_ts = s.snapshot_ts
    WHERE s.scan_key = $1
  ),
  latest_quote_chain AS (
    SELECT DISTINCT ON (s.symbol)
      s.symbol, s.id AS snapshot_id, s.snapshot_ts AS quote_snapshot_ts
    FROM option_chain_snapshots s
    WHERE EXISTS (
      SELECT 1 FROM option_contract_snapshots quoted
      WHERE quoted.snapshot_id = s.id
        AND quoted.bid IS NOT NULL AND quoted.ask IS NOT NULL
        AND quoted.ask > 0 AND quoted.ask >= quoted.bid
    )
    ORDER BY s.symbol, s.snapshot_ts DESC
  ),
  contract_samples AS (
    SELECT c.symbol,
      jsonb_agg(
        jsonb_build_object(
          'expiry', c.expiry,
          'dte', (c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date)::int,
          'strike', c.strike,
          'right', c.option_right,
          'bid', c.bid,
          'ask', c.ask,
          'mark', c.mark,
          'volume', c.volume,
          'openInterest', c.open_interest,
          'delta', c.delta,
          'gamma', c.gamma,
          'iv', c.iv,
          'contractSymbol', c.contract_symbol
        )
        ORDER BY c.expiry ASC, c.strike ASC, c.option_right ASC
      ) AS option_contracts
    FROM option_contract_snapshots c
    JOIN latest_quote_chain lc ON lc.symbol = c.symbol AND lc.snapshot_id = c.snapshot_id
    WHERE c.bid IS NOT NULL AND c.ask IS NOT NULL
    GROUP BY c.symbol
  )
  SELECT lr.symbol, lr.price_close, lr.call_wall, lr.put_wall, lr.gamma_regime,
         lr.signal_score, lr.gex_snapshot_ts, lr.snapshot_ts,
         lqc.quote_snapshot_ts,
         COALESCE(cs.option_contracts, '[]'::jsonb) AS option_contracts
  FROM latest_rows lr
  LEFT JOIN latest_quote_chain lqc ON lqc.symbol = lr.symbol
  LEFT JOIN contract_samples cs ON cs.symbol = lr.symbol`;

async function fetchMaterializationInput(pool, scanKey) {
  const { rows } = await pool.query(MATERIALIZATION_INPUT_SQL, [scanKey]);
  let cutoff = null;
  for (const row of rows) {
    if (row.snapshot_ts && (!cutoff || new Date(row.snapshot_ts) > new Date(cutoff))) {
      cutoff = row.snapshot_ts;
    }
  }
  return { rows, cutoff };
}

async function insertCandidates(pool, batchId, candidates) {
  const cols = 14;
  for (let start = 0; start < candidates.length; start += CANDIDATE_INSERT_CHUNK) {
    const chunk = candidates.slice(start, start + CANDIDATE_INSERT_CHUNK);
    const values = [];
    const tuples = chunk.map((candidate, index) => {
      const base = index * cols;
      values.push(
        batchId,
        candidate.candidate_key,
        candidate.symbol,
        candidate.strategy,
        candidate.strategy_family,
        candidate.expiry,
        candidate.dte,
        candidate.spot,
        candidate.score,
        candidate.rank,
        JSON.stringify(candidate.legs_json),
        JSON.stringify(candidate.economics_json),
        JSON.stringify(candidate.signals_json),
        JSON.stringify(candidate.freshness_json),
      );
      const p = Array.from({ length: cols }, (_, i) => `$${base + i + 1}`);
      return `(${p.slice(0, 10).join(', ')}, ${p.slice(10).map(ref => `${ref}::jsonb`).join(', ')})`;
    });
    await pool.query(
      `INSERT INTO scanner_candidate_snapshots
         (batch_id, candidate_key, symbol, strategy, strategy_family, expiry, dte,
          spot, score, rank, legs_json, economics_json, signals_json, freshness_json)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (batch_id, candidate_key) DO NOTHING`,
      values,
    );
  }
}

function batchKeep() {
  const configured = parseInt(process.env.SCANNER_CANDIDATE_BATCH_KEEP ?? 5, 10);
  return Number.isFinite(configured) ? configured : 5;
}

/**
 * Keep only the newest `SCANNER_CANDIDATE_BATCH_KEEP` completed batches per
 * scan_key and drop everything else (older completed, plus stale running/failed
 * rows) so the tables do not grow without bound -- a batch runs every scan cycle
 * and carries thousands of rows. `ON DELETE CASCADE` removes the snapshots.
 * Best-effort: the just-written batch is already usable, so a prune failure is
 * logged and swallowed rather than failing the run. Returns the deleted count,
 * or null when pruning is disabled (`keep <= 0`) or errors.
 */
async function pruneOldBatches(pool, scanKey, currentBatchId) {
  const keep = batchKeep();
  if (keep <= 0) return null;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM scanner_candidate_batches
       WHERE scan_key = $1
         AND id <> $3
         AND id NOT IN (
           SELECT id FROM scanner_candidate_batches
           WHERE scan_key = $1 AND status = 'completed'
           ORDER BY completed_at DESC NULLS LAST
           LIMIT $2
         )`,
      [scanKey, keep, currentBatchId],
    );
    return rowCount ?? 0;
  } catch (err) {
    console.error('prune scanner candidate batches failed:', err.message);
    return null;
  }
}

/**
 * Materialize one batch for scanKey. Creates a 'running' batch row, inserts the
 * ranked candidates, then marks the batch 'completed'. On any error the batch is
 * marked 'failed' with the message; readers only serve 'completed' batches, so a
 * partially written run is never visible.
 */
async function runMaterialization(pool, { scanKey = DEFAULT_SCAN_KEY, overrides = {} } = {}) {
  const { rows, cutoff } = await fetchMaterializationInput(pool, scanKey);
  const { universeCount, candidateCount, candidates } = buildCandidateBatch({ rows, overrides });

  const { rows: batchRows } = await pool.query(
    `INSERT INTO scanner_candidate_batches
       (scan_key, algorithm_version, source_snapshot_cutoff, universe_count, candidate_count, started_at, status)
     VALUES ($1, $2, $3, $4, $5, NOW(), 'running')
     RETURNING id`,
    [scanKey, ALGORITHM_VERSION, cutoff, universeCount, candidateCount],
  );
  const batchId = batchRows[0].id;

  try {
    if (candidates.length) await insertCandidates(pool, batchId, candidates);
    await pool.query(
      `UPDATE scanner_candidate_batches
         SET status = 'completed', completed_at = NOW(), candidate_count = $2
       WHERE id = $1`,
      [batchId, candidateCount],
    );
    const pruned = await pruneOldBatches(pool, scanKey, batchId);
    // Capture this batch into the durable result ledger (R2.1) and resolve any
    // now-expired entries. Best-effort — the ledger must never fail a batch.
    let ledgerCaptured = 0;
    let ledgerResolved = 0;
    try {
      const { captureLedger, evaluateLedger } = require('../routes/ledger');
      ledgerCaptured = await captureLedger(pool, batchId);
      ledgerResolved = await evaluateLedger(pool);
    } catch (ledgerErr) {
      console.error('candidate ledger capture/evaluate skipped:', ledgerErr.message);
    }
    return { batchId, scanKey, algorithmVersion: ALGORITHM_VERSION, universeCount, candidateCount, prunedBatches: pruned, ledgerCaptured, ledgerResolved, status: 'completed' };
  } catch (err) {
    await pool.query(
      `UPDATE scanner_candidate_batches
         SET status = 'failed', completed_at = NOW(), error = $2
       WHERE id = $1`,
      [batchId, String(err && err.message ? err.message : err).slice(0, 500)],
    );
    throw err;
  }
}

module.exports = {
  ALGORITHM_VERSION,
  strategyFamily,
  candidateKey,
  buildCandidateBatch,
  fetchMaterializationInput,
  pruneOldBatches,
  runMaterialization,
  MATERIALIZATION_INPUT_SQL,
};

if (require.main === module) {
  // eslint-disable-next-line global-require
  const pool = require('../db');
  const scanKey = process.argv[2] || DEFAULT_SCAN_KEY;
  runMaterialization(pool, { scanKey })
    .then(result => {
      console.log('Materialized scanner candidates:', JSON.stringify(result));
      return pool.end();
    })
    .catch(async err => {
      console.error('Candidate materialization failed:', err.message);
      try { await pool.end(); } catch (_) { /* noop */ }
      process.exit(1);
    });
}
