const express = require('express');
const pool = require('../db');
const { enqueueRefreshJob } = require('../lib/refreshJobs');
const { ACTIONABLE_STRATEGIES, buildActionableSetups } = require('../domain/scanner/candidateEngine.cjs');
const { environmentEdge } = require('../domain/scanner/environmentEdge.cjs');
const { pullbackStructure } = require('../domain/scanner/pullbackStructure.cjs');
const {
  toPublicAnalyzeCandidate,
  toPublicEnvironment,
  toPublicStructure,
} = require('../domain/analyze/publicCandidateDto.cjs');
const { classifyState } = require('../domain/market/stateMatrix');
const freshness = require('../domain/status/freshness');
const { buildAnalyzeSummary } = require('../domain/analyze/analyzeDto');
const { tokenMatches, requestToken } = require('../lib/adminAuth');
const { deriveSupportResistance, deriveFocusScore, deriveMfi } = require('./supportResistance');
const { deriveVolumeProfile } = require('./volumeProfile');
const { buildConfluence } = require('../domain/confluence/engine');
const { normalizeSymbol, isValidSymbol } = require('../lib/symbols');
const { executableQuotePredicate } = require('../repositories/optionChainSql');

const router = express.Router();
const ON_DEMAND_ESTIMATED_WAIT = '约 1 分钟';
const GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';

function unavailableCandidateResponse(symbol) {
  return {
    symbol,
    status: 'missing',
    candidate: null,
    buyer: null,
    seller: null,
    environment: null,
    structure: null,
  };
}

/**
 * Classify the trend regime from recent daily closes: 10-bar vs 30-bar SMA.
 * A ±1% band around parity is treated as neutral so noise does not flip the
 * regime. Returns 'bull' | 'bear' | 'neutral' | null (null when too few bars).
 * This is a directional-weighting proxy for candidate ordering, not the exact
 * frontend Kalman trend, and it never blocks a candidate.
 */
async function deriveTrendRegime(symbol) {
  try {
    const { rows } = await pool.query(
      `SELECT close FROM price_history WHERE symbol = $1 ORDER BY date DESC LIMIT 30`,
      [symbol]
    );
    const closes = rows.map(r => Number(r.close)).filter(Number.isFinite);
    if (closes.length < 12) return null;
    const sma = n => {
      const slice = closes.slice(0, Math.min(n, closes.length));
      return slice.reduce((sum, v) => sum + v, 0) / slice.length;
    };
    const fast = sma(10);
    const slow = sma(30);
    if (slow <= 0) return null;
    const spreadPct = (fast - slow) / slow;
    if (spreadPct > 0.01) return 'bull';
    if (spreadPct < -0.01) return 'bear';
    return 'neutral';
  } catch {
    return null; // never let a weighting input break candidate generation
  }
}

/**
 * Assemble the inputs pullbackStructure needs and run it.
 *
 * Reuses the already-validated derivations rather than recomputing: the market
 * state from classifyState (S2 is "uptrend, pulling back"), the pivot-clustered
 * supports and MFI from the S/R route, and RSI from its focus score. Nothing
 * here invents a level -- if a derivation is unavailable the corresponding
 * confirmation is simply absent, which lowers the structure to `weak` rather
 * than producing a claim with no evidence behind it.
 */
async function derivePullbackStructure(symbol, snapshot) {
  const { rows } = await pool.query(
    `SELECT date, high, low, close, volume FROM price_history
     WHERE symbol = $1 AND close IS NOT NULL
     ORDER BY date DESC LIMIT 200`,
    [symbol]
  );
  if (rows.length < 200) {
    // Distinct from "absent": we cannot judge the structure, which is not the
    // same as having judged it and found none. A newly listed symbol lands here
    // legitimately and must not be reported as "no pullback".
    return {
      status: 'unavailable',
      reason: `历史日线不足 200 根（当前 ${rows.length} 根），无法判断趋势结构。`,
      confirmations: [],
    };
  }
  const bars = rows.slice().reverse();
  const closes = bars.map(bar => Number(bar.close)).filter(Number.isFinite);
  const sr = deriveSupportResistance(bars);
  const focus = deriveFocusScore(sr.bars);
  const mfi = deriveMfi(bars);

  const avg = (arr, n) => arr.slice(-n).reduce((sum, v) => sum + v, 0) / Math.min(n, arr.length);
  const close = closes[closes.length - 1];
  const ret5 = closes.length >= 6 ? ((close / closes[closes.length - 6]) - 1) * 100 : null;
  const { state } = classifyState({
    close,
    ma50: avg(closes, 50),
    ma200: avg(closes, 200),
    ret5,
    ivRank: snapshot.iv_rank == null ? null : Number(snapshot.iv_rank),
    rvol: focus.components?.rvol ?? null,
    hi20: null,
    ret20: null,
    ext50: null,
  });

  return pullbackStructure({
    state,
    symbol,
    spot: Number(snapshot.price_close),
    support: sr.supports?.[0]?.price ?? null,
    putWall: snapshot.put_wall == null ? null : Number(snapshot.put_wall),
    rsi14: focus.components?.rsi14 ?? null,
    mfi14: mfi?.value ?? null,
    ivRank: snapshot.iv_rank == null ? null : Number(snapshot.iv_rank),
  });
}

// Which enqueue decision, if any, governs each positioning product's refresh
// state. Strategy quotes are a separate IB-only product below.
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
  const quoteRefreshStatus = refresh.option_quotes
    ?? (!coverage.has_options ? refresh.options ?? null : null);
  products.option_quotes = {
    state: coverage.has_quoted_options
      ? products[freshness.PRODUCT_OPTION_CHAIN].state
      : freshness.resolveState(freshness.STATE_MISSING, quoteRefreshStatus),
    freshness: coverage.has_quoted_options
      ? products[freshness.PRODUCT_OPTION_CHAIN].freshness
      : freshness.STATE_MISSING,
    is_stale: coverage.has_quoted_options ? products[freshness.PRODUCT_OPTION_CHAIN].is_stale : false,
    age_minutes: coverage.has_quoted_options ? products[freshness.PRODUCT_OPTION_CHAIN].age_minutes : null,
    age_days: null,
    refresh_status: quoteRefreshStatus,
  };

  return products;
}

async function sendAnalyzeStatus(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol, { maxLength: 10, requireLeadingLetter: true })) return res.status(400).json({ error: 'invalid symbol' });

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
             AND job_type = 'option_quote_snapshot'
             AND status = 'failed'
             AND request_params->>'require_quotes' = 'true'
             AND last_error LIKE 'option quote unavailable:%'
             AND finished_at >= NOW() - INTERVAL '24 hours'
         ) AS quotes_blocked,
         (SELECT last_error FROM provider_fetch_jobs
          WHERE symbol = $1
            AND job_type = 'option_quote_snapshot'
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
    if (!coverage.has_options) {
      refresh.options = await enqueueRefreshJob({
        symbol, jobType: 'option_chain_snapshot', provider: 'polygon_licensed',
        requestParams: {
          reason: 'analyze_on_demand',
          priority: 100,
          // The Polygon/GEX task succeeds first. If that snapshot has no
          // executable quotes, the primary worker only queues the independent
          // IB quote lane; it never waits for IB itself.
          enqueue_quote_if_missing: true,
        }, minIntervalSeconds: 60,
      });
    } else if (!coverage.has_quoted_options) {
      if (coverage.quotes_blocked) refresh.option_quotes = 'blocked';
      else {
        refresh.option_quotes = await enqueueRefreshJob({
          symbol, jobType: 'option_quote_snapshot', provider: 'ib_internal',
          requestParams: {
            reason: 'analyze_on_demand_missing_option_quotes',
            priority: 90,
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
        ...(coverage.has_options && coverage.quotes_blocked
          ? [{ field: 'option_quotes', reason: coverage.quotes_last_error }]
          : []),
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
  if (!isValidSymbol(symbol, { maxLength: 10, requireLeadingLetter: true })) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const { rows: snapshots } = await pool.query(
      `WITH latest_quote_chain AS (
         SELECT s.id AS snapshot_id, s.snapshot_ts
         FROM option_chain_snapshots s
         WHERE s.symbol = $1
           AND EXISTS (
             SELECT 1 FROM option_contract_snapshots c
             WHERE c.snapshot_id = s.id
               AND ${executableQuotePredicate('c')}
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
         SELECT call_wall, put_wall, gamma_regime
         FROM gex_snapshots
         WHERE symbol = $1
           AND raw_metrics->>'model_version' = $2
         ORDER BY snapshot_ts DESC
         LIMIT 1
       ),
       latest_ivr AS (
         SELECT iv_rank
         FROM volatility_history
         WHERE symbol = $1 AND iv_rank_ready = TRUE AND iv_rank IS NOT NULL
         ORDER BY metric_date DESC
         LIMIT 1
       )
       SELECT lqc.snapshot_id, lqc.snapshot_ts, lp.price_close,
              g.call_wall, g.put_wall, g.gamma_regime, ivr.iv_rank
       FROM latest_quote_chain lqc
       LEFT JOIN latest_price lp ON TRUE
       LEFT JOIN latest_gex g ON TRUE
       LEFT JOIN latest_ivr ivr ON TRUE`,
      [symbol, GEX_MODEL_VERSION]
    );
    const snapshot = snapshots[0];
    if (!snapshot?.snapshot_id) {
      return res.json(unavailableCandidateResponse(symbol));
    }
    if (Number(snapshot.price_close) <= 0) {
      return res.json(unavailableCandidateResponse(symbol));
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
    // Market environment for directional weighting: trend regime (from a short
    // vs long SMA of recent closes), the GEX gamma regime and the derived IV
    // rank. Used only to reorder candidates, so a partial environment (any field
    // null) simply softens the weighting; it never blocks a candidate.
    const trendRegime = await deriveTrendRegime(symbol);
    const environment = {
      trendRegime,
      gammaRegime: snapshot.gamma_regime || null,
      ivRank: snapshot.iv_rank == null ? null : Number(snapshot.iv_rank),
    };
    // Whether a measurable pullback-to-support structure currently holds. This
    // is what gives a directional pick a stated basis: without one the engine
    // will happily rank a Long Call top on liquidity alone in a trendless
    // market, then flip to a Long Put when quotes move (live SPY, 2026-07-30).
    // Best-effort -- a failure here must never block the candidate itself.
    const pullback = await derivePullbackStructure(symbol, snapshot).catch(() => null);
    const ranked = buildActionableSetups(contracts, snapshot, {}, ACTIONABLE_STRATEGIES, environment);
    const candidate = ranked[0] || null;
    if (!candidate) {
      return res.json(unavailableCandidateResponse(symbol));
    }
    // Buyer and seller are returned as a pair because their risk shapes are not
    // comparable on one number. A long option's POP is measured at strike +
    // premium and so is structurally sub-50%, which makes any buyer look bad
    // beside a credit spread unless its payoff is shown too. `ranked` is already
    // ordered, so taking the first of each side preserves the engine's judgement
    // and only chooses which two to surface.
    // Both sides must be *evaluable*, not merely present. A Diagonal Spread is
    // a debit trade and so matches "buyer", but being multi-expiry it has
    // neither a static-expiry POP nor a single-leg reference payoff -- picking
    // it renders a card of two dashes, which is the exact failure this pairing
    // exists to prevent (observed live on AAPL, 2026-07-30).
    const evaluable = item => item.pop?.status === 'available' && item.payoff?.status === 'available';
    const buyer = ranked.find(item => item.debit != null && evaluable(item)) || null;
    const seller = ranked.find(item => item.credit != null && evaluable(item)) || null;
    const edge = environmentEdge(environment);
    // The full edge and pullback objects stay in this server process for
    // ranking, tests and internal documentation. Only allowlisted display
    // fields cross the normal Analyze API boundary.
    return res.json({
      symbol,
      status: 'ready',
      environment: toPublicEnvironment(edge),
      structure: toPublicStructure(pullback),
      candidate: toPublicAnalyzeCandidate(candidate),
      // Either side may legitimately be null (no qualifying legs); the UI says
      // so rather than padding the card with a weaker structure.
      buyer: toPublicAnalyzeCandidate(buyer),
      seller: toPublicAnalyzeCandidate(seller),
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
  if (!isValidSymbol(symbol, { maxLength: 10, requireLeadingLetter: true })) return res.status(400).json({ error: 'invalid symbol' });

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

/**
 * GET /api/analyze/:symbol/confluence
 *
 * A read-only, deterministic aggregation of daily price structure and the
 * latest usable positioning snapshot. The score is a documented cold-start
 * prior, never a forecast or an assertion of dealer positioning.
 */
async function sendConfluence(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!isValidSymbol(symbol, { maxLength: 10, requireLeadingLetter: true })) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const [dailyResult, gexResult] = await Promise.all([
      pool.query(`SELECT date, high, low, close, volume
        FROM (
          SELECT date, high, low, close, volume
          FROM price_history
          WHERE symbol = $1
          ORDER BY date DESC
          LIMIT 250
        ) recent
        ORDER BY date ASC`, [symbol]),
      pool.query(`SELECT g.call_wall, g.put_wall, g.gamma_flip, c.underlying_price
        FROM gex_snapshots g
        JOIN option_chain_snapshots c ON c.id = g.snapshot_id
        WHERE g.symbol = $1 AND g.raw_metrics->>'model_version' = $2
        ORDER BY g.snapshot_ts DESC
        LIMIT 1`, [symbol, GEX_MODEL_VERSION]),
    ]);
    const bars = dailyResult.rows;
    const structure = deriveSupportResistance(bars);
    const profile = deriveVolumeProfile(bars, 40);
    const snapshot = gexResult.rows[0];
    const gex = snapshot ? {
      spot: Number(snapshot.underlying_price), call_wall: Number(snapshot.call_wall),
      put_wall: Number(snapshot.put_wall), gamma_flip: Number(snapshot.gamma_flip),
    } : null;
    const confluence = buildConfluence({ bars, volumeProfile: profile, structure, gex });
    return res.json({ symbol, ...confluence });
  } catch (err) {
    console.error('GET /api/analyze/:symbol/confluence error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

function isAdminRequest(req) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  return Boolean(expected) && tokenMatches(requestToken(req), expected);
}

router.get('/:symbol/candidate', sendAnalyzeCandidate);
router.get('/:symbol/summary', sendAnalyzeSummary);
router.get('/:symbol/confluence', sendConfluence);
router.get('/:symbol', sendAnalyzeStatus);

module.exports = router;
module.exports.sendAnalyzeStatus = sendAnalyzeStatus;
module.exports.sendAnalyzeCandidate = sendAnalyzeCandidate;
module.exports.sendAnalyzeSummary = sendAnalyzeSummary;
module.exports.sendConfluence = sendConfluence;
