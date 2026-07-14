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

const WATCHLIST_PATH = process.env.WATCHLIST_PATH
  ? path.resolve(process.env.WATCHLIST_PATH)
  : path.resolve(__dirname, '../../../collector/watchlist.txt');

function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) return [];

  const seen = new Set();
  const symbols = [];

  for (const rawLine of fs.readFileSync(WATCHLIST_PATH, 'utf8').split(/\r?\n/)) {
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
    const expectedSet = new Set(watchlist);
    const coveredSymbols = watchlist.filter(symbol => latestBySymbol[symbol]);
    const missingSymbols = watchlist.filter(symbol => !latestBySymbol[symbol]);
    const latestDate = rows.reduce((maxDate, row) => {
      const value = row.date?.toISOString?.().slice(0, 10) || String(row.date);
      return !maxDate || value > maxDate ? value : maxDate;
    }, null);

    const staleSymbols = latestDate
      ? watchlist.filter(symbol => {
          const row = latestBySymbol[symbol];
          const value = row?.date?.toISOString?.().slice(0, 10) || (row ? String(row.date) : null);
          return row && value < latestDate;
        })
      : [];

    const sourceCounts = {};
    for (const row of rows) {
      sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;
    }

    res.json({
      status: missingSymbols.length === 0 && staleSymbols.length === 0 ? 'ok' : 'degraded',
      generated_at: new Date().toISOString(),
      latest_date: latestDate,
      latest_created_at: rows.reduce((maxTs, row) => {
        const value = row.created_at?.toISOString?.() || null;
        return value && (!maxTs || value > maxTs) ? value : maxTs;
      }, null),
      expected_count: watchlist.length,
      covered_count: coveredSymbols.length,
      missing_count: missingSymbols.length,
      stale_count: staleSymbols.length,
      source_counts: sourceCounts,
      price_history: {
        table_exists: hasPriceHistory,
        covered_count: priceRows.filter(row => expectedSet.has(row.symbol)).length,
        latest_date: priceRows.reduce((maxDate, row) => {
          const value = row.date?.toISOString?.().slice(0, 10) || String(row.date);
          return !maxDate || value > maxDate ? value : maxDate;
        }, null),
      },
      expected_symbols: watchlist,
      missing_symbols: missingSymbols,
      stale_symbols: staleSymbols,
      symbols: watchlist.map(symbol => {
        const row = latestBySymbol[symbol];
        return {
          symbol,
          date: row?.date || null,
          source: row?.source || null,
          created_at: row?.created_at || null,
          status: !row ? 'missing' : staleSymbols.includes(symbol) ? 'stale' : 'covered',
        };
      }),
      extra_symbols: rows.map(row => row.symbol).filter(symbol => !expectedSet.has(symbol)),
    });
  } catch (err) {
    console.error('GET /api/status/data error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
