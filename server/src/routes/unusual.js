const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const UNUSUAL_CACHE_SECONDS = parseInt(process.env.UNUSUAL_CACHE_SECONDS ?? 60, 10);
const UNUSUAL_STALE_MINUTES = parseInt(process.env.UNUSUAL_STALE_MINUTES ?? 1440, 10);

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9.-]{1,12}$/.test(symbol);
}

function isMissingTableError(err) {
  return err?.code === '42P01';
}

router.get('/:symbol', async (req, res) => {
  const symbol = normalizeSymbol(req.params.symbol);
  const limit = Math.min(parseInt(req.query.limit ?? 20, 10), 100);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol) || Number.isNaN(limit)) return res.status(400).json({ error: 'invalid params' });

  const key = cacheKey('unusual', { symbol, limit });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const latestResult = await pool.query(
      `SELECT MAX(snapshot_ts) AS snapshot_ts
       FROM option_oi_delta_snapshots
       WHERE symbol = $1`,
      [symbol]
    );
    const latestTs = latestResult.rows[0]?.snapshot_ts;
    if (!latestTs) {
      const refreshStatus = await enqueueRefreshJob({
        symbol,
        jobType: 'option_chain_snapshot',
        requestParams: { reason: 'missing_unusual_snapshot' },
      });
      return res.json({
        symbol,
        snapshot_ts: null,
        freshness: 'missing',
        is_stale: true,
        refresh_status: refreshStatus,
        status: 'missing',
        items: [],
      });
    }

    const { rows } = await pool.query(
      `WITH latest AS (
         SELECT MAX(snapshot_ts) AS snapshot_ts
         FROM option_oi_delta_snapshots
         WHERE symbol = $1
       )
       SELECT symbol, snapshot_ts, previous_snapshot_ts, source,
              contract_symbol, provider_contract_id, expiry, strike,
              option_right AS right, bid, ask, volume, open_interest,
              previous_open_interest, oi_delta, oi_delta_pct, volume_oi_ratio,
              status, is_unusual, unusual_score
       FROM option_oi_delta_snapshots
       WHERE symbol = $1
         AND snapshot_ts = (SELECT snapshot_ts FROM latest)
       ORDER BY is_unusual DESC,
                ABS(COALESCE(oi_delta, 0)) DESC,
                COALESCE(volume, 0) DESC
       LIMIT $2`,
      [symbol, limit]
    );

    const ageMinutes = Math.floor((Date.now() - new Date(latestTs).getTime()) / 60000);
    const isStale = ageMinutes > UNUSUAL_STALE_MINUTES;
    const refreshStatus = isStale
      ? await enqueueRefreshJob({
          symbol,
          jobType: 'option_chain_snapshot',
          requestParams: { reason: 'stale_unusual_snapshot', snapshot_ts: latestTs },
        })
      : 'none';

    const confirmedCount = rows.filter(row => row.status === 'confirmed').length;
    const unusualCount = rows.filter(row => row.is_unusual).length;
    const status = unusualCount > 0
      ? 'confirmed'
      : confirmedCount > 0
        ? 'quiet'
        : rows[0]?.status || 'baseline';

    res.json(setCache(key, {
      symbol,
      snapshot_ts: latestTs,
      freshness: isStale ? 'stale' : 'fresh',
      is_stale: isStale,
      refresh_status: refreshStatus,
      age_minutes: ageMinutes,
      status,
      unusual_count: unusualCount,
      items: rows,
    }, UNUSUAL_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({
        symbol,
        snapshot_ts: null,
        freshness: 'missing',
        is_stale: true,
        refresh_status: 'none',
        status: 'missing',
        items: [],
      });
    }
    console.error('GET /api/unusual/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
