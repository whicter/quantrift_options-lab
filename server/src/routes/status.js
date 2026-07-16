/**
 * GET /api/status/data
 *
 * Returns collector data coverage for the configured watchlist.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const pool = require('../db');

const WATCHLIST_CANDIDATES = process.env.WATCHLIST_PATH
  ? [path.resolve(process.env.WATCHLIST_PATH)]
  : [
      path.resolve(__dirname, '../../../collector/watchlist.txt'),
      path.resolve(__dirname, '../../watchlist.txt'),
    ];
const OPTIONS_STALE_MINUTES = parseInt(process.env.OPTIONS_STALE_MINUTES ?? 180, 10);

function toDateString(value) {
  return value?.toISOString?.().slice(0, 10) || (value ? String(value).slice(0, 10) : null);
}

function latestDate(rows) {
  return rows.reduce((maxDate, row) => {
    const value = toDateString(row.date);
    return value && (!maxDate || value > maxDate) ? value : maxDate;
  }, null);
}

function latestTimestamp(rows) {
  return rows.reduce((maxTs, row) => {
    const value = row.created_at?.toISOString?.() || null;
    return value && (!maxTs || value > maxTs) ? value : maxTs;
  }, null);
}

function sourceCounts(rows) {
  const counts = {};
  for (const row of rows) {
    if (!row.source) continue;
    counts[row.source] = (counts[row.source] || 0) + 1;
  }
  return counts;
}

function ageMinutes(timestampValue) {
  if (!timestampValue) return null;
  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) return null;
  return Math.floor((Date.now() - timestamp.getTime()) / 60000);
}

function loadWatchlist() {
  const watchlistPath = WATCHLIST_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!watchlistPath) return [];

  const seen = new Set();
  const symbols = [];

  for (const rawLine of fs.readFileSync(watchlistPath, 'utf8').split(/\r?\n/)) {
    const symbol = rawLine.split('#', 1)[0].trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
  }

  return symbols;
}

router.get('/data', async (req, res) => {
  const watchlist = loadWatchlist();

  try {
    const [{ rows }, priceTableResult, universeTableResult] = await Promise.all([
      pool.query(
      `SELECT DISTINCT ON (symbol)
         symbol, date, source, created_at
       FROM iv_history
       ORDER BY symbol, date DESC`
      ),
      pool.query(`SELECT to_regclass('public.price_history') AS table_name`),
      pool.query(`SELECT to_regclass('public.symbol_universe') AS table_name`),
    ]);

    const hasPriceHistory = Boolean(priceTableResult.rows[0]?.table_name);
    const hasUniverse = Boolean(universeTableResult.rows[0]?.table_name);
    let universe = { total_count: watchlist.length, active_count: watchlist.length, scan_enabled_count: watchlist.length };
    if (hasUniverse) {
      const universeResult = await pool.query(
        `SELECT COUNT(*)::int AS total_count,
                COUNT(*) FILTER (WHERE active)::int AS active_count,
                COUNT(*) FILTER (WHERE active AND scan_enabled)::int AS scan_enabled_count,
                COUNT(*) FILTER (WHERE market_cap IS NOT NULL)::int AS market_cap_count,
                COUNT(*) FILTER (WHERE sector IS NOT NULL)::int AS sector_count,
                COUNT(*) FILTER (WHERE optionable IS NOT NULL)::int AS optionable_count
         FROM symbol_universe`
      );
      universe = universeResult.rows[0];
    }
    let priceRows = [];
    if (hasPriceHistory) {
      const result = await pool.query(
        `SELECT DISTINCT ON (symbol)
           symbol, date, source, created_at
         FROM price_history
         ORDER BY symbol, date DESC`
      );
      priceRows = result.rows;
    }

    const latestBySymbol = Object.fromEntries(rows.map(row => [row.symbol, row]));
    const priceBySymbol = Object.fromEntries(priceRows.map(row => [row.symbol, row]));
    const expectedSet = new Set(watchlist);
    const coveredSymbols = watchlist.filter(symbol => latestBySymbol[symbol]);
    const missingSymbols = watchlist.filter(symbol => !latestBySymbol[symbol]);
    const currentLatestDate = latestDate(rows);

    const staleSymbols = currentLatestDate
      ? watchlist.filter(symbol => {
          const row = latestBySymbol[symbol];
          const value = toDateString(row?.date);
          return row && value < currentLatestDate;
        })
      : [];

    const priceCoveredSymbols = watchlist.filter(symbol => priceBySymbol[symbol]);
    const priceMissingSymbols = watchlist.filter(symbol => !priceBySymbol[symbol]);
    const priceLatestDate = latestDate(priceRows);
    const priceStaleSymbols = priceLatestDate
      ? watchlist.filter(symbol => {
          const row = priceBySymbol[symbol];
          const value = toDateString(row?.date);
          return row && value < priceLatestDate;
        })
      : [];

    res.json({
      status: missingSymbols.length === 0 && staleSymbols.length === 0 && priceMissingSymbols.length === 0 && priceStaleSymbols.length === 0 ? 'ok' : 'degraded',
      generated_at: new Date().toISOString(),
      latest_date: currentLatestDate,
      latest_created_at: latestTimestamp(rows),
      expected_count: watchlist.length,
      covered_count: coveredSymbols.length,
      missing_count: missingSymbols.length,
      stale_count: staleSymbols.length,
      source_counts: sourceCounts(rows),
      universe: { table_exists: hasUniverse, ...universe },
      price_history: {
        table_exists: hasPriceHistory,
        expected_count: watchlist.length,
        covered_count: priceCoveredSymbols.length,
        missing_count: priceMissingSymbols.length,
        stale_count: priceStaleSymbols.length,
        latest_date: priceLatestDate,
        latest_created_at: latestTimestamp(priceRows),
        source_counts: sourceCounts(priceRows),
        covered_symbols: priceCoveredSymbols,
        missing_symbols: priceMissingSymbols,
        stale_symbols: priceStaleSymbols,
      },
      expected_symbols: watchlist,
      missing_symbols: missingSymbols,
      stale_symbols: staleSymbols,
      symbols: watchlist.map(symbol => {
        const row = latestBySymbol[symbol];
        const priceRow = priceBySymbol[symbol];
        const priceStatus = !priceRow ? 'missing' : priceStaleSymbols.includes(symbol) ? 'stale' : 'covered';
        return {
          symbol,
          date: row?.date || null,
          source: row?.source || null,
          created_at: row?.created_at || null,
          status: !row ? 'missing' : staleSymbols.includes(symbol) ? 'stale' : 'covered',
          price: {
            date: priceRow?.date || null,
            source: priceRow?.source || null,
            created_at: priceRow?.created_at || null,
            status: priceStatus,
          },
        };
      }),
      extra_symbols: rows.map(row => row.symbol).filter(symbol => !expectedSet.has(symbol)),
    });
  } catch (err) {
    console.error('GET /api/status/data error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

router.get('/options', async (req, res) => {
  const watchlist = loadWatchlist();

  try {
    const tableResult = await pool.query(`SELECT to_regclass('public.option_chain_snapshots') AS table_name`);
    const hasOptionSnapshots = Boolean(tableResult.rows[0]?.table_name);

    if (!hasOptionSnapshots) {
      return res.json({
        status: 'missing',
        generated_at: new Date().toISOString(),
        table_exists: false,
        expected_count: watchlist.length,
        covered_count: 0,
        missing_count: watchlist.length,
        stale_count: 0,
        expected_symbols: watchlist,
        covered_symbols: [],
        missing_symbols: watchlist,
        stale_symbols: [],
        source_counts: {},
      });
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (symbol)
         symbol, snapshot_ts, source, provider_status, contract_count,
         completeness_pct, missing_greeks_ratio, missing_oi_ratio, created_at
       FROM option_chain_snapshots
       ORDER BY symbol, snapshot_ts DESC`
    );

    const latestBySymbol = Object.fromEntries(rows.map(row => [row.symbol, row]));
    const expectedSet = new Set(watchlist);
    const coveredSymbols = watchlist.filter(symbol => latestBySymbol[symbol]);
    const missingSymbols = watchlist.filter(symbol => !latestBySymbol[symbol]);
    const staleSymbols = watchlist.filter(symbol => {
      const age = ageMinutes(latestBySymbol[symbol]?.snapshot_ts);
      return age == null ? false : age > OPTIONS_STALE_MINUTES;
    });

    res.json({
      status: missingSymbols.length === 0 && staleSymbols.length === 0 ? 'ok' : 'degraded',
      generated_at: new Date().toISOString(),
      table_exists: true,
      expected_count: watchlist.length,
      covered_count: coveredSymbols.length,
      missing_count: missingSymbols.length,
      stale_count: staleSymbols.length,
      latest_snapshot_ts: latestTimestamp(rows.map(row => ({ created_at: row.snapshot_ts }))),
      latest_created_at: latestTimestamp(rows),
      source_counts: sourceCounts(rows),
      expected_symbols: watchlist,
      covered_symbols: coveredSymbols,
      missing_symbols: missingSymbols,
      stale_symbols: staleSymbols,
      symbols: watchlist.map(symbol => {
        const row = latestBySymbol[symbol];
        const age = ageMinutes(row?.snapshot_ts);
        return {
          symbol,
          snapshot_ts: row?.snapshot_ts || null,
          source: row?.source || null,
          provider_status: row?.provider_status || null,
          contract_count: row?.contract_count || 0,
          completeness_pct: row?.completeness_pct || null,
          missing_greeks_ratio: row?.missing_greeks_ratio || null,
          missing_oi_ratio: row?.missing_oi_ratio || null,
          age_minutes: age,
          status: !row ? 'missing' : staleSymbols.includes(symbol) ? 'stale' : 'covered',
        };
      }),
      extra_symbols: rows.map(row => row.symbol).filter(symbol => !expectedSet.has(symbol)),
    });
  } catch (err) {
    console.error('GET /api/status/options error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

router.get('/cache', async (req, res) => {
  try {
    const [
      jobsTable,
      scannerTable,
      optionsTable,
      usageTable,
      oiDeltaTable,
    ] = await Promise.all([
      pool.query(`SELECT to_regclass('public.provider_fetch_jobs') AS table_name`),
      pool.query(`SELECT to_regclass('public.scanner_results_snapshots') AS table_name`),
      pool.query(`SELECT to_regclass('public.option_chain_snapshots') AS table_name`),
      pool.query(`SELECT to_regclass('public.provider_request_usage') AS table_name`),
      pool.query(`SELECT to_regclass('public.option_oi_delta_snapshots') AS table_name`),
    ]);

    const hasJobs = Boolean(jobsTable.rows[0]?.table_name);
    const hasScanner = Boolean(scannerTable.rows[0]?.table_name);
    const hasOptions = Boolean(optionsTable.rows[0]?.table_name);
    const hasUsage = Boolean(usageTable.rows[0]?.table_name);
    const hasOiDelta = Boolean(oiDeltaTable.rows[0]?.table_name);

    let jobSummary = [];
    let recentFailures = [];
    if (hasJobs) {
      const [summaryResult, failuresResult] = await Promise.all([
        pool.query(
          `SELECT status, job_type, COUNT(*)::int AS count
           FROM provider_fetch_jobs
           WHERE created_at >= NOW() - INTERVAL '24 hours'
           GROUP BY status, job_type
           ORDER BY job_type, status`
        ),
        pool.query(
          `SELECT id, symbol, job_type, provider, attempts, last_error, created_at, finished_at
           FROM provider_fetch_jobs
           WHERE status = 'failed'
           ORDER BY finished_at DESC NULLS LAST, created_at DESC
           LIMIT 10`
        ),
      ]);
      jobSummary = summaryResult.rows;
      recentFailures = failuresResult.rows;
    }

    let scanner = {
      table_exists: hasScanner,
      latest_snapshot_ts: null,
      age_minutes: null,
      row_count: 0,
      stale: true,
    };
    if (hasScanner) {
      const { rows } = await pool.query(
        `WITH latest AS (
           SELECT MAX(snapshot_ts) AS snapshot_ts
           FROM scanner_results_snapshots
           WHERE scan_key = $1
         )
         SELECT latest.snapshot_ts,
                EXTRACT(EPOCH FROM (NOW() - latest.snapshot_ts)) / 60.0 AS age_minutes,
                COUNT(s.id)::int AS row_count
         FROM latest
         LEFT JOIN scanner_results_snapshots s ON s.snapshot_ts = latest.snapshot_ts AND s.scan_key = $1
         GROUP BY latest.snapshot_ts`,
        [process.env.SCAN_KEY || 'watchlist_v1']
      );
      const row = rows[0] || {};
      const age = row.age_minutes == null ? null : Number(row.age_minutes);
      scanner = {
        table_exists: true,
        latest_snapshot_ts: row.snapshot_ts || null,
        age_minutes: age,
        row_count: row.row_count || 0,
        stale: age == null ? true : age > parseInt(process.env.SCANNER_STALE_MINUTES ?? 5, 10),
      };
    }

    let emptySnapshots = 0;
    if (hasOptions) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM option_chain_snapshots
         WHERE created_at >= NOW() - INTERVAL '24 hours'
           AND (contract_count = 0 OR provider_status IN ('empty', 'metadata_only'))`
      );
      emptySnapshots = rows[0]?.count || 0;
    }

    let providerUsage = [];
    if (hasUsage) {
      const { rows } = await pool.query(
        `SELECT provider, usage_date, job_type, request_count, request_budget,
                CASE
                  WHEN request_budget > 0 THEN ROUND((request_count::numeric / request_budget) * 100, 2)
                  ELSE NULL
                END AS budget_used_pct
         FROM provider_request_usage
         WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY usage_date DESC, provider, job_type`
      );
      providerUsage = rows;
    }

    let oiDelta = {
      table_exists: hasOiDelta,
      latest_snapshot_ts: null,
      row_count: 0,
      unusual_count: 0,
      status_counts: {},
    };
    if (hasOiDelta) {
      const { rows } = await pool.query(
        `WITH latest AS (
           SELECT MAX(snapshot_ts) AS snapshot_ts
           FROM option_oi_delta_snapshots
         ),
         latest_rows AS (
           SELECT *
           FROM option_oi_delta_snapshots
           WHERE snapshot_ts = (SELECT snapshot_ts FROM latest)
         )
         SELECT
           (SELECT snapshot_ts FROM latest) AS latest_snapshot_ts,
           (SELECT COUNT(*)::int FROM latest_rows) AS row_count,
           (SELECT COUNT(*)::int FROM latest_rows WHERE is_unusual) AS unusual_count,
           COALESCE(jsonb_object_agg(status, status_count), '{}'::jsonb) AS status_counts
         FROM (
           SELECT status, COUNT(*)::int AS status_count
           FROM latest_rows
           GROUP BY status
         ) grouped`
      );
      oiDelta = {
        table_exists: true,
        latest_snapshot_ts: rows[0]?.latest_snapshot_ts || null,
        row_count: rows[0]?.row_count || 0,
        unusual_count: rows[0]?.unusual_count || 0,
        status_counts: rows[0]?.status_counts || {},
      };
    }

    const failedCount = jobSummary
      .filter(row => row.status === 'failed')
      .reduce((sum, row) => sum + row.count, 0);
    const queuedCount = jobSummary
      .filter(row => row.status === 'queued')
      .reduce((sum, row) => sum + row.count, 0);

    res.json({
      status: failedCount === 0 && queuedCount < 50 && !scanner.stale && emptySnapshots === 0 ? 'ok' : 'degraded',
      generated_at: new Date().toISOString(),
      jobs: {
        table_exists: hasJobs,
        summary_24h: jobSummary,
        queued_count_24h: queuedCount,
        failed_count_24h: failedCount,
        recent_failures: recentFailures,
      },
      scanner,
      option_snapshots: {
        table_exists: hasOptions,
        empty_or_metadata_only_24h: emptySnapshots,
      },
      oi_delta: oiDelta,
      provider_usage: {
        table_exists: hasUsage,
        rows: providerUsage,
      },
    });
  } catch (err) {
    console.error('GET /api/status/cache error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
