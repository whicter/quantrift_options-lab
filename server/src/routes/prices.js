/**
 * GET /api/prices/:symbol?limit=60
 *
 * Returns daily OHLCV bars from price_history, sorted ascending by date.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const limit = Math.min(parseInt(req.query.limit ?? 60), 250);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (isNaN(limit) || limit <= 0) return res.status(400).json({ error: 'invalid limit' });

  try {
    const { rows } = await pool.query(
      `SELECT symbol, date, open, high, low, close, volume, source, created_at
       FROM (
         SELECT symbol, date, open, high, low, close, volume, source, created_at
         FROM price_history
         WHERE symbol = $1
         ORDER BY date DESC
         LIMIT $2
       ) recent
       ORDER BY date ASC`,
      [symbol, limit]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'no price history', symbol });
    }

    res.json({
      symbol,
      source: rows[rows.length - 1].source,
      count: rows.length,
      latest_date: rows[rows.length - 1].date,
      prices: rows.map(row => ({
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      })),
    });
  } catch (err) {
    console.error('GET /api/prices/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
