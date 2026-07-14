/**
 * GET /api/scan?minIvr=30&maxIvr=80&minIvHv=5&limit=50
 *
 * Scans latest IV data for symbols matching filter criteria.
 *
 * Query params (all optional):
 *   minIvr    — minimum IV Rank (0–100)
 *   maxIvr    — maximum IV Rank (0–100)
 *   minIvHv   — minimum IV - HV difference (sell premium edge)
 *   limit     — max results (default 50, max 200)
 *
 * Response:
 * [
 *   {
 *     symbol, date, iv30, hv30, iv_rank, iv_hv_diff, earnings_date, source,
 *     price_close, price_date, price_source, price_status
 *   },
 *   ...
 * ]
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pool = require('../db');

const WATCHLIST_CANDIDATES = process.env.WATCHLIST_PATH
  ? [path.resolve(process.env.WATCHLIST_PATH)]
  : [
      path.resolve(__dirname, '../../../collector/watchlist.txt'),
      path.resolve(__dirname, '../../watchlist.txt'),
    ];

function loadWatchlist() {
  const watchlistPath = WATCHLIST_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!watchlistPath) return [];

  const seen = new Set();
  const symbols = [];

  for (const rawLine of fs.readFileSync(watchlistPath, 'utf8').split(/\r?\n/)) {
    const symbol = rawLine.split('#', 1)[0].trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
  }

  return symbols;
}

router.get('/', async (req, res) => {
  const minIvr  = parseFloat(req.query.minIvr  ?? 0);
  const maxIvr  = parseFloat(req.query.maxIvr  ?? 100);
  const minIvHv = parseFloat(req.query.minIvHv ?? -999);
  const limit   = Math.min(parseInt(req.query.limit ?? 50), 200);

  if (isNaN(minIvr) || isNaN(maxIvr) || isNaN(minIvHv) || isNaN(limit)) {
    return res.status(400).json({ error: 'invalid query params' });
  }

  try {
    const watchlist = loadWatchlist();
    if (watchlist.length === 0) {
      return res.json([]);
    }

    // Get latest row per symbol, then filter
    const { rows } = await pool.query(
      `WITH latest_iv AS (
         SELECT DISTINCT ON (symbol)
           symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
           earnings_date, source
         FROM iv_history
         ORDER BY symbol, date DESC
       ),
       latest_price AS (
         SELECT DISTINCT ON (symbol)
           symbol, date AS price_date, close AS price_close, source AS price_source
         FROM price_history
         ORDER BY symbol, date DESC
       ),
       price_global AS (
         SELECT MAX(price_date) AS latest_price_date
         FROM latest_price
       )
       SELECT latest_iv.symbol, latest_iv.date, latest_iv.iv30, latest_iv.hv30,
              latest_iv.iv_rank, latest_iv.iv_percentile, latest_iv.iv_hv_diff,
              latest_iv.earnings_date, latest_iv.source,
              latest_price.price_close, latest_price.price_date, latest_price.price_source,
              CASE
                WHEN latest_price.price_date IS NULL THEN 'missing'
                WHEN latest_price.price_date < price_global.latest_price_date THEN 'stale'
                ELSE 'covered'
              END AS price_status
       FROM (
         SELECT *
         FROM latest_iv
       ) latest_iv
       LEFT JOIN latest_price ON latest_price.symbol = latest_iv.symbol
       CROSS JOIN price_global
       WHERE latest_iv.symbol = ANY($5)
         AND latest_iv.iv_rank >= $1
         AND latest_iv.iv_rank <= $2
         AND latest_iv.iv_hv_diff >= $3
       ORDER BY latest_iv.iv_rank DESC
       LIMIT $4`,
      [minIvr, maxIvr, minIvHv, limit, watchlist]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/scan error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
