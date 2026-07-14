/**
 * GET /api/prices/:symbol?limit=60
 *
 * Returns daily OHLCV bars from price_history, sorted ascending by date.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

const PRICE_STALE_DAYS = parseInt(process.env.PRICE_STALE_DAYS ?? 5, 10);

function toDateString(value) {
  return value?.toISOString?.().slice(0, 10) || String(value).slice(0, 10);
}

function daysSince(dateValue) {
  const dateString = toDateString(dateValue);
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today - date) / 86400000);
}

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

    const latest = rows[rows.length - 1];
    const ageDays = daysSince(latest.date);
    const isStale = ageDays == null ? true : ageDays > PRICE_STALE_DAYS;

    res.json({
      symbol,
      source: latest.source,
      count: rows.length,
      latest_date: latest.date,
      snapshot_ts: latest.created_at,
      freshness: isStale ? 'stale' : 'fresh',
      is_stale: isStale,
      age_days: ageDays,
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
