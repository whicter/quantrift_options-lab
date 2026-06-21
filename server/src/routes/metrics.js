/**
 * GET /api/metrics?symbols=AAPL,SPY
 *
 * Returns latest IV metrics for each symbol from iv_history.
 * Falls back to the most recent row per symbol.
 *
 * Response:
 * {
 *   "AAPL": { symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
 *              earnings_date, term_structure, source },
 *   "SPY":  { ... }
 * }
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' });

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbolList.length === 0) return res.status(400).json({ error: 'no valid symbols' });
  if (symbolList.length > 50) return res.status(400).json({ error: 'max 50 symbols per request' });

  try {
    // Fetch latest row per symbol using DISTINCT ON
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (symbol)
         symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
         earnings_date, term_structure, source
       FROM iv_history
       WHERE symbol = ANY($1)
       ORDER BY symbol, date DESC`,
      [symbolList]
    );

    const result = {};
    for (const row of rows) {
      result[row.symbol] = row;
    }

    res.json(result);
  } catch (err) {
    console.error('GET /api/metrics error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
