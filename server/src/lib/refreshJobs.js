const pool = require('../db');

const DEFAULT_OPTIONS_REFRESH_PROVIDER = process.env.OPTIONS_REFRESH_PROVIDER || 'polygon_licensed';
const SUPPORTED_OPTIONS_REFRESH_PROVIDERS = new Set(['ib_internal', 'tt_internal', 'polygon_licensed']);
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

function isMissingTableError(err) {
  return err?.code === '42P01';
}

const SCAN_LEVEL_JOB_TYPES = new Set(['scanner_materialize', 'scanner_candidate_materialize']);

function normalizeRefreshSymbol(symbol, jobType) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (SCAN_LEVEL_JOB_TYPES.has(jobType) && normalized === '__SCAN__') return normalized;
  return SYMBOL_PATTERN.test(normalized) ? normalized : null;
}

async function enqueueRefreshJob({
  symbol,
  jobType,
  provider = DEFAULT_OPTIONS_REFRESH_PROVIDER,
  requestParams = {},
  minIntervalSeconds = parseInt(process.env.REFRESH_MIN_INTERVAL_SECONDS ?? 60, 10),
}) {
  const normalizedSymbol = normalizeRefreshSymbol(symbol, jobType);
  if (!normalizedSymbol || !jobType) return 'none';

  try {
    const { rows } = await pool.query(
      `WITH recent AS (
         SELECT id
         FROM provider_fetch_jobs
         WHERE symbol = $1
           AND job_type = $2
           AND provider = $3
           AND created_at >= NOW() - ($5::int * INTERVAL '1 second')
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
