const express = require('express');
const pool = require('../db');
const { enqueueRefreshJob } = require('../lib/refreshJobs');
const { ACTIONABLE_STRATEGIES, buildActionableSetups } = require('../domain/scanner/candidateEngine.cjs');
const { toCandidateDto } = require('../domain/scanner/candidateDto.cjs');

const router = express.Router();
const ON_DEMAND_ESTIMATED_WAIT = '约 1 分钟';
const GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy';

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
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
             AND finished_at >= NOW() - INTERVAL '24 hours'
         ) AS quotes_blocked,
         (SELECT last_error FROM provider_fetch_jobs
          WHERE symbol = $1
            AND job_type = 'option_chain_snapshot'
            AND status = 'failed'
            AND request_params->>'require_quotes' = 'true'
          ORDER BY finished_at DESC LIMIT 1) AS quotes_last_error`,
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

router.get('/:symbol/candidate', sendAnalyzeCandidate);
router.get('/:symbol', sendAnalyzeStatus);

module.exports = router;
module.exports.sendAnalyzeStatus = sendAnalyzeStatus;
module.exports.sendAnalyzeCandidate = sendAnalyzeCandidate;
