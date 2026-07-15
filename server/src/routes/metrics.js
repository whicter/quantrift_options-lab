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
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const METRICS_CACHE_SECONDS = parseInt(process.env.METRICS_CACHE_SECONDS ?? 60, 10);
const IV_STALE_DAYS = parseInt(process.env.IV_STALE_DAYS ?? 2, 10);

router.get('/', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' });

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbolList.length === 0) return res.status(400).json({ error: 'no valid symbols' });
  if (symbolList.length > 50) return res.status(400).json({ error: 'max 50 symbols per request' });

  const key = cacheKey('metrics', symbolList.slice().sort());
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    // Fetch latest row per symbol using DISTINCT ON
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (symbol)
         symbol, date, iv30, hv30, iv_rank, iv_percentile, iv_hv_diff,
         earnings_date, term_structure, source, created_at AS snapshot_ts,
         CASE
           WHEN date < CURRENT_DATE - ($2::int * INTERVAL '1 day') THEN 'stale'
           ELSE 'fresh'
         END AS freshness,
         CASE
           WHEN date < CURRENT_DATE - ($2::int * INTERVAL '1 day') THEN TRUE
           ELSE FALSE
         END AS is_stale
       FROM iv_history
       WHERE symbol = ANY($1)
       ORDER BY symbol, date DESC`,
      [symbolList, IV_STALE_DAYS]
    );

    const result = {};
    for (const row of rows) {
      row.refresh_status = row.is_stale
        ? await enqueueRefreshJob({
            symbol: row.symbol,
            jobType: 'symbol_metrics_snapshot',
            provider: row.source || 'metrics_provider',
            requestParams: { reason: 'stale_metrics_snapshot', date: row.date },
          })
        : 'none';
      result[row.symbol] = row;
    }
    const returnedSymbols = new Set(rows.map(row => row.symbol));
    for (const symbol of symbolList) {
      if (returnedSymbols.has(symbol)) continue;
      await enqueueRefreshJob({
        symbol,
        jobType: 'symbol_metrics_snapshot',
        provider: 'metrics_provider',
        requestParams: { reason: 'missing_metrics_snapshot' },
      });
    }

    res.json(setCache(key, result, METRICS_CACHE_SECONDS));
  } catch (err) {
    console.error('GET /api/metrics error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
