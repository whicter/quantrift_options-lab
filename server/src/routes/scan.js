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
 *   { symbol, date, iv30, hv30, iv_rank, iv_hv_diff, earnings_date, source },
 *   ...
 * ]
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const minIvr  = parseFloat(req.query.minIvr  ?? 0);
  const maxIvr  = parseFloat(req.query.maxIvr  ?? 100);
  const minIvHv = parseFloat(req.query.minIvHv ?? -999);
  const limit   = Math.min(parseInt(req.query.limit ?? 50), 200);

  if (isNaN(minIvr) || isNaN(maxIvr) || isNaN(minIvHv) || isNaN(limit)) {
    return res.status(400).json({ error: 'invalid query params' });
  }

  try {
    // Get latest row per symbol, then filter
    const { rows } = await pool.query(
      `SELECT symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
              earnings_date, source
       FROM (
         SELECT DISTINCT ON (symbol)
           symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
           earnings_date, source
         FROM iv_history
         ORDER BY symbol, date DESC
       ) latest
       WHERE iv_rank >= $1
         AND iv_rank <= $2
         AND iv_hv_diff >= $3
       ORDER BY iv_rank DESC
       LIMIT $4`,
      [minIvr, maxIvr, minIvHv, limit]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/scan error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
