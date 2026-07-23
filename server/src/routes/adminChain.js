/**
 * GET /api/admin/chain/:symbol
 *
 * The raw option chain plus data-quality diagnostics, for debug, coverage and
 * data-quality inspection. This is the inspection counterpart to the product
 * routes: normal /api/scan and /api/analyze never return the full contract
 * chain, so operators need an authenticated way to see it.
 *
 * Admin-only and fail-closed: an unset ADMIN_API_TOKEN disables the route
 * rather than exposing raw provider data and internal source names.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdminToken } = require('../lib/adminAuth');

router.use(requireAdminToken);

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * Aggregate diagnostics from the persisted contracts.
 *
 * Reports what the snapshot actually contains, so a coverage gap (missing
 * Greeks or OI, no usable quotes) is visible without re-running the provider.
 */
function diagnostics(contracts) {
  const total = contracts.length;
  let missingGreeks = 0;
  let missingOi = 0;
  let quoted = 0;
  const expiries = new Set();
  for (const row of contracts) {
    if (row.gamma == null || row.delta == null) missingGreeks += 1;
    if (row.open_interest == null) missingOi += 1;
    const bid = row.bid == null ? null : Number(row.bid);
    const ask = row.ask == null ? null : Number(row.ask);
    if (bid != null && ask != null && ask > 0 && ask >= bid) quoted += 1;
    if (row.expiry) expiries.add(row.expiry.toISOString?.().slice(0, 10) ?? String(row.expiry).slice(0, 10));
  }
  return {
    contract_count: total,
    quoted_contract_count: quoted,
    // A chain can exist with zero usable quotes; that state is what blocks
    // strategy legs, so it is reported explicitly rather than implied.
    has_usable_quotes: quoted > 0,
    missing_greeks_count: missingGreeks,
    missing_oi_count: missingOi,
    missing_greeks_ratio: total ? Number((missingGreeks / total).toFixed(4)) : null,
    missing_oi_ratio: total ? Number((missingOi / total).toFixed(4)) : null,
    expiry_count: expiries.size,
    expiries: [...expiries].sort(),
  };
}

async function sendAdminChain(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  const limit = Math.min(Math.max(parseInt(req.query.limit ?? 1000, 10) || 1000, 1), 5000);

  try {
    const snapshotResult = await pool.query(
      `SELECT id, symbol, source, provider_status, snapshot_ts,
              underlying_price, underlying_bid, underlying_ask,
              contract_count, completeness_pct, missing_greeks_ratio, missing_oi_ratio,
              raw_metadata
       FROM option_chain_snapshots
       WHERE symbol = $1
       ORDER BY snapshot_ts DESC
       LIMIT 1`,
      [symbol]
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) {
      return res.json({ symbol, status: 'missing', snapshot: null, diagnostics: null, contracts: [] });
    }

    const contractsResult = await pool.query(
      `SELECT expiry, strike, option_right AS right, bid, ask, last, mark, volume, open_interest,
              iv, delta, gamma, theta, vega, rho, bid_size, ask_size,
              contract_symbol, local_symbol, con_id, provider_contract_id
       FROM option_contract_snapshots
       WHERE snapshot_id = $1
       ORDER BY expiry ASC, strike ASC, option_right ASC
       LIMIT $2`,
      [snapshot.id, limit]
    );

    return res.json({
      symbol,
      status: 'ready',
      snapshot: {
        id: snapshot.id,
        source: snapshot.source,
        provider_status: snapshot.provider_status,
        snapshot_ts: snapshot.snapshot_ts,
        underlying_price: snapshot.underlying_price,
        underlying_bid: snapshot.underlying_bid,
        underlying_ask: snapshot.underlying_ask,
        stored_contract_count: snapshot.contract_count,
        completeness_pct: snapshot.completeness_pct,
        missing_greeks_ratio: snapshot.missing_greeks_ratio,
        missing_oi_ratio: snapshot.missing_oi_ratio,
        raw_metadata: snapshot.raw_metadata,
      },
      // Recomputed from the returned rows so it reflects exactly what the
      // response contains, not just the stored summary.
      diagnostics: diagnostics(contractsResult.rows),
      returned_contract_count: contractsResult.rows.length,
      limit,
      contracts: contractsResult.rows,
    });
  } catch (err) {
    if (err?.code === '42P01') {
      return res.status(503).json({ error: 'option snapshot tables not migrated' });
    }
    console.error('GET /api/admin/chain/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendAdminChain);

module.exports = router;
module.exports.sendAdminChain = sendAdminChain;
module.exports.diagnostics = diagnostics;
