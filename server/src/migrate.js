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

    CREATE TABLE IF NOT EXISTS symbol_metrics_snapshots (
      id              BIGSERIAL PRIMARY KEY,
      symbol          TEXT        NOT NULL,
      snapshot_ts     TIMESTAMPTZ NOT NULL,
      source          TEXT        NOT NULL,
      metrics         JSONB       NOT NULL DEFAULT '{}',
      freshness       TEXT        NOT NULL DEFAULT 'fresh',
      is_stale        BOOLEAN     NOT NULL DEFAULT FALSE,
      refresh_status  TEXT        NOT NULL DEFAULT 'none',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, snapshot_ts, source)
    );

    CREATE INDEX IF NOT EXISTS symbol_metrics_snapshots_symbol_ts
      ON symbol_metrics_snapshots (symbol, snapshot_ts DESC);

    CREATE TABLE IF NOT EXISTS option_chain_snapshots (
      id                    BIGSERIAL PRIMARY KEY,
      symbol                TEXT        NOT NULL,
      underlying_price      NUMERIC(14,4),
      underlying_bid        NUMERIC(14,4),
      underlying_ask        NUMERIC(14,4),
      snapshot_ts           TIMESTAMPTZ NOT NULL,
      source                TEXT        NOT NULL,
      provider_status       TEXT        NOT NULL DEFAULT 'ok',
      provider_snapshot_id  TEXT,
      contract_count        INTEGER     NOT NULL DEFAULT 0,
      completeness_pct      NUMERIC(6,2),
      missing_greeks_ratio  NUMERIC(6,4),
      missing_oi_ratio      NUMERIC(6,4),
      raw_metadata          JSONB       NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS option_chain_snapshots_symbol_ts
      ON option_chain_snapshots (symbol, snapshot_ts DESC);
    CREATE INDEX IF NOT EXISTS option_chain_snapshots_source_ts
      ON option_chain_snapshots (source, snapshot_ts DESC);

    CREATE TABLE IF NOT EXISTS option_contract_snapshots (
      id                    BIGSERIAL PRIMARY KEY,
      snapshot_id           BIGINT      NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
      symbol                TEXT        NOT NULL,
      expiry                DATE        NOT NULL,
      strike                NUMERIC(14,4) NOT NULL,
      option_right          TEXT        NOT NULL CHECK (option_right IN ('C', 'P')),
      bid                   NUMERIC(14,4),
      ask                   NUMERIC(14,4),
      last                  NUMERIC(14,4),
      mark                  NUMERIC(14,4),
      volume                BIGINT,
      open_interest         BIGINT,
      iv                    NUMERIC(10,6),
      delta                 NUMERIC(12,8),
      gamma                 NUMERIC(12,8),
      theta                 NUMERIC(12,8),
      vega                  NUMERIC(12,8),
      rho                   NUMERIC(12,8),
      bid_size              INTEGER,
      ask_size              INTEGER,
      contract_symbol       TEXT,
      local_symbol          TEXT,
      con_id                BIGINT,
      provider_contract_id  TEXT,
      raw_contract          JSONB       NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (snapshot_id, expiry, strike, option_right)
    );

    CREATE INDEX IF NOT EXISTS option_contract_snapshots_snapshot_expiry_strike
      ON option_contract_snapshots (snapshot_id, expiry, strike, option_right);
    CREATE INDEX IF NOT EXISTS option_contract_snapshots_symbol_expiry
      ON option_contract_snapshots (symbol, expiry, strike);

    CREATE TABLE IF NOT EXISTS gex_snapshots (
      id                          BIGSERIAL PRIMARY KEY,
      snapshot_id                 BIGINT      NOT NULL UNIQUE REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
      symbol                      TEXT        NOT NULL,
      snapshot_ts                 TIMESTAMPTZ NOT NULL,
      source                      TEXT        NOT NULL,
      global_gex                  NUMERIC(20,4),
      local_gamma                 NUMERIC(20,4),
      gamma_flip                  NUMERIC(14,4),
      gamma_regime                TEXT,
      spot_vs_flip_distance_pct   NUMERIC(10,4),
      call_wall                   NUMERIC(14,4),
      put_wall                    NUMERIC(14,4),
      wall_method                 TEXT,
      max_pain                    NUMERIC(14,4),
      pcr_oi                      NUMERIC(10,4),
      pcr_volume                  NUMERIC(10,4),
      confidence                  TEXT        NOT NULL DEFAULT 'low',
      gamma_curve                 JSONB       NOT NULL DEFAULT '[]',
      raw_metrics                 JSONB       NOT NULL DEFAULT '{}',
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gex_snapshots_symbol_ts
      ON gex_snapshots (symbol, snapshot_ts DESC);

    CREATE TABLE IF NOT EXISTS gex_by_strike_snapshots (
      id              BIGSERIAL PRIMARY KEY,
      snapshot_id     BIGINT      NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
      symbol          TEXT        NOT NULL,
      strike          NUMERIC(14,4) NOT NULL,
      call_gex        NUMERIC(20,4),
      put_gex         NUMERIC(20,4),
      net_gex         NUMERIC(20,4),
      call_oi         BIGINT,
      put_oi          BIGINT,
      call_volume     BIGINT,
      put_volume      BIGINT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (snapshot_id, strike)
    );

    CREATE INDEX IF NOT EXISTS gex_by_strike_snapshots_snapshot_strike
      ON gex_by_strike_snapshots (snapshot_id, strike);

    CREATE TABLE IF NOT EXISTS option_oi_delta_snapshots (
      id                         BIGSERIAL PRIMARY KEY,
      snapshot_id                BIGINT      NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
      previous_snapshot_id       BIGINT      REFERENCES option_chain_snapshots(id) ON DELETE SET NULL,
      symbol                     TEXT        NOT NULL,
      snapshot_ts                TIMESTAMPTZ NOT NULL,
      previous_snapshot_ts       TIMESTAMPTZ,
      source                     TEXT        NOT NULL,
      contract_key               TEXT        NOT NULL,
      contract_symbol            TEXT,
      provider_contract_id       TEXT,
      expiry                     DATE        NOT NULL,
      strike                     NUMERIC(14,4) NOT NULL,
      option_right               TEXT        NOT NULL CHECK (option_right IN ('C', 'P')),
      bid                        NUMERIC(14,4),
      ask                        NUMERIC(14,4),
      volume                     BIGINT,
      open_interest              BIGINT,
      previous_open_interest     BIGINT,
      oi_delta                   BIGINT,
      oi_delta_pct               NUMERIC(12,6),
      volume_oi_ratio            NUMERIC(12,6),
      status                     TEXT        NOT NULL DEFAULT 'baseline',
      is_unusual                 BOOLEAN     NOT NULL DEFAULT FALSE,
      unusual_score              NUMERIC(12,4),
      raw_metrics                JSONB       NOT NULL DEFAULT '{}',
      created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (snapshot_id, contract_key)
    );

    CREATE INDEX IF NOT EXISTS option_oi_delta_snapshots_symbol_ts
      ON option_oi_delta_snapshots (symbol, snapshot_ts DESC);
    CREATE INDEX IF NOT EXISTS option_oi_delta_snapshots_symbol_unusual
      ON option_oi_delta_snapshots (symbol, is_unusual, snapshot_ts DESC);

    CREATE TABLE IF NOT EXISTS provider_fetch_jobs (
      id              BIGSERIAL PRIMARY KEY,
      symbol          TEXT        NOT NULL,
      job_type        TEXT        NOT NULL,
      provider        TEXT        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'queued',
      attempts        INTEGER     NOT NULL DEFAULT 0,
      request_params  JSONB       NOT NULL DEFAULT '{}',
      result_summary  JSONB       NOT NULL DEFAULT '{}',
      last_error      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at      TIMESTAMPTZ,
      finished_at     TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS provider_fetch_jobs_symbol_type_created
      ON provider_fetch_jobs (symbol, job_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS provider_fetch_jobs_status_created
      ON provider_fetch_jobs (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS provider_request_usage (
      id              BIGSERIAL PRIMARY KEY,
      provider        TEXT        NOT NULL,
      usage_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
      job_type        TEXT        NOT NULL,
      request_count   INTEGER     NOT NULL DEFAULT 0,
      request_budget  INTEGER     NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, usage_date, job_type)
    );

    CREATE INDEX IF NOT EXISTS provider_request_usage_provider_date
      ON provider_request_usage (provider, usage_date DESC);

    CREATE TABLE IF NOT EXISTS scanner_results_snapshots (
      id                         BIGSERIAL PRIMARY KEY,
      scan_key                   TEXT        NOT NULL DEFAULT 'watchlist_v1',
      symbol                     TEXT        NOT NULL,
      snapshot_ts                TIMESTAMPTZ NOT NULL,
      source                     TEXT        NOT NULL,
      metric_date                DATE,
      iv30                       NUMERIC(8,4),
      hv30                       NUMERIC(8,4),
      iv_rank                    NUMERIC(6,2),
      iv_percentile              NUMERIC(6,2),
      iv_hv_diff                 NUMERIC(8,4),
      earnings_date              DATE,
      price_close                NUMERIC(12,4),
      price_date                 DATE,
      price_source               TEXT,
      price_status               TEXT        NOT NULL DEFAULT 'missing',
      gex_snapshot_ts            TIMESTAMPTZ,
      gex_source                 TEXT,
      gex_status                 TEXT        NOT NULL DEFAULT 'missing',
      global_gex                 NUMERIC(20,4),
      local_gamma                NUMERIC(20,4),
      gamma_flip                 NUMERIC(14,4),
      gamma_regime               TEXT,
      call_wall                  NUMERIC(14,4),
      put_wall                   NUMERIC(14,4),
      max_pain                   NUMERIC(14,4),
      pcr_oi                     NUMERIC(10,4),
      pcr_volume                 NUMERIC(10,4),
      gex_confidence             TEXT,
      total_oi                   BIGINT,
      total_volume               BIGINT,
      volume_oi_ratio            NUMERIC(12,6),
      max_strike_oi              BIGINT,
      max_strike_volume          BIGINT,
      call_wall_distance_pct     NUMERIC(10,4),
      put_wall_distance_pct      NUMERIC(10,4),
      signal_score               NUMERIC(10,2),
      trend_score                NUMERIC(10,2),
      trend_label                TEXT,
      trend_signal               TEXT,
      trend_change_5d            NUMERIC(10,4),
      trend_rsi14                NUMERIC(10,4),
      trend_ma20                 NUMERIC(14,4),
      trend_ma50                 NUMERIC(14,4),
      trend_ma200                NUMERIC(14,4),
      unusual_oi_count           INTEGER     NOT NULL DEFAULT 0,
      max_oi_delta               BIGINT,
      max_volume_oi_ratio        NUMERIC(12,6),
      unusual_status             TEXT        NOT NULL DEFAULT 'missing',
      payload                    JSONB       NOT NULL DEFAULT '{}',
      freshness                  TEXT        NOT NULL DEFAULT 'fresh',
      is_stale                   BOOLEAN     NOT NULL DEFAULT FALSE,
      refresh_status             TEXT        NOT NULL DEFAULT 'none',
      created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (scan_key, symbol, snapshot_ts)
    );

    CREATE INDEX IF NOT EXISTS scanner_results_snapshots_key_ts
      ON scanner_results_snapshots (scan_key, snapshot_ts DESC);
    CREATE INDEX IF NOT EXISTS scanner_results_snapshots_key_symbol_ts
      ON scanner_results_snapshots (scan_key, symbol, snapshot_ts DESC);
    CREATE INDEX IF NOT EXISTS scanner_results_snapshots_filters
      ON scanner_results_snapshots (scan_key, iv_rank DESC, gamma_regime, gex_status);

    ALTER TABLE scanner_results_snapshots
      ADD COLUMN IF NOT EXISTS trend_score NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS trend_label TEXT,
      ADD COLUMN IF NOT EXISTS trend_signal TEXT,
      ADD COLUMN IF NOT EXISTS trend_change_5d NUMERIC(10,4),
      ADD COLUMN IF NOT EXISTS trend_rsi14 NUMERIC(10,4),
      ADD COLUMN IF NOT EXISTS trend_ma20 NUMERIC(14,4),
      ADD COLUMN IF NOT EXISTS trend_ma50 NUMERIC(14,4),
      ADD COLUMN IF NOT EXISTS trend_ma200 NUMERIC(14,4),
      ADD COLUMN IF NOT EXISTS unusual_oi_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_oi_delta BIGINT,
      ADD COLUMN IF NOT EXISTS max_volume_oi_ratio NUMERIC(12,6),
      ADD COLUMN IF NOT EXISTS unusual_status TEXT NOT NULL DEFAULT 'missing';
  `);

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
