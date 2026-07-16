const express = require('express');
const pool = require('../db');
const { enqueueRefreshJob } = require('../lib/refreshJobs');

const router = express.Router();

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
         EXISTS (SELECT 1 FROM iv_history WHERE symbol = $1) AS has_metrics,
         EXISTS (SELECT 1 FROM option_chain_snapshots WHERE symbol = $1 AND contract_count > 0) AS has_options,
         EXISTS (SELECT 1 FROM gex_snapshots WHERE symbol = $1) AS has_gex,
         (SELECT COUNT(*)::int FROM provider_fetch_jobs WHERE symbol = $1 AND status IN ('queued', 'running')) AS active_jobs,
         (SELECT COUNT(*)::int FROM provider_fetch_jobs WHERE status IN ('queued', 'running')) AS queue_depth,
         EXISTS (
           SELECT 1 FROM provider_fetch_jobs
           WHERE symbol = $1 AND job_type = 'symbol_metrics_snapshot' AND status = 'failed'
             AND finished_at >= NOW() - INTERVAL '24 hours'
         ) AS metrics_blocked,
         (SELECT last_error FROM provider_fetch_jobs
          WHERE symbol = $1 AND job_type = 'symbol_metrics_snapshot' AND status = 'failed'
          ORDER BY finished_at DESC LIMIT 1) AS metrics_last_error`,
      [symbol]
    );
    const coverage = rows[0];
    const refresh = {};
    if (!coverage.has_price) {
      refresh.price = await enqueueRefreshJob({
        symbol, jobType: 'price_history_snapshot', provider: 'polygon_licensed',
        requestParams: { reason: 'analyze_on_demand' }, minIntervalSeconds: 300,
      });
    }
    if (!coverage.has_metrics) {
      if (coverage.metrics_blocked) refresh.metrics = 'blocked';
      else {
        refresh.metrics = await enqueueRefreshJob({
          symbol, jobType: 'symbol_metrics_snapshot', provider: 'tastytrade',
          requestParams: { reason: 'analyze_on_demand' }, minIntervalSeconds: 86400,
        });
      }
    }
    if (!coverage.has_options || !coverage.has_gex) {
      refresh.options = await enqueueRefreshJob({
        symbol, jobType: 'option_chain_snapshot', provider: 'polygon_licensed',
        requestParams: { reason: 'analyze_on_demand' }, minIntervalSeconds: 300,
      });
    }
    const readyCount = [coverage.has_price, coverage.has_metrics, coverage.has_options, coverage.has_gex].filter(Boolean).length;
    const queued = Object.values(refresh).some(value => value === 'queued') || coverage.active_jobs > 0;
    return res.json({
      symbol,
      status: readyCount === 4 ? 'ready' : queued ? 'queued' : readyCount ? 'partial' : 'missing',
      coverage: {
        price: coverage.has_price,
        metrics: coverage.has_metrics,
        options: coverage.has_options,
        gex: coverage.has_gex,
      },
      refresh,
      queue_depth: coverage.queue_depth,
      estimated_wait: queued ? '~5-10min' : null,
      blockers: coverage.metrics_blocked ? [{ field: 'metrics', reason: coverage.metrics_last_error }] : [],
    });
  } catch (err) {
    if (err?.code === '42P01') return res.status(503).json({ error: 'universe migration required' });
    console.error('GET /api/analyze/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendAnalyzeStatus);

module.exports = router;
module.exports.sendAnalyzeStatus = sendAnalyzeStatus;
