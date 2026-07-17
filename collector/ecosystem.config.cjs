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
        IB_MARKET_DATA_TYPE: '3',
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
        OPTION_REFRESH_MAX_AGE_MINUTES: '60',
        OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES: '30',
        OPTION_REFRESH_SCHEDULE_SECONDS: '300',
        // Queue depth, not per-cycle count, is what the scheduler targets. The
        // worker's own REFRESH_WORKER_BATCH_SIZE still bounds execution rate;
        // raising that is gated behind the shared provider limiter (E7/E8).
        OPTION_REFRESH_QUEUE_TARGET: '20',
        OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE: '20',
        REFRESH_WORKER_BATCH_SIZE: '2',
        // Polygon paid plans (incl. the $29 Options subscription) allow unlimited
        // API calls, so this is only a runaway-loop backstop, not a cost throttle.
        // The default 1000 was starving mid-day refreshes: ~81 symbols refreshed
        // through the day exceed 1000 well before market close. Keep it far above
        // real need so option data stays fresh all day. Mirror on Railway.
        PROVIDER_DAILY_BUDGET: '50000',
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
      name: 'quantrift-options-prices',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_prices.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '35 13 * * 1-5',
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
