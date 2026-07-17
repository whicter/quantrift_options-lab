const express = require('express');
const pool = require('../db');
const { enqueueRefreshJob } = require('../lib/refreshJobs');
const { ACTIONABLE_STRATEGIES, buildActionableSetups } = require('../domain/scanner/candidateEngine.cjs');
const { toCandidateDto } = require('../domain/scanner/candidateDto.cjs');
const freshness = require('../domain/status/freshness');
const { buildAnalyzeSummary } = require('../domain/analyze/analyzeDto');
const { tokenMatches, requestToken } = require('../lib/adminAuth');

const router = express.Router();
const ON_DEMAND_ESTIMATED_WAIT = '约 1 分钟';
const GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

// Which enqueue decision, if any, governs each product's refresh state. The
// option-chain job is what backfills quotes, so option_chain reports it.
const PRODUCT_REFRESH_KEY = {
  [freshness.PRODUCT_PRICE_DAILY]: 'price',
  [freshness.PRODUCT_PRICE_30M]: 'price',
  [freshness.PRODUCT_METRICS]: 'metrics',
  [freshness.PRODUCT_OPTION_CHAIN]: 'options',
  [freshness.PRODUCT_GEX]: 'gex',
};

/**
 * Per-product state for one symbol.
 *
 * Existence alone cannot answer what a user needs to know: a symbol can hold a
 * two-week-old chain and a current price at the same time. Each product reports
 * its own freshness, age and refresh state so the UI can show real stale data
 * instead of collapsing the page into one status.
 */
function buildProductStates(coverage, refresh, now = new Date()) {
  const dailyDate = coverage.price_daily_date;
  const facts = {
    [freshness.PRODUCT_PRICE_DAILY]: { marketDate: dailyDate },
    [freshness.PRODUCT_PRICE_30M]: {
      marketDate: coverage.price_30m_date,
      snapshotTs: coverage.price_30m_ts,
      latestDailyMarketDate: dailyDate,
    },
    [freshness.PRODUCT_METRICS]: { marketDate: coverage.metrics_date },
    [freshness.PRODUCT_OPTION_CHAIN]: { snapshotTs: coverage.option_chain_ts },
    [freshness.PRODUCT_GEX]: { snapshotTs: coverage.gex_ts },
  };

  const products = {};
  for (const product of freshness.PRODUCTS) {
    const state = freshness.freshnessFor(product, facts[product], now);
    const refreshStatus = refresh[PRODUCT_REFRESH_KEY[product]] ?? null;
    products[product] = {
      state: freshness.resolveState(state.freshness, refreshStatus),
      freshness: state.freshness,
      is_stale: state.is_stale,
      age_minutes: state.age_minutes,
      age_days: state.age_days,
      refresh_status: refreshStatus,
    };
  }

  // An option chain without a single usable bid/ask cannot produce a strategy
  // leg, so quotes are their own product state rather than an attribute of the
  // chain. Reported alongside, never folded into option_chain's freshness.
  products.option_quotes = {
    state: coverage.has_quoted_options
      ? products[freshness.PRODUCT_OPTION_CHAIN].state
      : freshness.resolveState(freshness.STATE_MISSING, refresh.options ?? null),
    freshness: coverage.has_quoted_options
      ? products[freshness.PRODUCT_OPTION_CHAIN].freshness
      : freshness.STATE_MISSING,
    is_stale: coverage.has_quoted_options ? products[freshness.PRODUCT_OPTION_CHAIN].is_stale : false,
    age_minutes: coverage.has_quoted_options ? products[freshness.PRODUCT_OPTION_CHAIN].age_minutes : null,
    age_days: null,
    refresh_status: refresh.options ?? null,
  };

  return products;
}

async function sendAnalyzeStatus(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  try {
    await pool.query(
      `INSERT INTO symbol_universe (symbol, source, added_via)
       VALUES ($1, 'on_demand', 'analyze')
       ON CONFLICT (symbol) DO UPDATE SET active = TRUE, updated_at = NOW()`,
      [symbol]
    );
    const { rows } = await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM price_history WHERE symbol = $1) AS has_price,
         (
           EXISTS (SELECT 1 FROM iv_history WHERE symbol = $1)
           OR EXISTS (SELECT 1 FROM volatility_history WHERE symbol = $1 AND iv_rank_ready = TRUE)
         ) AS has_metrics,
         EXISTS (SELECT 1 FROM volatility_history WHERE symbol = $1 AND iv_rank_ready = TRUE) AS has_derived_metrics,
         EXISTS (SELECT 1 FROM option_chain_snapshots WHERE symbol = $1 AND contract_count > 0) AS has_options,
         EXISTS (
           SELECT 1
           FROM option_chain_snapshots s
           WHERE s.symbol = $1
             AND EXISTS (
               SELECT 1 FROM option_contract_snapshots c
               WHERE c.snapshot_id = s.id
                 AND c.bid IS NOT NULL AND c.ask IS NOT NULL
                 AND c.ask > 0 AND c.ask >= c.bid
             )
         ) AS has_quoted_options,
         EXISTS (
           SELECT 1 FROM gex_snapshots
           WHERE symbol = $1
             AND raw_metrics->>'model_version' = $2
         ) AS has_gex,
         (SELECT COUNT(*)::int FROM provider_fetch_jobs WHERE symbol = $1 AND status IN ('queued', 'running')) AS active_jobs,
         (SELECT COUNT(*)::int FROM provider_fetch_jobs WHERE status IN ('queued', 'running')) AS queue_depth,
         EXISTS (
           SELECT 1 FROM provider_fetch_jobs
           WHERE symbol = $1 AND job_type = 'symbol_metrics_snapshot' AND status = 'failed'
             AND finished_at >= NOW() - INTERVAL '24 hours'
         ) AS metrics_blocked,
         (SELECT last_error FROM provider_fetch_jobs
          WHERE symbol = $1 AND job_type = 'symbol_metrics_snapshot' AND status = 'failed'
          ORDER BY finished_at DESC LIMIT 1) AS metrics_last_error,
         EXISTS (
           SELECT 1 FROM provider_fetch_jobs
           WHERE symbol = $1
             AND job_type = 'option_chain_snapshot'
             AND status = 'failed'
             AND request_params->>'require_quotes' = 'true'
             AND last_error LIKE 'option quote unavailable:%'
             AND finished_at >= NOW() - INTERVAL '24 hours'
         ) AS quotes_blocked,
         (SELECT last_error FROM provider_fetch_jobs
          WHERE symbol = $1
            AND job_type = 'option_chain_snapshot'
            AND status = 'failed'
            AND request_params->>'require_quotes' = 'true'
            AND last_error LIKE 'option quote unavailable:%'
          ORDER BY finished_at DESC LIMIT 1) AS quotes_last_error,
         -- Per-product timing. Freshness is derived from these against the
         -- shared policy; existence alone cannot distinguish fresh from stale.
         (SELECT MAX(date) FROM price_history WHERE symbol = $1) AS price_daily_date,
         (SELECT MAX((bar_ts AT TIME ZONE 'America/New_York')::date)
            FROM price_history_30m WHERE symbol = $1) AS price_30m_date,
         (SELECT MAX(bar_ts) FROM price_history_30m WHERE symbol = $1) AS price_30m_ts,
         GREATEST(
           (SELECT MAX(date) FROM iv_history WHERE symbol = $1),
           (SELECT MAX(metric_date) FROM volatility_history WHERE symbol = $1)
         ) AS metrics_date,
         (SELECT MAX(snapshot_ts) FROM option_chain_snapshots
           WHERE symbol = $1 AND contract_count > 0) AS option_chain_ts,
         (SELECT MAX(snapshot_ts) FROM gex_snapshots
           WHERE symbol = $1 AND raw_metrics->>'model_version' = $2) AS gex_ts`,
      [symbol, GEX_MODEL_VERSION]
    );
    const coverage = rows[0];
    const refresh = {};
    if (!coverage.has_price) {
      refresh.price = await enqueueRefreshJob({
        symbol, jobType: 'price_history_snapshot', provider: 'polygon_licensed',
        requestParams: { reason: 'analyze_on_demand', priority: 100 }, minIntervalSeconds: 300,
      });
    }
    if (!coverage.has_metrics) {
      if (coverage.metrics_blocked) refresh.metrics = 'blocked';
      else {
        refresh.metrics = await enqueueRefreshJob({
          symbol, jobType: 'symbol_metrics_snapshot', provider: 'tastytrade',
          requestParams: { reason: 'analyze_on_demand', priority: 100 }, minIntervalSeconds: 86400,
        });
      }
    }
    if (!coverage.has_options || !coverage.has_quoted_options) {
      if (coverage.quotes_blocked) refresh.options = 'blocked';
      else {
        refresh.options = await enqueueRefreshJob({
          symbol, jobType: 'option_chain_snapshot', provider: 'polygon_licensed',
          requestParams: {
            reason: coverage.has_options ? 'analyze_on_demand_missing_option_quotes' : 'analyze_on_demand',
            priority: 100,
            require_quotes: true,
          }, minIntervalSeconds: 60,
        });
      }
    } else if (!coverage.has_gex) {
      refresh.gex = await enqueueRefreshJob({
        symbol, jobType: 'gex_recompute', provider: 'internal',
        requestParams: { reason: 'analyze_on_demand_model_repair', priority: 100 }, minIntervalSeconds: 60,
      });
    }
    const readyCount = [coverage.has_price, coverage.has_metrics, coverage.has_options, coverage.has_quoted_options, coverage.has_gex].filter(Boolean).length;
    const queued = Object.values(refresh).some(value => value === 'queued') || coverage.active_jobs > 0;
    const products = buildProductStates(coverage, refresh);
    return res.json({
      symbol,
      status: readyCount === 5 ? 'ready' : queued ? 'queued' : readyCount ? 'partial' : 'missing',
      coverage: {
        price: coverage.has_price,
        metrics: coverage.has_metrics,
        metrics_source: coverage.has_derived_metrics ? 'derived' : coverage.has_metrics ? 'provider' : null,
        options: coverage.has_options,
        option_quotes: coverage.has_quoted_options,
        gex: coverage.has_gex,
      },
      products,
      refresh,
      queue_depth: coverage.queue_depth,
      estimated_wait: queued ? ON_DEMAND_ESTIMATED_WAIT : null,
      blockers: [
        ...(coverage.metrics_blocked ? [{ field: 'metrics', reason: coverage.metrics_last_error }] : []),
        ...(coverage.quotes_blocked ? [{ field: 'option_quotes', reason: coverage.quotes_last_error }] : []),
      ],
    });
  } catch (err) {
    if (err?.code === '42P01') return res.status(503).json({ error: 'universe migration required' });
    console.error('GET /api/analyze/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function sendAnalyzeCandidate(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const { rows: snapshots } = await pool.query(
      `WITH latest_quote_chain AS (
         SELECT s.id AS snapshot_id, s.snapshot_ts
         FROM option_chain_snapshots s
         WHERE s.symbol = $1
           AND EXISTS (
             SELECT 1 FROM option_contract_snapshots c
             WHERE c.snapshot_id = s.id
               AND c.bid IS NOT NULL AND c.ask IS NOT NULL
               AND c.ask > 0 AND c.ask >= c.bid
           )
         ORDER BY s.snapshot_ts DESC
         LIMIT 1
       ),
       latest_price AS (
         SELECT close AS price_close
         FROM price_history
         WHERE symbol = $1
         ORDER BY date DESC
         LIMIT 1
       ),
       latest_gex AS (
         SELECT call_wall, put_wall
         FROM gex_snapshots
         WHERE symbol = $1
           AND raw_metrics->>'model_version' = $2
         ORDER BY snapshot_ts DESC
         LIMIT 1
       )
       SELECT lqc.snapshot_id, lqc.snapshot_ts, lp.price_close,
              g.call_wall, g.put_wall
       FROM latest_quote_chain lqc
       LEFT JOIN latest_price lp ON TRUE
       LEFT JOIN latest_gex g ON TRUE`,
      [symbol, GEX_MODEL_VERSION]
    );
    const snapshot = snapshots[0];
    if (!snapshot?.snapshot_id) {
      return res.json({ symbol, status: 'missing', reason: '没有已采集且 bid/ask 完整的期权报价快照', candidate: null });
    }
    if (Number(snapshot.price_close) <= 0) {
      return res.json({ symbol, status: 'missing', reason: '缺少标的现价，无法生成策略腿', candidate: null });
    }

    const { rows: contracts } = await pool.query(
      `SELECT expiry, (expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date)::int AS dte,
              strike, option_right AS right, bid, ask, volume,
              open_interest AS "openInterest", delta, gamma, iv,
              contract_symbol AS "contractSymbol"
       FROM option_contract_snapshots
       WHERE snapshot_id = $1
         AND bid IS NOT NULL AND ask IS NOT NULL
         AND ask > 0 AND ask >= bid
       ORDER BY expiry ASC, strike ASC, option_right ASC`,
      [snapshot.snapshot_id]
    );
    const candidate = buildActionableSetups(contracts, snapshot, {}, ACTIONABLE_STRATEGIES)[0] || null;
    if (!candidate) {
      return res.json({
        symbol,
        status: 'missing',
        reason: '已采集报价中没有同时满足 DTE、Delta、bid/ask spread 和 OI 门槛的完整策略腿',
        candidate: null,
      });
    }
    return res.json({
      symbol,
      status: 'ready',
      candidate: toCandidateDto(candidate, { inputSnapshotTs: snapshot.snapshot_ts }),
    });
  } catch (err) {
    if (err?.code === '42P01') return res.status(503).json({ error: 'options data migration required' });
    console.error('GET /api/analyze/:symbol/candidate error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

/**
 * GET /api/analyze/:symbol/summary
 *
 * The positioning conclusion, scenarios and data label, assembled server-side.
 * These were computed in the browser (analyzeData.js); a product conclusion
 * belongs behind the API. Normal users get a user-facing data label with no
 * provider names; an admin token adds raw provenance.
 */
async function sendAnalyzeSummary(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  const admin = isAdminRequest(req);
  try {
    const { rows } = await pool.query(
      `SELECT g.*, c.underlying_price
       FROM gex_snapshots g
       JOIN option_chain_snapshots c ON c.id = g.snapshot_id
       WHERE g.symbol = $1 AND g.raw_metrics->>'model_version' = $2
       ORDER BY g.snapshot_ts DESC
       LIMIT 1`,
      [symbol, GEX_MODEL_VERSION]
    );
    const snapshot = rows[0];
    if (!snapshot) {
      return res.json(buildAnalyzeSummary(symbol, { freshness: 'missing' }, { admin }));
    }

    const { rows: strikes } = await pool.query(
      `SELECT strike, call_gex, put_gex, net_gex, call_oi, put_oi, call_volume, put_volume
       FROM gex_by_strike_snapshots WHERE snapshot_id = $1 ORDER BY strike ASC`,
      [snapshot.snapshot_id]
    );

    // Freshness from the single E5 contract, so the summary agrees with every
    // other endpoint's notion of stale.
    const state = freshness.freshnessFor(freshness.PRODUCT_GEX, { snapshotTs: snapshot.snapshot_ts });
    const gex = {
      freshness: state.freshness,
      is_stale: state.is_stale,
      age_minutes: state.age_minutes,
      source: snapshot.source,
      provider_status: snapshot.provider_status,
      snapshot_ts: snapshot.snapshot_ts,
      confidence: snapshot.confidence,
      underlying_price: snapshot.underlying_price,
      global_gex: snapshot.global_gex,
      local_gamma: snapshot.local_gamma,
      gamma_flip: snapshot.gamma_flip,
      gamma_regime: snapshot.gamma_regime,
      call_wall: snapshot.call_wall,
      put_wall: snapshot.put_wall,
      max_pain: snapshot.max_pain,
      pcr_oi: snapshot.pcr_oi,
      pcr_volume: snapshot.pcr_volume,
      raw_metrics: snapshot.raw_metrics,
      strikes,
    };
    return res.json(buildAnalyzeSummary(symbol, gex, { admin, price: snapshot.underlying_price }));
  } catch (err) {
    if (err?.code === '42P01') return res.status(503).json({ error: 'options data migration required' });
    console.error('GET /api/analyze/:symbol/summary error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

function isAdminRequest(req) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  return Boolean(expected) && tokenMatches(requestToken(req), expected);
}

router.get('/:symbol/candidate', sendAnalyzeCandidate);
router.get('/:symbol/summary', sendAnalyzeSummary);
router.get('/:symbol', sendAnalyzeStatus);

module.exports = router;
module.exports.sendAnalyzeStatus = sendAnalyzeStatus;
module.exports.sendAnalyzeCandidate = sendAnalyzeCandidate;
module.exports.sendAnalyzeSummary = sendAnalyzeSummary;
