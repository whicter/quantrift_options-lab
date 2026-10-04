const pool = require('../db');
const { normalizeSymbol, isValidSymbol } = require('./symbols');
const { isRegularMarketSession } = require('./marketTime');

const DEFAULT_OPTIONS_REFRESH_PROVIDER = process.env.OPTIONS_REFRESH_PROVIDER || 'polygon_licensed';
const SUPPORTED_OPTIONS_REFRESH_PROVIDERS = new Set(['ib_internal', 'tt_internal', 'polygon_licensed']);

function isMissingTableError(err) {
  return err?.code === '42P01';
}

const SCAN_LEVEL_JOB_TYPES = new Set(['scanner_materialize', 'scanner_candidate_materialize']);

function normalizeRefreshSymbol(symbol, jobType) {
  const normalized = normalizeSymbol(symbol);
  if (SCAN_LEVEL_JOB_TYPES.has(jobType) && normalized === '__SCAN__') return normalized;
  return isValidSymbol(normalized, { maxLength: 10, requireLeadingLetter: true }) ? normalized : null;
}

/**
 * Enqueue a provider refresh, optionally only while the market is open.
 *
 * `onlyDuringMarketHours` exists for the STALE paths. Option-chain freshness is
 * clock-based, so a Friday snapshot is stale all weekend and stays stale no
 * matter how often it is refetched -- the underlying has not traded. Every
 * out-of-hours page view was therefore queueing a fetch that could only return
 * what we already had. The background scheduler has always known this
 * (`refresh_window()` goes idle when the market is shut) and
 * `analyze.js` already defers quotes the same way; only these on-demand chain
 * paths disagreed.
 *
 * Reporting is unaffected on purpose: a two-day-old chain IS stale and must keep
 * saying so. What changes is only whether we do pointless work about it. The
 * MISSING paths are deliberately not gated -- a symbol with no chain at all
 * still benefits from fetching its last known state outside hours.
 */
async function enqueueRefreshJob({
  symbol,
  jobType,
  provider = DEFAULT_OPTIONS_REFRESH_PROVIDER,
  requestParams = {},
  minIntervalSeconds = parseInt(process.env.REFRESH_MIN_INTERVAL_SECONDS ?? 60, 10),
  onlyDuringMarketHours = false,
  now = undefined,
}) {
  const normalizedSymbol = normalizeRefreshSymbol(symbol, jobType);
  if (!normalizedSymbol || !jobType) return 'none';
  if (onlyDuringMarketHours && !isRegularMarketSession(now)) return 'deferred_market_closed';

  try {
    const { rows } = await pool.query(
      `WITH recent AS (
         SELECT id
         FROM provider_fetch_jobs
         WHERE symbol = $1
           AND job_type = $2
           AND provider = $3
           AND (
             status IN ('queued', 'running')
             OR created_at >= NOW() - ($5::int * INTERVAL '1 second')
           )
         ORDER BY created_at DESC
         LIMIT 1
       ),
       inserted AS (
         INSERT INTO provider_fetch_jobs (symbol, job_type, provider, status, attempts, request_params)
         SELECT $1, $2, $3, 'queued', 0, $4::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM recent)
         RETURNING id
       )
       SELECT
         CASE
           WHEN EXISTS (SELECT 1 FROM inserted) THEN 'queued'
           WHEN EXISTS (SELECT 1 FROM recent) THEN 'queued'
           ELSE 'none'
         END AS refresh_status`,
      [normalizedSymbol, jobType, provider, JSON.stringify(requestParams), minIntervalSeconds]
    );
    return rows[0]?.refresh_status || 'none';
  } catch (err) {
    if (isMissingTableError(err)) return 'none';
    console.error('enqueue refresh job error:', err.message);
    return 'failed';
  }
}

module.exports = {
  DEFAULT_OPTIONS_REFRESH_PROVIDER,
  SUPPORTED_OPTIONS_REFRESH_PROVIDERS,
  normalizeRefreshSymbol,
  enqueueRefreshJob,
};
