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
const OPTIONS_STALE_MINUTES = parseInt(process.env.OPTIONS_STALE_MINUTES ?? 15, 10);

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
    const [{ rows }, priceTableResult] = await Promise.all([
      pool.query(
      `SELECT DISTINCT ON (symbol)
         symbol, date, source, created_at
       FROM iv_history
       ORDER BY symbol, date DESC`
      ),
      pool.query(`SELECT to_regclass('public.price_history') AS table_name`),
    ]);

    const hasPriceHistory = Boolean(priceTableResult.rows[0]?.table_name);
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

module.exports = router;
