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
const SCANNER_QUOTE_STALE_MINUTES = parseInt(process.env.SCANNER_QUOTE_STALE_MINUTES ?? 1440, 10);
const COMMUNITY_STALE_MINUTES = parseInt(process.env.COMMUNITY_STALE_MINUTES ?? 90, 10);
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

async function sendScan(req, res) {
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
  const dteMin = optionalInt(req.query.dteMin);
  const dteMax = optionalInt(req.query.dteMax);
  const deltaMin = optionalFloat(req.query.deltaMin);
  const deltaMax = optionalFloat(req.query.deltaMax);
  const maxSpreadPct = optionalFloat(req.query.maxSpreadPct);
  const minContractOi = optionalInt(req.query.minContractOi);
  const minContractVolume = optionalInt(req.query.minContractVolume);
  const marketCapMin = optionalFloat(req.query.marketCapMin);
  const marketCapMax = optionalFloat(req.query.marketCapMax);
  const priceMin = optionalFloat(req.query.priceMin);
  const priceMax = optionalFloat(req.query.priceMax);
  const minUnderlyingVolume = optionalInt(req.query.minUnderlyingVolume);
  const minDollarVolume = optionalFloat(req.query.minDollarVolume);
  const optionable = String(req.query.optionable ?? 'all').toLowerCase();
  const sector = String(req.query.sector ?? '').trim();
  const earningsMode = String(req.query.earningsMode ?? 'all').toLowerCase();
  const earningsDays = optionalInt(req.query.earningsDays ?? 14);
  const unusualOnly = String(req.query.unusualOnly ?? 'false').toLowerCase() === 'true';
  const sort = String(req.query.sort ?? 'ivr').toLowerCase();
  const scanKey = String(req.query.scanKey ?? DEFAULT_SCAN_KEY).trim() || DEFAULT_SCAN_KEY;

  const validRegimes = new Set(['all', 'positive', 'negative', 'neutral']);
  const validWalls = new Set(['all', 'call', 'put', 'either']);
  const validSorts = new Set(['ivr', 'combined']);
  const validOptionable = new Set(['all', 'true', 'false']);
  const validEarningsModes = new Set(['all', 'exclude', 'only']);

  if (
    isNaN(minIvr) || isNaN(maxIvr) || isNaN(minIvHv) || isNaN(limit)
    || Number.isNaN(nearWallPct) || Number.isNaN(minLocalGamma)
    || Number.isNaN(minTotalOi) || Number.isNaN(minTotalVolume)
    || Number.isNaN(minVolumeOiRatio)
    || Number.isNaN(minUnusualOi) || Number.isNaN(minOiDelta)
    || Number.isNaN(pcrMin) || Number.isNaN(pcrMax)
    || Number.isNaN(dteMin) || Number.isNaN(dteMax)
    || Number.isNaN(deltaMin) || Number.isNaN(deltaMax)
    || Number.isNaN(maxSpreadPct)
    || Number.isNaN(minContractOi) || Number.isNaN(minContractVolume)
    || Number.isNaN(marketCapMin) || Number.isNaN(marketCapMax)
    || Number.isNaN(priceMin) || Number.isNaN(priceMax)
    || Number.isNaN(minUnderlyingVolume) || Number.isNaN(minDollarVolume)
    || Number.isNaN(earningsDays)
    || !validRegimes.has(gammaRegime) || !validWalls.has(wall) || !validSorts.has(sort)
    || !validOptionable.has(optionable) || !validEarningsModes.has(earningsMode)
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
    dteMin,
    dteMax,
    deltaMin,
    deltaMax,
    maxSpreadPct,
    minContractOi,
    minContractVolume,
    marketCapMin,
    marketCapMax,
    priceMin,
    priceMax,
    minUnderlyingVolume,
    minDollarVolume,
    optionable,
    sector,
    earningsMode,
    earningsDays,
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
       ),
       latest_chain AS (
         SELECT DISTINCT ON (symbol)
           symbol, id AS snapshot_id
         FROM option_chain_snapshots
         ORDER BY symbol, snapshot_ts DESC
       ),
       latest_quote_chain AS (
         SELECT DISTINCT ON (s.symbol)
           s.symbol, s.id AS snapshot_id, s.source AS quote_source,
           s.snapshot_ts AS quote_snapshot_ts
         FROM option_chain_snapshots s
         WHERE EXISTS (
           SELECT 1
           FROM option_contract_snapshots quoted
           WHERE quoted.snapshot_id = s.id
             AND quoted.bid IS NOT NULL
             AND quoted.ask IS NOT NULL
             AND quoted.ask > 0
             AND quoted.ask >= quoted.bid
         )
         ORDER BY s.symbol, s.snapshot_ts DESC
       ),
       latest_community_batch AS (
         SELECT id, snapshot_ts, source, window_hours
         FROM community_trend_snapshots
         ORDER BY snapshot_ts DESC
         LIMIT 1
       ),
       latest_community AS (
         SELECT
           t.symbol, t.mention_count, t.weighted_score, t.total_upvotes, t.total_comments,
           b.snapshot_ts AS community_snapshot_ts, b.source AS community_source,
           b.window_hours AS community_window_hours
         FROM community_symbol_trends t
         JOIN latest_community_batch b ON b.id = t.snapshot_id
       ),
       contract_quality AS (
         SELECT
           c.symbol,
           COUNT(*)::int AS contract_count,
           COUNT(*) FILTER (WHERE c.delta IS NOT NULL AND c.gamma IS NOT NULL AND c.theta IS NOT NULL AND c.vega IS NOT NULL)::int AS greeks_contract_count,
           COUNT(*) FILTER (WHERE c.bid IS NOT NULL AND c.ask IS NOT NULL AND c.ask > 0)::int AS quoted_contract_count,
           MIN((c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date))::int AS min_dte,
           MAX((c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date))::int AS max_dte,
           MIN(ABS(c.delta)) AS min_abs_delta,
           MAX(ABS(c.delta)) AS max_abs_delta,
           AVG(((c.ask - c.bid) / NULLIF(((c.ask + c.bid) / 2.0), 0)) * 100)
             FILTER (WHERE c.bid IS NOT NULL AND c.ask IS NOT NULL AND c.ask > c.bid) AS avg_spread_pct
         FROM option_contract_snapshots c
         JOIN latest_quote_chain lc ON lc.symbol = c.symbol AND lc.snapshot_id = c.snapshot_id
         GROUP BY c.symbol
       ),
       contract_samples AS (
         SELECT
           c.symbol,
           jsonb_agg(
             jsonb_build_object(
               'expiry', c.expiry,
               'dte', (c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date)::int,
               'strike', c.strike,
               'right', c.option_right,
               'bid', c.bid,
               'ask', c.ask,
               'mark', c.mark,
               'volume', c.volume,
               'openInterest', c.open_interest,
               'delta', c.delta,
               'gamma', c.gamma,
               'contractSymbol', c.contract_symbol
             )
             ORDER BY c.expiry ASC, c.strike ASC, c.option_right ASC
           ) AS option_contracts
         FROM option_contract_snapshots c
         JOIN latest_quote_chain lc ON lc.symbol = c.symbol AND lc.snapshot_id = c.snapshot_id
         WHERE c.bid IS NOT NULL
           AND c.ask IS NOT NULL
         GROUP BY c.symbol
       )
       SELECT
         latest_rows.symbol,
         metric_date AS date,
         iv30, hv30, iv_rank, iv_percentile, iv_hv_diff, earnings_date, latest_rows.source AS source,
         atm_iv, atm_expiry, atm_strike, iv_source, hv_source,
         iv_rank_source, iv_rank_ready, iv_observation_count,
         price_close, price_date, price_source, price_status,
         underlying_volume, underlying_dollar_volume, universe_name,
         asset_type, sector, market_cap, optionable,
         gex_snapshot_ts, gex_source, gex_status, global_gex, local_gamma,
         gamma_flip, gamma_regime, call_wall, put_wall, max_pain,
         pcr_oi, pcr_volume, gex_confidence,
         total_oi, total_volume, volume_oi_ratio, max_strike_oi, max_strike_volume,
         call_wall_distance_pct, put_wall_distance_pct, signal_score,
         trend_score, trend_label, trend_signal, trend_change_5d,
         trend_rsi14, trend_ma20, trend_ma50, trend_ma200,
         unusual_oi_count, max_oi_delta, max_volume_oi_ratio, unusual_status,
         community_batch.snapshot_ts AS community_snapshot_ts,
         community_batch.source AS community_source,
         community_batch.window_hours AS community_window_hours,
         COALESCE(mention_count, 0) AS community_mention_count,
         COALESCE(weighted_score, 0) AS community_score,
         COALESCE(total_upvotes, 0) AS community_upvotes,
         COALESCE(total_comments, 0) AS community_comments,
         CASE
           WHEN community_batch.snapshot_ts IS NULL THEN 'missing'
           WHEN EXTRACT(EPOCH FROM (NOW() - community_batch.snapshot_ts)) / 60.0 > $38 THEN 'stale'
           ELSE 'fresh'
         END AS community_freshness,
         cq.contract_count, cq.greeks_contract_count, cq.quoted_contract_count,
         cq.min_dte, cq.max_dte, cq.min_abs_delta, cq.max_abs_delta, cq.avg_spread_pct,
         lqc.quote_source, lqc.quote_snapshot_ts,
         CASE
           WHEN lqc.quote_snapshot_ts IS NULL THEN 'missing'
           WHEN EXTRACT(EPOCH FROM (NOW() - lqc.quote_snapshot_ts)) / 60.0 > $27 THEN 'stale'
           ELSE 'fresh'
         END AS quote_freshness,
         COALESCE(cs.option_contracts, '[]'::jsonb) AS option_contracts,
         latest_rows.snapshot_ts AS snapshot_ts,
         CASE
           WHEN latest_rows.snapshot_ts IS NULL THEN 'missing'
           WHEN EXTRACT(EPOCH FROM (NOW() - latest_rows.snapshot_ts)) / 60.0 > $11 THEN 'stale'
           ELSE freshness
         END AS freshness,
         CASE
           WHEN latest_rows.snapshot_ts IS NULL THEN TRUE
           WHEN EXTRACT(EPOCH FROM (NOW() - latest_rows.snapshot_ts)) / 60.0 > $11 THEN TRUE
           ELSE is_stale
         END AS is_stale,
         refresh_status
       FROM latest_rows
       LEFT JOIN contract_quality cq ON cq.symbol = latest_rows.symbol
       LEFT JOIN contract_samples cs ON cs.symbol = latest_rows.symbol
       LEFT JOIN latest_quote_chain lqc ON lqc.symbol = latest_rows.symbol
       LEFT JOIN latest_community_batch community_batch ON TRUE
       LEFT JOIN latest_community community ON community.symbol = latest_rows.symbol
       WHERE iv_rank >= $2
         AND iv_rank <= $3
         AND COALESCE(iv_hv_diff, -999) >= $4
         AND ($28::numeric IS NULL OR market_cap >= $28)
         AND ($29::numeric IS NULL OR market_cap <= $29)
         AND ($30::numeric IS NULL OR price_close >= $30)
         AND ($31::numeric IS NULL OR price_close <= $31)
         AND ($32::bigint IS NULL OR underlying_volume >= $32)
         AND ($33::numeric IS NULL OR underlying_dollar_volume >= $33)
         AND ($34 = 'all' OR optionable = ($34 = 'true'))
         AND ($35 = '' OR sector = $35)
         AND (
           $36 = 'all'
           OR ($36 = 'exclude' AND (earnings_date IS NULL OR earnings_date > (NOW() AT TIME ZONE 'America/New_York')::date + $37::int))
           OR ($36 = 'only' AND earnings_date BETWEEN (NOW() AT TIME ZONE 'America/New_York')::date AND (NOW() AT TIME ZONE 'America/New_York')::date + $37::int)
         )
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
           ($20::int IS NULL AND $21::int IS NULL AND $22::numeric IS NULL AND $23::numeric IS NULL
             AND $24::numeric IS NULL AND $25::bigint IS NULL AND $26::bigint IS NULL)
           OR EXISTS (
             SELECT 1
             FROM latest_quote_chain lc
             JOIN option_contract_snapshots c ON c.snapshot_id = lc.snapshot_id AND c.symbol = lc.symbol
             WHERE lc.symbol = latest_rows.symbol
               AND ($20::int IS NULL OR (c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date) >= $20)
               AND ($21::int IS NULL OR (c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date) <= $21)
               AND ($22::numeric IS NULL OR ABS(c.delta) >= $22)
               AND ($23::numeric IS NULL OR ABS(c.delta) <= $23)
               AND (
                 $24::numeric IS NULL
                 OR (
                   c.bid IS NOT NULL AND c.ask IS NOT NULL AND c.ask > c.bid
                   AND ((c.ask - c.bid) / NULLIF(((c.ask + c.bid) / 2.0), 0)) * 100 <= $24
                 )
               )
               AND ($25::bigint IS NULL OR COALESCE(c.open_interest, 0) >= $25)
               AND ($26::bigint IS NULL OR COALESCE(c.volume, 0) >= $26)
           )
         )
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
        dteMin,
        dteMax,
        deltaMin,
        deltaMax,
        maxSpreadPct,
        minContractOi,
        minContractVolume,
        SCANNER_QUOTE_STALE_MINUTES,
        marketCapMin,
        marketCapMax,
        priceMin,
        priceMax,
        minUnderlyingVolume,
        minDollarVolume,
        optionable,
        sector,
        earningsMode,
        earningsDays,
        COMMUNITY_STALE_MINUTES,
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
}

router.get('/', sendScan);

module.exports = router;
module.exports.sendScan = sendScan;
