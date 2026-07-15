const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const OPTIONS_STALE_MINUTES = parseInt(process.env.OPTIONS_STALE_MINUTES ?? 15, 10);
const GEX_CACHE_SECONDS = parseInt(process.env.GEX_CACHE_SECONDS ?? 120, 10);
const CHAIN_CACHE_SECONDS = parseInt(process.env.CHAIN_CACHE_SECONDS ?? 120, 10);

function isMissingTableError(err) {
  return err?.code === '42P01';
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9.-]{1,12}$/.test(symbol);
}

function ageMinutes(timestampValue) {
  if (!timestampValue) return null;
  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) return null;
  return Math.floor((Date.now() - timestamp.getTime()) / 60000);
}

function freshnessFor(snapshotTs) {
  const age = ageMinutes(snapshotTs);
  const isStale = age == null ? true : age > OPTIONS_STALE_MINUTES;
  return {
    freshness: isStale ? 'stale' : 'fresh',
    is_stale: isStale,
    age_minutes: age,
  };
}

function missingSnapshot(symbol) {
  return {
    symbol,
    source: null,
    snapshot_ts: null,
    freshness: 'missing',
    is_stale: true,
    provider_status: 'missing',
    refresh_status: 'none',
  };
}

async function latestChainSnapshot(symbol) {
  const { rows } = await pool.query(
    `SELECT *
     FROM option_chain_snapshots
     WHERE symbol = $1
     ORDER BY snapshot_ts DESC
     LIMIT 1`,
    [symbol]
  );
  return rows[0] || null;
}

async function latestGexSnapshot(symbol) {
  const { rows } = await pool.query(
    `SELECT g.*, c.underlying_price, c.contract_count, c.completeness_pct,
            c.missing_greeks_ratio, c.missing_oi_ratio, c.provider_status
     FROM gex_snapshots g
     JOIN option_chain_snapshots c ON c.id = g.snapshot_id
     WHERE g.symbol = $1
     ORDER BY g.snapshot_ts DESC
     LIMIT 1`,
    [symbol]
  );
  return rows[0] || null;
}

async function sendChainSnapshot(req, res, options = {}) {
  const symbol = normalizeSymbol(req.params.symbol);
  const includeContracts = options.includeContracts
    || String(req.query.includeContracts || '').toLowerCase() === 'true';

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  const cacheSuffix = includeContracts ? 'chain' : 'snapshot';
  const key = cacheKey(`options:${cacheSuffix}`, {
    symbol,
    includeContracts,
    limit: req.query.limit || null,
  });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const snapshot = await latestChainSnapshot(symbol);
    if (!snapshot) {
      const refreshStatus = await enqueueRefreshJob({
        symbol,
        jobType: 'option_chain_snapshot',
        requestParams: { reason: 'missing_chain_snapshot' },
      });
      return res.json({ ...missingSnapshot(symbol), refresh_status: refreshStatus });
    }

    let contracts = undefined;
    if (includeContracts) {
      const limit = Math.min(parseInt(req.query.limit ?? 500, 10), 2000);
      const { rows } = await pool.query(
        `SELECT expiry, strike, option_right AS right, bid, ask, last, mark, volume, open_interest,
                iv, delta, gamma, theta, vega, rho, bid_size, ask_size,
                contract_symbol, local_symbol, con_id, provider_contract_id
         FROM option_contract_snapshots
         WHERE snapshot_id = $1
         ORDER BY expiry ASC, strike ASC, option_right ASC
         LIMIT $2`,
        [snapshot.id, limit]
      );
      contracts = rows;
    }

    const state = freshnessFor(snapshot.snapshot_ts);
    const refreshStatus = state.is_stale
      ? await enqueueRefreshJob({
          symbol,
          jobType: 'option_chain_snapshot',
          requestParams: { reason: 'stale_chain_snapshot', snapshot_ts: snapshot.snapshot_ts },
        })
      : 'none';

    res.json(setCache(key, {
      symbol,
      snapshot_id: snapshot.id,
      source: snapshot.source,
      snapshot_ts: snapshot.snapshot_ts,
      provider_status: snapshot.provider_status,
      refresh_status: refreshStatus,
      ...state,
      underlying_price: snapshot.underlying_price,
      underlying_bid: snapshot.underlying_bid,
      underlying_ask: snapshot.underlying_ask,
      contract_count: snapshot.contract_count,
      completeness_pct: snapshot.completeness_pct,
      missing_greeks_ratio: snapshot.missing_greeks_ratio,
      missing_oi_ratio: snapshot.missing_oi_ratio,
      raw_metadata: snapshot.raw_metadata,
      ...(includeContracts ? { contracts } : {}),
    }, CHAIN_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) return res.json(missingSnapshot(symbol));
    console.error('GET /api/options/snapshot/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
}

async function sendGexSnapshot(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  const key = cacheKey('gex', { symbol });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const snapshot = await latestGexSnapshot(symbol);
    if (!snapshot) {
      const refreshStatus = await enqueueRefreshJob({
        symbol,
        jobType: 'option_chain_snapshot',
        requestParams: { reason: 'missing_gex_snapshot' },
      });
      return res.json({ ...missingSnapshot(symbol), refresh_status: refreshStatus });
    }

    const strikesResult = await pool.query(
      `SELECT strike, call_gex, put_gex, net_gex, call_oi, put_oi, call_volume, put_volume
       FROM gex_by_strike_snapshots
       WHERE snapshot_id = $1
       ORDER BY strike ASC`,
      [snapshot.snapshot_id]
    );

    const state = freshnessFor(snapshot.snapshot_ts);
    const refreshStatus = state.is_stale
      ? await enqueueRefreshJob({
          symbol,
          jobType: 'option_chain_snapshot',
          requestParams: { reason: 'stale_gex_snapshot', snapshot_ts: snapshot.snapshot_ts },
        })
      : 'none';

    res.json(setCache(key, {
      symbol,
      snapshot_id: snapshot.snapshot_id,
      source: snapshot.source,
      snapshot_ts: snapshot.snapshot_ts,
      provider_status: snapshot.provider_status,
      refresh_status: refreshStatus,
      ...state,
      underlying_price: snapshot.underlying_price,
      global_gex: snapshot.global_gex,
      local_gamma: snapshot.local_gamma,
      gamma_flip: snapshot.gamma_flip,
      gamma_regime: snapshot.gamma_regime,
      spot_vs_flip_distance_pct: snapshot.spot_vs_flip_distance_pct,
      call_wall: snapshot.call_wall,
      put_wall: snapshot.put_wall,
      wall_method: snapshot.wall_method,
      max_pain: snapshot.max_pain,
      pcr_oi: snapshot.pcr_oi,
      pcr_volume: snapshot.pcr_volume,
      confidence: snapshot.confidence,
      gamma_curve: snapshot.gamma_curve,
      strikes: strikesResult.rows,
      quality: {
        contract_count: snapshot.contract_count,
        completeness_pct: snapshot.completeness_pct,
        missing_greeks_ratio: snapshot.missing_greeks_ratio,
        missing_oi_ratio: snapshot.missing_oi_ratio,
      },
    }, GEX_CACHE_SECONDS));
  } catch (err) {
    if (isMissingTableError(err)) return res.json(missingSnapshot(symbol));
    console.error('GET /api/options/gex/:symbol error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol/snapshot', sendChainSnapshot);
router.get('/:symbol/chain', (req, res) => sendChainSnapshot(req, res, { includeContracts: true }));
router.get('/:symbol/gex', sendGexSnapshot);

module.exports = {
  router,
  sendChainSnapshot,
  sendGexSnapshot,
};
