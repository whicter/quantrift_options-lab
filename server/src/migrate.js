/**
 * Run once to create tables in Railway PostgreSQL.
 * Usage: node src/migrate.js
 */
require('dotenv').config();
const pool = require('./db');

async function migrate() {
  console.log('Running migrations...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS iv_history (
      id          SERIAL PRIMARY KEY,
      symbol      TEXT        NOT NULL,
      date        DATE        NOT NULL,
      iv30        NUMERIC(8,4),          -- IV 30-day (decimal, e.g. 0.241)
      hv30        NUMERIC(8,4),          -- HV 30-day (decimal)
      hv60        NUMERIC(8,4),
      hv90        NUMERIC(8,4),
      iv_rank     NUMERIC(6,2),          -- 0-100
      iv_percentile NUMERIC(6,2),        -- 0-100
      iv_hv_diff  NUMERIC(8,4),          -- iv30 - hv30 (percentage points)
      earnings_date DATE,
      term_structure JSONB,              -- [{expiration_date, iv}, ...]
      source      TEXT        NOT NULL DEFAULT 'tastytrade',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, date)
    );

    CREATE INDEX IF NOT EXISTS iv_history_symbol_date ON iv_history (symbol, date DESC);

    CREATE TABLE IF NOT EXISTS price_history (
      id          SERIAL PRIMARY KEY,
      symbol      TEXT        NOT NULL,
      date        DATE        NOT NULL,
      open        NUMERIC(12,4),
      high        NUMERIC(12,4),
      low         NUMERIC(12,4),
      close       NUMERIC(12,4) NOT NULL,
      volume      BIGINT,
      source      TEXT        NOT NULL DEFAULT 'yfinance',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, date)
    );

    CREATE INDEX IF NOT EXISTS price_history_symbol_date ON price_history (symbol, date DESC);
    CREATE INDEX IF NOT EXISTS price_history_date ON price_history (date DESC);

    CREATE TABLE IF NOT EXISTS scanner_configs (
      id          SERIAL PRIMARY KEY,
      name        TEXT,
      filters     JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
