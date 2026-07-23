/**
 * GET /api/prices/:symbol?limit=60&interval=day|30m
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

async function sendPrices(req, res) {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const interval = String(req.query.interval || 'day').trim().toLowerCase();
  const maxLimit = interval === '30m' ? 2000 : 400;
  const limit = Math.min(parseInt(req.query.limit ?? (interval === '30m' ? 500 : 60)), maxLimit);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (!['day', '30m'].includes(interval)) return res.status(400).json({ error: 'invalid interval' });
  if (isNaN(limit) || limit <= 0) return res.status(400).json({ error: 'invalid limit' });

  try {
    const table = interval === '30m' ? 'price_history_30m' : 'price_history';
    const timeColumn = interval === '30m' ? 'bar_ts' : 'date';
    const extraColumns = interval === '30m' ? ', vwap, trade_count' : '';
    const { rows } = await pool.query(
      `SELECT symbol, ${timeColumn}, open, high, low, close, volume, source, created_at${extraColumns}
       FROM (
         SELECT symbol, ${timeColumn}, open, high, low, close, volume, source, created_at${extraColumns}
         FROM ${table}
         WHERE symbol = $1
         ORDER BY ${timeColumn} DESC
         LIMIT $2
       ) recent
       ORDER BY ${timeColumn} ASC`,
      [symbol, limit]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'no price history', symbol });
    }

    const latest = rows[rows.length - 1];
    const latestValue = interval === '30m' ? latest.bar_ts : latest.date;
    const ageDays = daysSince(latestValue);
    const isStale = ageDays == null ? true : ageDays > PRICE_STALE_DAYS;

    res.json({
      symbol,
      interval,
      source: latest.source,
      count: rows.length,
      latest_date: latestValue,
      snapshot_ts: latest.created_at,
      freshness: isStale ? 'stale' : 'fresh',
      is_stale: isStale,
      age_days: ageDays,
      prices: rows.map(row => ({
        date: interval === '30m' ? row.bar_ts : row.date,
        timestamp: interval === '30m' ? row.bar_ts : undefined,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        vwap: interval === '30m' ? row.vwap : undefined,
        trade_count: interval === '30m' ? row.trade_count : undefined,
      })),
    });
  } catch (err) {
    console.error('GET /api/prices/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendPrices);

module.exports = router;
module.exports.sendPrices = sendPrices;
