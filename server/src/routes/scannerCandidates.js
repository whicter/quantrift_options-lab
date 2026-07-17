/**
 * GET /api/v1/scanner/candidates?scanKey=&strategy=&family=&symbol=&minScore=&limit=
 *
 * Serves pre-computed scanner candidates from the latest 'completed'
 * scanner_candidate_batches / scanner_candidate_snapshots (V3A-2). This route
 * never runs the candidate engine and never returns the raw option chain -- only
 * the selected legs of each concrete setup. A stale or missing batch still
 * returns the real candidates it has (with a batch-age flag) and enqueues a
 * materialization job; it never triggers a synchronous full-market provider fetch.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const DEFAULT_SCAN_KEY = process.env.SCAN_KEY || 'watchlist_v1';
const CANDIDATE_STALE_MINUTES = parseInt(process.env.SCANNER_CANDIDATE_STALE_MINUTES ?? 15, 10);
const CANDIDATE_CACHE_SECONDS = parseInt(process.env.SCANNER_CANDIDATE_CACHE_SECONDS ?? 60, 10);

function isMissingTableError(err) {
  return err?.code === '42P01';
}

function optionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function optionalFloat(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function candidateDto(row) {
  return {
    symbol: row.symbol,
    strategy: row.strategy,
    strategy_family: row.strategy_family,
    expiry: row.expiry,
    dte: row.dte,
    spot: row.spot != null ? Number(row.spot) : null,
    score: row.score != null ? Number(row.score) : null,
    rank: row.rank,
    legs: row.legs_json || [],
    economics: row.economics_json || {},
    signals: row.signals_json || {},
    freshness: row.freshness_json || {},
  };
}

async function enqueueMaterialize(scanKey, reason) {
  return enqueueRefreshJob({
    symbol: '__SCAN__',
    jobType: 'scanner_candidate_materialize',
    provider: 'internal',
    requestParams: { scan_key: scanKey, reason },
  });
}

async function sendCandidates(req, res) {
  const scanKey = String(req.query.scanKey ?? DEFAULT_SCAN_KEY).trim() || DEFAULT_SCAN_KEY;
  const strategy = String(req.query.strategy ?? '').trim();
  const family = String(req.query.family ?? '').trim();
  const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
  const minScore = optionalFloat(req.query.minScore);
  const limit = optionalInt(req.query.limit ?? 100);

  if (Number.isNaN(minScore) || Number.isNaN(limit) || limit === null || limit <= 0) {
    return res.status(400).json({ error: 'invalid query params' });
  }
  const cappedLimit = Math.min(limit, 500);

  const key = cacheKey('scanner_candidates', {
    scanKey, strategy, family, symbol, minScore, limit: cappedLimit,
  });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const { rows: batchRows } = await pool.query(
      `SELECT id, scan_key, algorithm_version, source_snapshot_cutoff,
              universe_count, candidate_count, started_at, completed_at,
              EXTRACT(EPOCH FROM (NOW() - completed_at))::int AS age_seconds
       FROM scanner_candidate_batches
       WHERE scan_key = $1 AND status = 'completed'
       ORDER BY completed_at DESC NULLS LAST
       LIMIT 1`,
      [scanKey],
    );

    if (!batchRows.length) {
      const refreshStatus = await enqueueMaterialize(scanKey, 'missing_candidate_batch');
      return res.json(setCache(key, {
        batch: null,
        refresh_status: refreshStatus,
        candidates: [],
      }, CANDIDATE_CACHE_SECONDS));
    }

    const batch = batchRows[0];
    const ageSeconds = batch.age_seconds == null ? null : Number(batch.age_seconds);
    const isStale = ageSeconds == null || ageSeconds > CANDIDATE_STALE_MINUTES * 60;

    const { rows } = await pool.query(
      `SELECT symbol, strategy, strategy_family, expiry, dte, spot, score, rank,
              legs_json, economics_json, signals_json, freshness_json
       FROM scanner_candidate_snapshots
       WHERE batch_id = $1
         AND ($2 = '' OR strategy = $2)
         AND ($3 = '' OR strategy_family = $3)
         AND ($4 = '' OR symbol = $4)
         AND ($5::numeric IS NULL OR score >= $5)
       ORDER BY rank ASC
       LIMIT $6`,
      [batch.id, strategy, family, symbol, minScore, cappedLimit],
    );

    let refreshStatus = 'none';
    if (isStale) refreshStatus = await enqueueMaterialize(scanKey, 'stale_candidate_batch');

    return res.json(setCache(key, {
      batch: {
        id: batch.id,
        scan_key: batch.scan_key,
        algorithm_version: batch.algorithm_version,
        source_snapshot_cutoff: batch.source_snapshot_cutoff,
        universe_count: batch.universe_count,
        candidate_count: batch.candidate_count,
        completed_at: batch.completed_at,
        age_seconds: ageSeconds,
        is_stale: isStale,
        refresh_status: refreshStatus,
      },
      candidates: rows.map(candidateDto),
    }, CANDIDATE_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({ batch: null, refresh_status: 'none', candidates: [] });
    }
    console.error('GET /api/v1/scanner/candidates error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/candidates', sendCandidates);

module.exports = router;
module.exports.sendCandidates = sendCandidates;
