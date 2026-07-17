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

    CREATE TABLE IF NOT EXISTS price_history_30m (
      id          BIGSERIAL PRIMARY KEY,
      symbol      TEXT        NOT NULL,
      bar_ts      TIMESTAMPTZ NOT NULL,
      open        NUMERIC(12,4),
      high        NUMERIC(12,4),
      low         NUMERIC(12,4),
      close       NUMERIC(12,4) NOT NULL,
      volume      BIGINT,
      vwap        NUMERIC(12,4),
      trade_count BIGINT,
      source      TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, bar_ts)
    );

    CREATE INDEX IF NOT EXISTS price_history_30m_symbol_ts
      ON price_history_30m (symbol, bar_ts DESC);
    CREATE INDEX IF NOT EXISTS price_history_30m_ts
      ON price_history_30m (bar_ts DESC);

    CREATE TABLE IF NOT EXISTS volatility_history (
      id                    BIGSERIAL PRIMARY KEY,
      symbol                TEXT        NOT NULL,
      metric_date           DATE        NOT NULL,
      hv30                  NUMERIC(10,6),
      hv60                  NUMERIC(10,6),
      hv90                  NUMERIC(10,6),
      hv30_observations     INTEGER,
      hv60_observations     INTEGER,
      hv90_observations     INTEGER,
      atm_iv                NUMERIC(10,6),
      atm_expiry            DATE,
      atm_strike            NUMERIC(14,4),
      atm_dte               INTEGER,
      atm_snapshot_id       BIGINT,
      iv_rank               NUMERIC(6,2),
      iv_percentile         NUMERIC(6,2),
      iv_observation_count  INTEGER     NOT NULL DEFAULT 0,
      iv_rank_ready         BOOLEAN     NOT NULL DEFAULT FALSE,
      hv_source             TEXT,
      iv_source             TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, metric_date)
    );

    CREATE INDEX IF NOT EXISTS volatility_history_symbol_date
      ON volatility_history (symbol, metric_date DESC);
    CREATE INDEX IF NOT EXISTS volatility_history_rank_ready
      ON volatility_history (iv_rank_ready, metric_date DESC);

    CREATE TABLE IF NOT EXISTS provider_auth_state (
      provider       TEXT PRIMARY KEY,
      remember_token TEXT NOT NULL,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS scanner_alert_subscriptions (
      id                BIGSERIAL PRIMARY KEY,
      unsubscribe_token TEXT        NOT NULL UNIQUE,
      channel           TEXT        NOT NULL CHECK (channel IN ('email', 'web_push')),
      destination       JSONB       NOT NULL,
      rules             JSONB       NOT NULL DEFAULT '{}',
      active            BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS scanner_alert_subscriptions_active
      ON scanner_alert_subscriptions (active, channel);

    CREATE TABLE IF NOT EXISTS scanner_alert_deliveries (
      id                BIGSERIAL PRIMARY KEY,
      subscription_id   BIGINT      NOT NULL REFERENCES scanner_alert_subscriptions(id) ON DELETE CASCADE,
      scan_key           TEXT        NOT NULL,
      scan_snapshot_ts   TIMESTAMPTZ NOT NULL,
      candidate_key      TEXT        NOT NULL,
      payload            JSONB       NOT NULL,
      status             TEXT        NOT NULL CHECK (status IN ('pending', 'sent', 'blocked', 'failed')),
      channel            TEXT        NOT NULL,
      error              TEXT,
      attempted_at       TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (subscription_id, scan_snapshot_ts, candidate_key)
    );

    CREATE INDEX IF NOT EXISTS scanner_alert_deliveries_status
      ON scanner_alert_deliveries (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS collector_heartbeats (
      node_id       TEXT        PRIMARY KEY,
      status        TEXT        NOT NULL DEFAULT 'online',
      payload       JSONB       NOT NULL DEFAULT '{}',
      last_seen_at  TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collector_heartbeat_alerts (
      node_id          TEXT        PRIMARY KEY,
      status           TEXT        NOT NULL CHECK (status IN ('active', 'resolved')),
      first_seen_at    TIMESTAMPTZ NOT NULL,
      last_seen_at     TIMESTAMPTZ NOT NULL,
      last_notified_at TIMESTAMPTZ,
      resolved_at      TIMESTAMPTZ,
      payload          JSONB       NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS users (
      id                  BIGSERIAL   PRIMARY KEY,
      clerk_user_id       TEXT        NOT NULL UNIQUE,
      email               TEXT,
      display_name        TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                       BIGSERIAL   PRIMARY KEY,
      user_id                  BIGINT      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan                     TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
      status                   TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
      stripe_customer_id       TEXT        UNIQUE,
      stripe_subscription_id   TEXT        UNIQUE,
      current_period_end       TIMESTAMPTZ,
      cancel_at_period_end     BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS positions (
      id             BIGSERIAL   PRIMARY KEY,
      user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol         TEXT        NOT NULL,
      strategy_name  TEXT        NOT NULL,
      status         TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      quantity       INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
      opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at      TIMESTAMPTZ,
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS positions_user_status
      ON positions (user_id, status, opened_at DESC);

    CREATE TABLE IF NOT EXISTS position_legs (
      id               BIGSERIAL    PRIMARY KEY,
      position_id      BIGINT       NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      expiry           DATE         NOT NULL,
      strike           NUMERIC(14,4) NOT NULL CHECK (strike > 0),
      option_right     TEXT         NOT NULL CHECK (option_right IN ('C', 'P')),
      side             TEXT         NOT NULL CHECK (side IN ('long', 'short')),
      quantity         INTEGER      NOT NULL DEFAULT 1 CHECK (quantity > 0),
      entry_price      NUMERIC(14,4) NOT NULL CHECK (entry_price >= 0),
      contract_symbol  TEXT,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS position_legs_position
      ON position_legs (position_id);

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id       TEXT        PRIMARY KEY,
      event_type     TEXT        NOT NULL,
      payload        JSONB       NOT NULL,
      processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_trend_snapshots (
      id              BIGSERIAL   PRIMARY KEY,
      snapshot_ts     TIMESTAMPTZ NOT NULL,
      source          TEXT        NOT NULL,
      window_hours    INTEGER     NOT NULL CHECK (window_hours > 0),
      post_count      INTEGER     NOT NULL DEFAULT 0 CHECK (post_count >= 0),
      raw_metadata    JSONB       NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (snapshot_ts, source)
    );

    CREATE INDEX IF NOT EXISTS community_trend_snapshots_ts
      ON community_trend_snapshots (snapshot_ts DESC);

    CREATE TABLE IF NOT EXISTS community_symbol_trends (
      snapshot_id     BIGINT      NOT NULL REFERENCES community_trend_snapshots(id) ON DELETE CASCADE,
      symbol          TEXT        NOT NULL,
      mention_count   INTEGER     NOT NULL DEFAULT 0 CHECK (mention_count >= 0),
      weighted_score  NUMERIC(14,4) NOT NULL DEFAULT 0,
      total_upvotes   BIGINT      NOT NULL DEFAULT 0,
      total_comments  BIGINT      NOT NULL DEFAULT 0,
      sample_titles   JSONB       NOT NULL DEFAULT '[]',
      PRIMARY KEY (snapshot_id, symbol)
    );

    CREATE INDEX IF NOT EXISTS community_symbol_trends_symbol_snapshot
      ON community_symbol_trends (symbol, snapshot_id DESC);

    CREATE TABLE IF NOT EXISTS external_flow_events (
      id                  BIGSERIAL   PRIMARY KEY,
      source              TEXT        NOT NULL,
      provider_event_id   TEXT        NOT NULL,
      symbol              TEXT        NOT NULL,
      event_type          TEXT        NOT NULL CHECK (event_type IN ('option_flow', 'dark_pool')),
      executed_at         TIMESTAMPTZ NOT NULL,
      contract_symbol     TEXT,
      expiry              DATE,
      option_right        TEXT        CHECK (option_right IN ('C', 'P')),
      strike              NUMERIC(14,4),
      underlying_price    NUMERIC(14,4),
      price               NUMERIC(14,4),
      size                BIGINT,
      premium             NUMERIC(20,4),
      open_interest       BIGINT,
      volume              BIGINT,
      ask_side_premium    NUMERIC(20,4),
      bid_side_premium    NUMERIC(20,4),
      has_sweep           BOOLEAN     NOT NULL DEFAULT FALSE,
      all_opening_trades  BOOLEAN     NOT NULL DEFAULT FALSE,
      market_center       TEXT,
      raw_metadata        JSONB       NOT NULL DEFAULT '{}',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source, provider_event_id, event_type)
    );

    CREATE INDEX IF NOT EXISTS external_flow_events_symbol_time
      ON external_flow_events (symbol, executed_at DESC);
    CREATE INDEX IF NOT EXISTS external_flow_events_type_time
      ON external_flow_events (event_type, executed_at DESC);

    CREATE TABLE IF NOT EXISTS external_flow_provider_state (
      source              TEXT PRIMARY KEY,
      status              TEXT        NOT NULL,
      last_connected_at   TIMESTAMPTZ,
      last_message_at     TIMESTAMPTZ,
      last_error          TEXT,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS collector_health_alerts (
      id                BIGSERIAL PRIMARY KEY,
      fingerprint       TEXT        NOT NULL UNIQUE,
      status            TEXT        NOT NULL DEFAULT 'active',
      payload           JSONB       NOT NULL DEFAULT '{}',
      first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_notified_at  TIMESTAMPTZ,
      resolved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS collector_health_alerts_status_seen
      ON collector_health_alerts (status, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS symbol_universe (
      symbol            TEXT PRIMARY KEY,
      active            BOOLEAN     NOT NULL DEFAULT TRUE,
      scan_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
      source            TEXT        NOT NULL DEFAULT 'watchlist_seed',
      name              TEXT,
      asset_type        TEXT,
      sector            TEXT,
      market_cap        NUMERIC(20,2),
      optionable        BOOLEAN,
      added_via         TEXT        NOT NULL DEFAULT 'seed',
      metadata          JSONB       NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS symbol_universe_scan_active
      ON symbol_universe (scan_enabled, active, symbol);
    CREATE INDEX IF NOT EXISTS symbol_universe_market_cap
      ON symbol_universe (market_cap DESC) WHERE active = TRUE;

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
      atm_iv                     NUMERIC(10,6),
      atm_expiry                 DATE,
      atm_strike                 NUMERIC(14,4),
      iv_source                  TEXT,
      hv_source                  TEXT,
      iv_rank_source             TEXT,
      iv_rank_ready              BOOLEAN     NOT NULL DEFAULT FALSE,
      iv_observation_count       INTEGER     NOT NULL DEFAULT 0,
      earnings_date              DATE,
      price_close                NUMERIC(12,4),
      price_date                 DATE,
      price_source               TEXT,
      price_status               TEXT        NOT NULL DEFAULT 'missing',
      underlying_volume          BIGINT,
      underlying_dollar_volume   NUMERIC(20,2),
      universe_name              TEXT,
      asset_type                 TEXT,
      sector                     TEXT,
      market_cap                 NUMERIC(20,2),
      optionable                 BOOLEAN,
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

    ALTER TABLE scanner_results_snapshots
      ADD COLUMN IF NOT EXISTS atm_iv NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS atm_expiry DATE,
      ADD COLUMN IF NOT EXISTS atm_strike NUMERIC(14,4),
      ADD COLUMN IF NOT EXISTS iv_source TEXT,
      ADD COLUMN IF NOT EXISTS hv_source TEXT,
      ADD COLUMN IF NOT EXISTS iv_rank_source TEXT,
      ADD COLUMN IF NOT EXISTS iv_rank_ready BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS iv_observation_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS underlying_volume BIGINT,
      ADD COLUMN IF NOT EXISTS underlying_dollar_volume NUMERIC(20,2),
      ADD COLUMN IF NOT EXISTS universe_name TEXT,
      ADD COLUMN IF NOT EXISTS asset_type TEXT,
      ADD COLUMN IF NOT EXISTS sector TEXT,
      ADD COLUMN IF NOT EXISTS market_cap NUMERIC(20,2),
      ADD COLUMN IF NOT EXISTS optionable BOOLEAN;

    -- Per-symbol, per-product freshness summary. One row per (symbol, product).
    -- Records only observed facts: what landed, when, from where, and what the
    -- last refresh attempt did. Freshness itself is NOT stored -- it decays with
    -- wall-clock time, so a stored label would be wrong the moment nothing
    -- writes. Readers derive it from latest_snapshot_ts against the shared
    -- product policy.
    CREATE TABLE IF NOT EXISTS symbol_data_state (
      symbol             TEXT        NOT NULL,
      product            TEXT        NOT NULL,
      latest_snapshot_ts TIMESTAMPTZ,
      latest_market_date DATE,
      source             TEXT,
      refresh_status     TEXT        NOT NULL DEFAULT 'unknown',
      last_job_id        BIGINT,
      last_error_code    TEXT,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, product)
    );

    CREATE INDEX IF NOT EXISTS symbol_data_state_product_snapshot
      ON symbol_data_state (product, latest_snapshot_ts DESC NULLS FIRST);
    CREATE INDEX IF NOT EXISTS symbol_data_state_refresh_status
      ON symbol_data_state (refresh_status, updated_at DESC);

    -- Cross-process provider pacing. Replaces a local file lock, which cannot
    -- coordinate workers on different machines or Railway replicas.
    -- next_allowed_at is the next free request slot; callers claim one
    -- atomically and the database clock is the single authority, so worker
    -- machines with skewed clocks cannot both fire early.
    CREATE TABLE IF NOT EXISTS provider_rate_limits (
      provider        TEXT        NOT NULL,
      scope           TEXT        NOT NULL,
      next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_status     TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (provider, scope)
    );
  `);

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
