/**
 * GET /api/scan?minIvr=30&maxIvr=80&gammaRegime=positive&wall=either&nearWallPct=3
 *
 * Reads precomputed scanner rows from scanner_results_snapshots. This route
 * must not call external providers or recompute the full watchlist on demand.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const SCANNER_STALE_MINUTES = parseInt(process.env.SCANNER_STALE_MINUTES ?? 5, 10);
const SCANNER_CACHE_SECONDS = parseInt(process.env.SCANNER_CACHE_SECONDS ?? 60, 10);
const DEFAULT_SCAN_KEY = process.env.SCAN_KEY || 'watchlist_v1';

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

function isMissingTableError(err) {
  return err?.code === '42P01';
}

router.get('/', async (req, res) => {
  const minIvr = parseFloat(req.query.minIvr ?? 0);
  const maxIvr = parseFloat(req.query.maxIvr ?? 100);
  const minIvHv = parseFloat(req.query.minIvHv ?? -999);
  const limit = Math.min(parseInt(req.query.limit ?? 50, 10), 200);
  const gammaRegime = String(req.query.gammaRegime ?? 'all').toLowerCase();
  const wall = String(req.query.wall ?? 'all').toLowerCase();
  const nearWallPct = optionalFloat(req.query.nearWallPct);
  const minLocalGamma = optionalFloat(req.query.minLocalGamma);
  const minTotalOi = optionalInt(req.query.minTotalOi);
  const minTotalVolume = optionalInt(req.query.minTotalVolume);
  const minVolumeOiRatio = optionalFloat(req.query.minVolumeOiRatio);
  const minUnusualOi = optionalInt(req.query.minUnusualOi);
  const minOiDelta = optionalInt(req.query.minOiDelta);
  const pcrMin = optionalFloat(req.query.pcrMin);
  const pcrMax = optionalFloat(req.query.pcrMax);
  const unusualOnly = String(req.query.unusualOnly ?? 'false').toLowerCase() === 'true';
  const sort = String(req.query.sort ?? 'ivr').toLowerCase();
  const scanKey = String(req.query.scanKey ?? DEFAULT_SCAN_KEY).trim() || DEFAULT_SCAN_KEY;

  const validRegimes = new Set(['all', 'positive', 'negative', 'neutral']);
  const validWalls = new Set(['all', 'call', 'put', 'either']);
  const validSorts = new Set(['ivr', 'combined']);

  if (
    isNaN(minIvr) || isNaN(maxIvr) || isNaN(minIvHv) || isNaN(limit)
    || Number.isNaN(nearWallPct) || Number.isNaN(minLocalGamma)
    || Number.isNaN(minTotalOi) || Number.isNaN(minTotalVolume)
    || Number.isNaN(minVolumeOiRatio)
    || Number.isNaN(minUnusualOi) || Number.isNaN(minOiDelta)
    || Number.isNaN(pcrMin) || Number.isNaN(pcrMax)
    || !validRegimes.has(gammaRegime) || !validWalls.has(wall) || !validSorts.has(sort)
  ) {
    return res.status(400).json({ error: 'invalid query params' });
  }

  const key = cacheKey('scan', {
    minIvr,
    maxIvr,
    minIvHv,
    gammaRegime,
    wall,
    nearWallPct,
    minLocalGamma,
    minTotalOi,
    minTotalVolume,
    minVolumeOiRatio,
    minUnusualOi,
    minOiDelta,
    pcrMin,
    pcrMax,
    unusualOnly,
    sort,
    scanKey,
    limit,
  });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const { rows } = await pool.query(
      `WITH latest_batch AS (
         SELECT MAX(snapshot_ts) AS snapshot_ts
         FROM scanner_results_snapshots
         WHERE scan_key = $1
       ),
       latest_rows AS (
         SELECT s.*
         FROM scanner_results_snapshots s
         JOIN latest_batch b ON b.snapshot_ts = s.snapshot_ts
         WHERE s.scan_key = $1
       )
       SELECT
         symbol,
         metric_date AS date,
         iv30, hv30, iv_rank, iv_percentile, iv_hv_diff, earnings_date, source,
         price_close, price_date, price_source, price_status,
         gex_snapshot_ts, gex_source, gex_status, global_gex, local_gamma,
         gamma_flip, gamma_regime, call_wall, put_wall, max_pain,
         pcr_oi, pcr_volume, gex_confidence,
         total_oi, total_volume, volume_oi_ratio, max_strike_oi, max_strike_volume,
         call_wall_distance_pct, put_wall_distance_pct, signal_score,
         trend_score, trend_label, trend_signal, trend_change_5d,
         trend_rsi14, trend_ma20, trend_ma50, trend_ma200,
         unusual_oi_count, max_oi_delta, max_volume_oi_ratio, unusual_status,
         snapshot_ts,
         CASE
           WHEN snapshot_ts IS NULL THEN 'missing'
           WHEN EXTRACT(EPOCH FROM (NOW() - snapshot_ts)) / 60.0 > $11 THEN 'stale'
           ELSE freshness
         END AS freshness,
         CASE
           WHEN snapshot_ts IS NULL THEN TRUE
           WHEN EXTRACT(EPOCH FROM (NOW() - snapshot_ts)) / 60.0 > $11 THEN TRUE
           ELSE is_stale
         END AS is_stale,
         refresh_status
       FROM latest_rows
       WHERE iv_rank >= $2
         AND iv_rank <= $3
         AND COALESCE(iv_hv_diff, -999) >= $4
         AND ($5 = 'all' OR gamma_regime = $5)
         AND ($6::numeric IS NULL OR ABS(COALESCE(local_gamma, 0)) >= $6)
         AND ($7::bigint IS NULL OR COALESCE(total_oi, 0) >= $7)
         AND ($8::bigint IS NULL OR COALESCE(total_volume, 0) >= $8)
         AND ($12::numeric IS NULL OR volume_oi_ratio >= $12)
         AND ($15::int IS NULL OR COALESCE(unusual_oi_count, 0) >= $15)
         AND ($16::bigint IS NULL OR ABS(COALESCE(max_oi_delta, 0)) >= $16)
         AND ($17::numeric IS NULL OR pcr_oi >= $17)
         AND ($18::numeric IS NULL OR pcr_oi <= $18)
         AND ($19::boolean = FALSE OR COALESCE(unusual_oi_count, 0) > 0)
         AND (
           $9 = 'all'
           OR $10::numeric IS NULL
           OR (
             ($9 IN ('call', 'either') AND call_wall_distance_pct IS NOT NULL AND call_wall_distance_pct <= $10)
             OR
             ($9 IN ('put', 'either') AND put_wall_distance_pct IS NOT NULL AND put_wall_distance_pct <= $10)
           )
         )
       ORDER BY
         CASE WHEN $13 = 'combined' THEN signal_score END DESC NULLS LAST,
         COALESCE(unusual_oi_count, 0) DESC,
         iv_rank DESC NULLS LAST,
         symbol ASC
       LIMIT $14`,
      [
        scanKey,
        minIvr,
        maxIvr,
        minIvHv,
        gammaRegime,
        minLocalGamma,
        minTotalOi,
        minTotalVolume,
        wall,
        nearWallPct,
        SCANNER_STALE_MINUTES,
        minVolumeOiRatio,
        sort,
        limit,
        minUnusualOi,
        minOiDelta,
        pcrMin,
        pcrMax,
        unusualOnly,
      ]
    );

    const hasRows = rows.length > 0;
    const stale = rows.some(row => row.is_stale);
    if (!hasRows || stale) {
      const refreshStatus = await enqueueRefreshJob({
        symbol: '__SCAN__',
        jobType: 'scanner_materialize',
        provider: 'internal',
        requestParams: { scan_key: scanKey, reason: hasRows ? 'stale_scan_snapshot' : 'missing_scan_snapshot' },
      });
      for (const row of rows) {
        if (row.is_stale) row.refresh_status = refreshStatus;
      }
    }

    res.json(setCache(key, rows, SCANNER_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) return res.json([]);
    console.error('GET /api/scan error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
