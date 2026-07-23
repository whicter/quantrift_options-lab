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
const USE_DERIVED_VOLATILITY = String(process.env.USE_DERIVED_VOLATILITY ?? 'true').toLowerCase() !== 'false';

async function sendMetrics(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' });

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbolList.length === 0) return res.status(400).json({ error: 'no valid symbols' });
  if (symbolList.length > 50) return res.status(400).json({ error: 'max 50 symbols per request' });

  const key = cacheKey('metrics', symbolList.slice().sort());
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const { rows } = await pool.query(
      `WITH requested AS (
         SELECT UNNEST($1::text[]) AS symbol
       ),
       latest_provider AS (
         SELECT DISTINCT ON (symbol)
           symbol, date, iv30, hv30, hv60, hv90, iv_rank, iv_percentile,
           iv_hv_diff, earnings_date, term_structure, source, created_at
         FROM iv_history
         WHERE symbol = ANY($1)
         ORDER BY symbol, date DESC
       ),
       latest_hv AS (
         SELECT DISTINCT ON (symbol)
           symbol, metric_date, hv30, hv60, hv90, hv_source, updated_at
         FROM volatility_history
         WHERE symbol = ANY($1) AND hv30 IS NOT NULL
         ORDER BY symbol, metric_date DESC
       ),
       latest_atm AS (
         SELECT DISTINCT ON (symbol)
           symbol, metric_date, atm_iv, atm_expiry, atm_strike, atm_dte,
           iv_source, iv_observation_count, iv_rank_ready, updated_at
         FROM volatility_history
         WHERE symbol = ANY($1) AND atm_iv IS NOT NULL
         ORDER BY symbol, metric_date DESC
       ),
       latest_rank AS (
         SELECT DISTINCT ON (symbol)
           symbol, metric_date, iv_rank, iv_percentile,
           iv_observation_count, iv_source, updated_at
         FROM volatility_history
         WHERE symbol = ANY($1) AND iv_rank_ready = TRUE
         ORDER BY symbol, metric_date DESC
       ),
       merged AS (
         SELECT
           requested.symbol,
           GREATEST(provider.date, hv.metric_date, atm.metric_date) AS date,
           CASE WHEN $3 THEN COALESCE(atm.atm_iv, provider.iv30) ELSE provider.iv30 END AS iv30,
           CASE WHEN $3 THEN COALESCE(hv.hv30, provider.hv30) ELSE provider.hv30 END AS hv30,
           CASE WHEN $3 THEN COALESCE(hv.hv60, provider.hv60) ELSE provider.hv60 END AS hv60,
           CASE WHEN $3 THEN COALESCE(hv.hv90, provider.hv90) ELSE provider.hv90 END AS hv90,
           CASE WHEN $3 THEN COALESCE(rank.iv_rank, provider.iv_rank) ELSE provider.iv_rank END AS iv_rank,
           CASE WHEN $3 THEN COALESCE(rank.iv_percentile, provider.iv_percentile) ELSE provider.iv_percentile END AS iv_percentile,
           provider.earnings_date,
           provider.term_structure,
           provider.source AS provider_source,
           CASE WHEN $3 AND atm.atm_iv IS NOT NULL THEN atm.iv_source ELSE provider.source END AS iv_source,
           CASE WHEN $3 AND hv.hv30 IS NOT NULL THEN hv.hv_source ELSE provider.source END AS hv_source,
           CASE WHEN $3 AND rank.iv_rank IS NOT NULL THEN rank.iv_source ELSE provider.source END AS iv_rank_source,
           CASE WHEN $3 THEN COALESCE(atm.iv_rank_ready, FALSE) ELSE FALSE END AS iv_rank_ready,
           CASE WHEN $3 THEN COALESCE(atm.iv_observation_count, 0) ELSE 0 END AS iv_observation_count,
           CASE WHEN $3 THEN atm.atm_iv ELSE NULL END AS atm_iv,
           CASE WHEN $3 THEN atm.atm_expiry ELSE NULL END AS atm_expiry,
           CASE WHEN $3 THEN atm.atm_strike ELSE NULL END AS atm_strike,
           CASE WHEN $3 THEN atm.atm_dte ELSE NULL END AS atm_dte,
           GREATEST(provider.created_at, hv.updated_at, atm.updated_at, rank.updated_at) AS snapshot_ts
         FROM requested
         LEFT JOIN latest_provider provider ON provider.symbol = requested.symbol
         LEFT JOIN latest_hv hv ON hv.symbol = requested.symbol
         LEFT JOIN latest_atm atm ON atm.symbol = requested.symbol
         LEFT JOIN latest_rank rank ON rank.symbol = requested.symbol
       )
       SELECT *,
         CASE WHEN iv30 IS NOT NULL AND hv30 IS NOT NULL THEN iv30 - hv30 ELSE NULL END AS iv_hv_diff,
         CASE
           WHEN iv_source IS DISTINCT FROM provider_source
             OR hv_source IS DISTINCT FROM provider_source
             OR iv_rank_source IS DISTINCT FROM provider_source
           THEN 'hybrid'
           ELSE provider_source
         END AS source,
         CASE
           WHEN date < CURRENT_DATE - ($2::int * INTERVAL '1 day') THEN 'stale'
           ELSE 'fresh'
         END AS freshness,
         CASE
           WHEN date < CURRENT_DATE - ($2::int * INTERVAL '1 day') THEN TRUE
           ELSE FALSE
         END AS is_stale
       FROM merged
       WHERE date IS NOT NULL`,
      [symbolList, IV_STALE_DAYS, USE_DERIVED_VOLATILITY]
    );

    const result = {};
    for (const row of rows) {
      row.refresh_status = row.is_stale
        ? await enqueueRefreshJob({
            symbol: row.symbol,
            jobType: 'symbol_metrics_snapshot',
            provider: 'metrics_provider',
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
}

router.get('/', sendMetrics);

module.exports = router;
module.exports.sendMetrics = sendMetrics;
