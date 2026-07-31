const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { normalizeSymbol, isValidSymbol } = require('../lib/symbols');

const NEWS_CACHE_SECONDS = parseInt(process.env.NEWS_CACHE_SECONDS ?? 60, 10);
const NEWS_API_WINDOW_HOURS = Math.min(Math.max(parseInt(process.env.NEWS_API_WINDOW_HOURS ?? 48, 10), 1), 168);

function isMissingTableError(err) {
  return err?.code === '42P01';
}

// News is an accumulating log, not a per-symbol snapshot product (unlike
// option chain/GEX): an empty result for a quiet symbol is a normal state,
// not staleness, so this route carries no freshness/is_stale gating.
async function sendNews(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? 20, 10), 1), 100);
  const windowHours = Math.min(Math.max(parseInt(req.query.hours ?? NEWS_API_WINDOW_HOURS, 10), 1), 168);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol) || Number.isNaN(limit) || Number.isNaN(windowHours)) {
    return res.status(400).json({ error: 'invalid params' });
  }

  const key = cacheKey('news', { symbol, limit, windowHours });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const { rows } = await pool.query(
      `SELECT published_at, provider_code, article_id, headline, source
       FROM news_articles
       WHERE symbol = $1
         AND published_at >= NOW() - ($2::text || ' hours')::interval
       ORDER BY published_at DESC
       LIMIT $3`,
      [symbol, windowHours, limit]
    );

    res.json(setCache(key, {
      symbol,
      window_hours: windowHours,
      count: rows.length,
      latest_published_at: rows[0]?.published_at || null,
      items: rows,
    }, NEWS_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({ symbol, window_hours: windowHours, count: 0, latest_published_at: null, items: [] });
    }
    console.error('GET /api/news/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendNews);

module.exports = { router, sendNews };
