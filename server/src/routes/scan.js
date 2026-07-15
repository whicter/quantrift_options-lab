/**
 * GET /api/scan?minIvr=30&maxIvr=80&minIvHv=5&gammaRegime=positive&wall=either&nearWallPct=3&limit=50
 *
 * Scans latest IV data for symbols matching filter criteria.
 *
 * Query params (all optional):
 *   minIvr    — minimum IV Rank (0–100)
 *   maxIvr    — maximum IV Rank (0–100)
 *   minIvHv   — minimum IV - HV difference (sell premium edge)
 *   gammaRegime — positive, negative, neutral, or all
 *   wall      — call, put, either, or all
 *   nearWallPct — max distance from selected wall as pct of underlying
 *   minLocalGamma — minimum absolute local gamma
 *   minTotalOi — minimum aggregate option open interest
 *   minTotalVolume — minimum aggregate option volume
 *   minVolumeOiRatio — minimum aggregate volume / OI ratio
 *   sort      — ivr or combined
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

const OPTIONS_STALE_MINUTES = parseInt(process.env.OPTIONS_STALE_MINUTES ?? 15, 10);

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

function optionalFloat(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function optionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

router.get('/', async (req, res) => {
  const minIvr  = parseFloat(req.query.minIvr  ?? 0);
  const maxIvr  = parseFloat(req.query.maxIvr  ?? 100);
  const minIvHv = parseFloat(req.query.minIvHv ?? -999);
  const limit   = Math.min(parseInt(req.query.limit ?? 50), 200);
  const gammaRegime = String(req.query.gammaRegime ?? 'all').toLowerCase();
  const wall = String(req.query.wall ?? 'all').toLowerCase();
  const nearWallPct = optionalFloat(req.query.nearWallPct);
  const minLocalGamma = optionalFloat(req.query.minLocalGamma);
  const minTotalOi = optionalInt(req.query.minTotalOi);
  const minTotalVolume = optionalInt(req.query.minTotalVolume);
  const minVolumeOiRatio = optionalFloat(req.query.minVolumeOiRatio);
  const sort = String(req.query.sort ?? 'ivr').toLowerCase();

  const validRegimes = new Set(['all', 'positive', 'negative', 'neutral']);
  const validWalls = new Set(['all', 'call', 'put', 'either']);
  const validSorts = new Set(['ivr', 'combined']);

  if (
    isNaN(minIvr) || isNaN(maxIvr) || isNaN(minIvHv) || isNaN(limit)
    || Number.isNaN(nearWallPct) || Number.isNaN(minLocalGamma)
    || Number.isNaN(minTotalOi) || Number.isNaN(minTotalVolume)
    || Number.isNaN(minVolumeOiRatio)
    || !validRegimes.has(gammaRegime) || !validWalls.has(wall) || !validSorts.has(sort)
  ) {
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
       latest_gex AS (
         SELECT DISTINCT ON (g.symbol)
           g.symbol, g.snapshot_ts AS gex_snapshot_ts, g.source AS gex_source,
           g.global_gex, g.local_gamma, g.gamma_flip, g.gamma_regime,
           g.call_wall, g.put_wall, g.max_pain, g.pcr_oi, g.pcr_volume,
           g.confidence, c.underlying_price, c.provider_status,
           EXTRACT(EPOCH FROM (NOW() - g.snapshot_ts)) / 60.0 AS gex_age_minutes
         FROM gex_snapshots g
         JOIN option_chain_snapshots c ON c.id = g.snapshot_id
         ORDER BY g.symbol, g.snapshot_ts DESC
       ),
       latest_chain AS (
         SELECT DISTINCT ON (symbol) symbol, id AS latest_snapshot_id
         FROM option_chain_snapshots
         ORDER BY symbol, snapshot_ts DESC
       ),
       option_totals AS (
         SELECT
           symbol,
           SUM(COALESCE(call_oi, 0) + COALESCE(put_oi, 0)) AS total_oi,
           SUM(COALESCE(call_volume, 0) + COALESCE(put_volume, 0)) AS total_volume,
           MAX(GREATEST(COALESCE(call_oi, 0), COALESCE(put_oi, 0))) AS max_strike_oi,
           MAX(GREATEST(COALESCE(call_volume, 0), COALESCE(put_volume, 0))) AS max_strike_volume
         FROM gex_by_strike_snapshots
         WHERE snapshot_id IN (SELECT latest_snapshot_id FROM latest_chain)
         GROUP BY symbol
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
              END AS price_status,
              latest_gex.gex_snapshot_ts, latest_gex.gex_source, latest_gex.global_gex,
              latest_gex.local_gamma, latest_gex.gamma_flip, latest_gex.gamma_regime,
              latest_gex.call_wall, latest_gex.put_wall, latest_gex.max_pain,
              latest_gex.pcr_oi, latest_gex.pcr_volume, latest_gex.confidence AS gex_confidence,
              CASE
                WHEN latest_gex.gex_snapshot_ts IS NULL THEN 'missing'
                WHEN latest_gex.gex_age_minutes > $12 THEN 'stale'
                ELSE 'fresh'
              END AS gex_status,
              option_totals.total_oi, option_totals.total_volume,
              option_totals.total_volume / NULLIF(option_totals.total_oi, 0) AS volume_oi_ratio,
              option_totals.max_strike_oi, option_totals.max_strike_volume,
              CASE
                WHEN COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NULL THEN NULL
                WHEN latest_gex.call_wall IS NULL THEN NULL
                ELSE ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.call_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100
              END AS call_wall_distance_pct,
              CASE
                WHEN COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NULL THEN NULL
                WHEN latest_gex.put_wall IS NULL THEN NULL
                ELSE ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.put_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100
              END AS put_wall_distance_pct,
              (
                COALESCE(latest_iv.iv_rank, 0)
                + CASE
                    WHEN latest_gex.gamma_regime = 'negative' THEN 20
                    WHEN latest_gex.gamma_regime = 'positive' THEN 10
                    ELSE 0
                  END
                + CASE
                    WHEN latest_gex.call_wall IS NOT NULL
                      AND COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NOT NULL
                      AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.call_wall)
                          / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= 3
                    THEN 10 ELSE 0
                  END
                + CASE
                    WHEN latest_gex.put_wall IS NOT NULL
                      AND COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NOT NULL
                      AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.put_wall)
                          / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= 3
                    THEN 10 ELSE 0
                  END
              ) AS signal_score
       FROM (
         SELECT *
         FROM latest_iv
       ) latest_iv
       LEFT JOIN latest_price ON latest_price.symbol = latest_iv.symbol
       LEFT JOIN latest_gex ON latest_gex.symbol = latest_iv.symbol
       LEFT JOIN option_totals ON option_totals.symbol = latest_iv.symbol
       CROSS JOIN price_global
       WHERE latest_iv.symbol = ANY($5)
         AND latest_iv.iv_rank >= $1
         AND latest_iv.iv_rank <= $2
         AND latest_iv.iv_hv_diff >= $3
         AND ($6 = 'all' OR latest_gex.gamma_regime = $6)
         AND ($7::numeric IS NULL OR ABS(COALESCE(latest_gex.local_gamma, 0)) >= $7)
         AND ($8::bigint IS NULL OR COALESCE(option_totals.total_oi, 0) >= $8)
         AND ($9::bigint IS NULL OR COALESCE(option_totals.total_volume, 0) >= $9)
         AND ($14::numeric IS NULL OR option_totals.total_volume / NULLIF(option_totals.total_oi, 0) >= $14)
         AND (
           $10 = 'all'
           OR $11::numeric IS NULL
           OR (
             COALESCE(latest_price.price_close, latest_gex.underlying_price) IS NOT NULL
             AND (
               ($10 IN ('call', 'either') AND latest_gex.call_wall IS NOT NULL
                 AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.call_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= $11)
               OR
               ($10 IN ('put', 'either') AND latest_gex.put_wall IS NOT NULL
                 AND ABS(COALESCE(latest_price.price_close, latest_gex.underlying_price) - latest_gex.put_wall)
                     / NULLIF(COALESCE(latest_price.price_close, latest_gex.underlying_price), 0) * 100 <= $11)
             )
           )
         )
       ORDER BY
         CASE WHEN $13 = 'combined' THEN (
           COALESCE(latest_iv.iv_rank, 0)
           + CASE WHEN latest_gex.gamma_regime = 'negative' THEN 20 WHEN latest_gex.gamma_regime = 'positive' THEN 10 ELSE 0 END
         ) END DESC NULLS LAST,
         latest_iv.iv_rank DESC
       LIMIT $4`,
      [
        minIvr, maxIvr, minIvHv, limit, watchlist,
        gammaRegime,
        minLocalGamma,
        minTotalOi,
        minTotalVolume,
        wall,
        nearWallPct,
        OPTIONS_STALE_MINUTES,
        sort,
        minVolumeOiRatio,
      ]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/scan error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
