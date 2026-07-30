module.exports = {
  apps: [
    {
      name: 'quantrift-options-collector',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'run_collector_daemon.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: true,
      restart_delay: 5000,
      env: {
        IB_MARKET_DATA_TYPE: '1',
        IB_OPTION_STREAM_TIMEOUT: '4',
        OPTION_MAX_CONTRACTS: '120',
        OPTION_MAX_CONTRACTS_PER_EXPIRATION: '40',
        OPTION_MAX_STRIKES_PER_SIDE: '6',
        COLLECTOR_POLL_SECONDS: '60',
        SCAN_MATERIALIZE_SECONDS: '300',
        PUBLIC_APP_URL: 'https://www.quantrift.io',
        HEARTBEAT_SECONDS: '60',
        COLLECTOR_RUNTIME: 'mac-refresh-daemon',
        OPTION_AUTO_REFRESH: 'true',
        OPTION_REFRESH_PROVIDER: 'polygon_licensed',
        OPTION_FALLBACK_PROVIDERS: 'ib_internal',
        OPTION_REFRESH_MAX_AGE_MINUTES: '60',
        OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES: '30',
        OPTION_REFRESH_SCHEDULE_SECONDS: '300',
        // Queue depth, not per-cycle count, is what the scheduler targets. The
        // worker's own REFRESH_WORKER_BATCH_SIZE still bounds execution rate.
        OPTION_REFRESH_QUEUE_TARGET: '20',
        OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE: '20',
        // Raised 2 -> 10 now that E7 (shared provider rate limiter) is the hard
        // 429 gate, so batch size is no longer a rate-limit risk (task.md:238).
        // Measured cost is ~2.83s/symbol (6 Polygon calls: 1 underlying prev +
        // 5 DTE buckets), so batch=10 is ~28s/cycle, leaving ~32s of the 60s
        // poll for compute_gex/materialize/DB/variance. Cuts a full cold-fill of
        // ~81 symbols from ~41min to ~9min. Do NOT raise concurrency via multiple
        // worker processes (E8) until its single-process assumptions are resolved.
        REFRESH_WORKER_BATCH_SIZE: '10',
        // Bounded in-process concurrency; provider pacing remains global and
        // PendingDerivations/materialization stays single-threaded.
        REFRESH_WORKER_CONCURRENCY: '3',
        // Polygon paid plans (incl. the $29 Options subscription) allow unlimited
        // API calls, so this is only a runaway-loop backstop, not a cost throttle.
        // The default 1000 was starving mid-day refreshes: ~81 symbols refreshed
        // through the day exceed 1000 well before market close. Keep it far above
        // real need so option data stays fresh all day. Mirror on Railway.
        PROVIDER_DAILY_BUDGET: '1000000',
        COLLECTOR_HEALTH_CHECK_ENABLED: 'true',
        COLLECTOR_HEALTH_CHECK_SECONDS: '300',
        HEALTH_MIN_COVERAGE_PCT: '95',
        HEALTH_MAX_FAILED_24H: '0',
        HEALTH_MAX_SNAPSHOT_AGE_MINUTES: '180',
        HEALTH_MIN_COMPLETENESS_PCT: '75',
        HEALTH_ALERT_COOLDOWN_MINUTES: '60',
        POLYGON_STOCK_REQUEST_DELAY: '16',
        DERIVED_VOLATILITY_ENABLED: 'true',
        DERIVED_VOLATILITY_SECONDS: '3600',
      },
    },
    {
      // User-requested strategy pricing is deliberately isolated from the
      // market-wide Polygon/GEX process. A slow IB request can occupy only this
      // one lane and cannot delay the collector's next refresh cycle.
      name: 'quantrift-options-quote-worker',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'run_quote_worker_daemon.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: true,
      restart_delay: 5000,
      env: {
        COLLECTOR_RUNTIME: 'mac-ib-quote-worker',
        QUOTE_WORKER_POLL_SECONDS: '5',
        QUOTE_WORKER_BATCH_SIZE: '1',
        QUOTE_WORKER_CONCURRENCY: '1',
        QUOTE_ENRICHMENT_PRIORITY: '90',
        IB_MARKET_DATA_TYPE: '1',
        IB_OPTION_STREAM_TIMEOUT: '4',
      },
    },
    {
      name: 'quantrift-options-prices',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_prices.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      // Two weekday runs: 13:35 PT (~35 min after the 16:00 ET close, may miss a
      // still-pending EOD bar) and 18:35 PT (= 21:35 ET, past the EOD settle) so
      // a late-finalized daily bar is picked up the same day rather than waiting
      // for the next weekday. Each run refetches 400 days and upserts, so the
      // second run also self-heals any gap the first left.
      cron_restart: '35 13,18 * * 1-5',
      env: {
        PRICE_PROVIDER: 'polygon',
        SYMBOLS: 'watchlist',
        PRICE_HISTORY_LIMIT: '400',
        PRICE_30M_LOOKBACK_DAYS: '35',
        POLYGON_STOCK_REQUEST_DELAY: '16',
        POLYGON_PRICE_RATE_LIMIT_BACKOFF: '60',
        DERIVED_VOLATILITY_ENABLED: 'true',
      },
    },
    {
      name: 'quantrift-reddit-trends',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_reddit_trends.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '*/30 * * * *',
      env: {
        REDDIT_WINDOW_HOURS: '24',
        REDDIT_MAX_PAGES: '3',
      },
    },
    {
      name: 'quantrift-unusual-whales-flow',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_unusual_whales.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: true,
      restart_delay: 5000,
      env: {
        UW_PM2_IDLE_WHEN_DISABLED: 'true',
        UW_RECONNECT_SECONDS: '5',
        UW_WS_TIMEOUT_SECONDS: '30',
      },
    },
    {
      name: 'quantrift-news',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_news.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      // Live reqMktData+tickNews subscription, batched under IB's 100-line
      // market-data cap (batch_size=80) -- a full universe sweep costs ~80s,
      // comfortably inside this window with no overlap risk. See
      // docs/validation/NEWS_SOURCE_SELECTION_2026-07-26.md for why this is a
      // cron, not a persistent process, for the MVP.
      cron_restart: '*/5 * * * *',
      env: {
        NEWS_INGESTION_ENABLED: 'true',
        NEWS_WINDOW_HOURS: '6',
      },
    },
    {
      name: 'quantrift-backup-facts',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'backup_facts.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      // Daily at 02:15 PT, well clear of the 13:35/18:35 price runs. Dumps only
      // the irreplaceable fact tables (~9MB gzipped), not the ~97% of the
      // database that is regenerable snapshot churn. Added after the 2026-07-30
      // volume-full outage, which showed this database can die outright and
      // that Railway's own backups sit in the same account (single point of
      // failure) -- see docs/validation/DB_VOLUME_FULL_OUTAGE_2026-07-30.md.
      cron_restart: '15 2 * * *',
      env: {
        FACT_BACKUP_KEEP: '14',
      },
    },
    {
      name: 'quantrift-universe-metadata',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_universe_metadata.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '15 12 * * 0',
      env: {
        REFERENCE_METADATA_ENABLED: 'true',
        POLYGON_REFERENCE_RATE_LIMIT_BACKOFF: '60',
      },
    },
  ],
};
