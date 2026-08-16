// Local persisted data lives on the X9_Pro external volume, one folder per
// project (see /Volumes/X9_Pro/data_seriliazation/README.md). Logs were growing
// ~70MB/day against the boot disk, dominated by ibapi protocol chatter that the
// news lane logged at INFO.
//
// KNOWN FAILURE MODE: if X9_Pro is not mounted, macOS creates /Volumes/X9_Pro as
// an ordinary directory on the boot disk and PM2 writes there silently; when the
// drive remounts that directory is shadowed and the logs appear to vanish. Logs
// are diagnostic, not a source of truth, so this is an annoyance rather than
// data loss -- but after any reboot confirm the volume before trusting a quiet
// log directory:  mount | grep X9_Pro
const DATA_ROOT = '/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab';
const LOG_DIR = `${DATA_ROOT}/logs`;

// PM2 has no per-config log root, so each app carries its own pair. Building
// them from the name keeps the two in step -- a hand-written pair is exactly
// where a typo sends one stream to the wrong file and nobody notices.
const logs = name => ({
  out_file: `${LOG_DIR}/${name}-out.log`,
  error_file: `${LOG_DIR}/${name}-error.log`,
});

module.exports = {
  apps: [
    {
      ...logs('quantrift-options-collector'),

      name: 'quantrift-options-collector',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'run_collector_daemon.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: true,
      restart_delay: 5000,
      env: {
        IB_MARKET_DATA_TYPE: '1',
        IB_OPTION_STREAM_TIMEOUT: '4',
        // DTE reach widened 2026-08-15. The ceiling was never OPTION_MAX_DTE --
        // it was the bucket list, whose last entry stopped at 90, and since most
        // symbols carry only one or two monthly expiries in 61-90 the chains
        // actually topped out at 76 days (measured: the 75-90 bin held 10
        // contracts across 1 symbol). Raising OPTION_MAX_DTE alone would have
        // changed nothing; the buckets are what select expiries.
        OPTION_MAX_DTE: '150',
        OPTION_DTE_BUCKETS: '0-14,15-29,30-45,46-60,61-90,91-120,121-150',
        // Two new buckets at 2 expiries each need room, or the far months simply
        // displace near-dated strikes against a fixed global cap. 120 -> 180
        // keeps existing near-term density rather than trading it away.
        //
        // This used to cost proportionally more IB time, because the quote
        // adapter subscribed one contract at a time. It now batches, so a chain
        // costs roughly one wait window per 40 contracts rather than one per
        // contract, and the extra strikes are close to free.
        OPTION_MAX_CONTRACTS: '180',
        OPTION_MAX_CONTRACTS_PER_EXPIRATION: '40',
        OPTION_MAX_STRIKES_PER_SIDE: '6',
        COLLECTOR_POLL_SECONDS: '60',
        SCAN_MATERIALIZE_SECONDS: '300',
        // Raised 5 -> 20 for the candidate-engine rework (2026-08). A batch is
        // written every scan cycle, so at the default of 5 a bad ranking change
        // CASCADE-drops every known-good batch within ~25 minutes and there is
        // nothing left to diff a regression against. 20 buys a rollback window
        // wide enough to compare old and new orderings. Return this to 5 once the
        // scoring/pricing phases are accepted in production.
        SCANNER_CANDIDATE_BATCH_KEEP: '20',
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
        // Options get their own interval (2026-08-15). The scopes were split so
        // option pagination would stop queueing behind the price sweep, but only
        // the counters were separated -- the interval still came from
        // POLYGON_STOCK_REQUEST_DELAY, so options inherited 16s that originated
        // as a price-collection default and had never been measured against the
        // options endpoints.
        //
        // It was the dominant term in chain staleness. A chain fetch issues ~35
        // requests, so 16s each is ~9 minutes of deliberate sleeping inside a
        // measured 601s median job -- which is why 214 of 327 symbols were
        // refreshed exactly once on 2026-08-14 and a quarter of the universe
        // still carried overnight data at the close. The provider's 15-minute
        // delay was never the binding constraint; this was.
        //
        // Probed against /v3/snapshot/options: 8 consecutive requests at 1.0s,
        // 0.5s and 0.25s all returned 200. 1.5s keeps a wide margin under the
        // slowest probed rate rather than chasing the fastest, and penalize()
        // backs every worker off globally on a 429 if the ceiling is ever met.
        // Stocks and breadth are untouched -- their limits were never probed.
        POLYGON_OPTIONS_REQUEST_DELAY: '1.5',
        DERIVED_VOLATILITY_ENABLED: 'true',
        DERIVED_VOLATILITY_SECONDS: '3600',
      },
    },
    {
      // User-requested strategy pricing is deliberately isolated from the
      // market-wide Polygon/GEX process. A slow IB request can occupy only this
      // one lane and cannot delay the collector's next refresh cycle.
      ...logs('quantrift-options-quote-worker'),

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
      ...logs('quantrift-options-prices'),

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
        // This is a dedicated batch cron with nothing queued behind it, so it
        // can afford to sit out a long provider penalty inline. The worker keeps
        // the 300s default because it must stay responsive and can re-queue
        // instead. Beyond this budget the pacer defers rather than firing, so a
        // generous value here means "wait out a 429", never "ignore one".
        PROVIDER_RATE_LIMIT_MAX_WAIT: '1800',
        DERIVED_VOLATILITY_ENABLED: 'true',
      },
    },
    {
      ...logs('quantrift-market-breadth'),

      name: 'quantrift-market-breadth',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_market_breadth.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      // Full-market EOD breadth is independent from the option/GEX worker.
      // Three weekday attempts, 06:05 / 20:05 / 22:05 ET (PT hours below).
      //
      // The two evening runs let the later one self-heal if Polygon has not
      // finalized the grouped daily response at the first. In practice neither
      // ever gets the same day: measured 2026-08-14, both the 20:05 and 22:05
      // runs took a 403 on that session and settled on the prior one, while a
      // manual probe the next afternoon got it fine. So this table lags the
      // market by a full session, and a consumer wanting "yesterday's breadth"
      // during today's session is actually reading the day before that.
      //
      // The 06:05 run exists to find out whether Polygon publishes overnight.
      // expected_market_date already resolves any hour before
      // MARKET_BREADTH_EOD_SETTLE_HOUR_ET to the previous session, so this fire
      // asks for D-1 with no code change; if Polygon has it, the row lands
      // before the 09:30 open, and if not the walk-back idempotently rewrites
      // D-2 and nothing is harmed. Read `settled on` in the log to tell which:
      // a morning line with no `skipping` means D-1 was available.
      cron_restart: '5 3,17,19 * * 1-5',
      env: {
        MARKET_BREADTH_EOD_SETTLE_HOUR_ET: '20',
        MARKET_BREADTH_EXCHANGES: 'XNAS,XNYS,XASE',
        MARKET_BREADTH_MIN_COUNT: '2000',
        MARKET_BREADTH_MIN_COVERAGE_PCT: '90',
        POLYGON_STOCK_REQUEST_DELAY: '16',
        POLYGON_PRICE_RATE_LIMIT_BACKOFF: '60',
        // The universe sweep hits /v3/reference/tickers, not grouped daily, and
        // is paced on its own `reference` scope. Measured 2026-08-15: grouped
        // daily rejects above ~5 req/min while reference sustained 20+ with no
        // 429 (ceiling untested, so 3s = 20/min stays at the measured floor
        // rather than probing past it). Measured over the three MICs: 7 requests
        // returning 5,319 symbols in 3.1s of network time, so the old shared
        // 16s spacing made that 112s -- 97% of it deliberate sleeping. Now 21s.
        POLYGON_REFERENCE_REQUEST_DELAY: '3',
        POLYGON_REFERENCE_RATE_LIMIT_BACKOFF: '60',
      },
    },
    {
      // Log rotation, scoped to LOG_DIR. Deliberately NOT `pm2 install
      // pm2-logrotate`: that module rotates every log PM2 manages with no way to
      // exclude an app, so installing it would change log behaviour for the
      // ib-bot and stock-alert workloads that live in other repositories.
      //
      // Hourly rather than daily because the size cap is only half the job. The
      // other half is noticing a log whose growth RATE jumps -- the failure this
      // replaces was quantrift-news-error.log reaching 683MB of ibapi protocol
      // chatter over ten days, unnoticed because it sat in a file named
      // *-error.log. A daily sample is too coarse to catch that early.
      ...logs('quantrift-log-rotate'),

      name: 'quantrift-log-rotate',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'rotate_logs.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '20 * * * *',
      env: {
        LOG_ROTATE_MAX_BYTES: String(50 * 1024 * 1024),
        LOG_ROTATE_KEEP: '7',
        LOG_ROTATE_ALERT_BYTES_PER_HOUR: String(20 * 1024 * 1024),
        QUANTRIFT_LOG_DIR: LOG_DIR,
      },
    },
    {
      // Series-level integrity for market_breadth_daily, weekdays at 07:00 ET
      // (04:00 PT) -- after the morning breadth fire, before the open.
      //
      // The collector validates each row as it writes it. Nothing validates the
      // series, and breadth is a differenced quantity: a cumulative A/D line
      // sums each row's move against its stated previous close, so a
      // previous_market_date that skips or repeats a stored session makes the
      // running total drift while every individual row still looks correct. That
      // is invisible until someone plots it.
      //
      // Non-zero exit on a broken chain, so the PM2 log shows a failure rather
      // than a quiet line of JSON.
      ...logs('quantrift-breadth-verify'),

      name: 'quantrift-breadth-verify',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'verify_market_breadth.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '0 4 * * 1-5',
      env: {
        MARKET_BREADTH_MIN_COUNT: '2000',
        MARKET_BREADTH_MIN_COVERAGE_PCT: '90',
      },
    },
    {
      // Refreshes which symbols get IB quote time. Weekly is enough: the ranking
      // is option open interest, which moves slowly, and churning the list more
      // often would keep resetting each symbol's quote age.
      ...logs('quantrift-quote-watchlist'),

      name: 'quantrift-quote-watchlist',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'select_quote_watchlist.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '30 5 * * 0',
      env: {
        // 100 -> 250 (2026-08-15), after the option quote path was batched.
        //
        // The previous note said going beyond ~142 needed the quote lane
        // parallelised across client ids. That was true of the serial adapter
        // and wrong about the cause: the bottleneck was never the number of
        // client ids, it was that each one used a single market-data line out of
        // the ~100 IB allows. Batching subscriptions cut a measured A/B from
        // 249.5s to 14.4s for the same 40 contracts -- 17x -- so one client id
        // now covers more of the universe in a session than the old design could
        // with several.
        //
        // At ~65s/symbol a 390-minute session reaches ~361 symbols, above the
        // 327 currently scan_enabled, and that estimate is the closed-market
        // worst case where every batch waits out its full window; with quotes
        // streaming, batches exit early. 250 keeps headroom for retries and for
        // the universe growing rather than running to the edge of the estimate.
        QUOTE_WATCHLIST_TARGET: '250',
      },
    },
    {
      // Fills the quotes lane. `quantrift-options-quote-worker` has been online
      // and idle since 2026-08-03 (101,264 lines of "No queued refresh jobs in
      // quotes lane") because nothing ever enqueued for it: the 2026-07-30
      // positioning/pricing isolation removed the IB fallback that had been the
      // only mechanism producing executable quotes at scale, and quoted coverage
      // decayed from ~55 symbols to 1.
      //
      // Every 10 min, 07:00-12:59 PT weekdays = 10:00-15:59 ET, i.e. the session
      // minus its first half hour. This is a top-up, not a sweep: IB is serial at
      // ~2 min/symbol so 50 symbols need ~100 minutes of worker time, far more
      // than one cron fire can enqueue. Each run refills the queue to
      // QUOTE_REFRESH_QUEUE_TARGET and the always-on worker drains it, so the
      // list is covered across the session rather than in one pass.
      //
      // There is deliberately no post-close run. Outside the regular session
      // there is no quote stream, so IB does not fail fast -- it waits out
      // IB_OPTION_STREAM_TIMEOUT on each of up to 240 contracts and returns
      // nothing (measured 2026-08-09: one symbol still running at 197s, on track
      // for the full ~16 minutes). The scheduler enforces this itself, so a
      // misconfigured cron cannot reintroduce it. The last in-session run near
      // 15:59 ET is what produces closing-quality quotes.
      ...logs('quantrift-quote-refresh'),

      name: 'quantrift-quote-refresh',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'schedule_quote_refresh.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '*/10 7-12 * * 1-5',
      env: {
        QUOTE_REFRESH_QUEUE_TARGET: '4',
        QUOTE_REFRESH_PRIORITY: '30',
        QUOTE_REFRESH_MAX_AGE_MINUTES: '360',
      },
    },
    {
      ...logs('quantrift-reddit-trends'),

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
      ...logs('quantrift-unusual-whales-flow'),

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
      ...logs('quantrift-news'),

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
      ...logs('quantrift-backup-facts'),

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
        // Was defaulting to ~/quantrift-backups on the boot disk while an
        // identically-named set was already accumulating on X9_Pro -- two copies
        // of the same 14 runs, neither obviously canonical. The external volume
        // is the one with history, so it wins. If X9_Pro is unmounted the run
        // fails or writes to a shadowed boot-disk path; either way a missed
        // backup is recoverable, since every table here is reproducible from
        // Railway. Rotation still keeps FACT_BACKUP_KEEP runs.
        FACT_BACKUP_DIR: `${DATA_ROOT}/fact-backups`,
      },
    },
    {
      ...logs('quantrift-universe-metadata'),

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
    {
      // FINRA short interest/volume, redistributed by Polygon. Runs BEFORE the
      // squeeze capture so the capture finds settled figures already in place;
      // it also back-fills days_to_cover onto today's unresolved rows itself,
      // so ordering is a convenience rather than a correctness requirement.
      // 13:20 PT = 16:20 ET, after the close and after short-volume's T+1 post.
      ...logs('quantrift-short-interest'),

      name: 'quantrift-short-interest',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_short_interest.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '20 13 * * 1-5',
      env: {
        // Bypass path: this does not use the shared provider_rate_limits gate,
        // so it carries its own backoff. The full-market endpoints 429 within a
        // couple of pages without it.
        SHORT_DATA_PAGE_DELAY_SECONDS: '1.5',
        SHORT_INTEREST_LOOKBACK_DAYS: '60',
        SHORT_VOLUME_LOOKBACK_DAYS: '10',
      },
    },
    {
      // Captures the observable squeeze-relevant chain state once per session
      // and scores nothing -- every threshold worth applying is still a guess,
      // and calibration needs samples that only accumulate forward. Reads the
      // wide oi_by_strike map, which the 7-day chain prune destroys, so a
      // missed run is a permanent hole in the sample rather than a delay.
      // 13:40 PT = 16:40 ET, after the last in-session option refresh lands.
      ...logs('quantrift-squeeze-watch'),

      name: 'quantrift-squeeze-watch',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'capture_squeeze_watch.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '40 13 * * 1-5',
      env: {
        SQUEEZE_UPSIDE_WINDOW_PCT: '10',
        SQUEEZE_MIN_CALL_OI_ABOVE: '100',
      },
    },
    {
      // Shortable-share availability from IB. Cost-to-borrow is the measure a
      // squeeze read wants and nothing we hold carries it, but availability is
      // the same scarcity from the other side, and the signal is its trend --
      // so this has to start accumulating before anyone asks the question.
      // Serial by nature (one contract at a time on a single client id);
      // measured at 2m34s for 198 symbols, so 14:00 PT leaves the session clear.
      ...logs('quantrift-borrow-availability'),

      name: 'quantrift-borrow-availability',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'collect_borrow_availability.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '0 14 * * 1-5',
      env: {
        // Its own client id: 42 is the option chain, 12 price, 55 news, and 96
        // belongs to the other project sharing this gateway.
        IB_BORROW_CLIENT_ID: '44',
        IB_BORROW_SYMBOL_TIMEOUT: '4',
        BORROW_SYMBOL_LIMIT: '400',
      },
    },
    {
      // Settlement-date marks for multi-expiry candidates (diagonals/calendars).
      // Their far leg outlives the settlement expiry and has to be closed at a
      // market price on that one date -- the chain snapshot is pruned within 7
      // days and a later quote belongs to a different day, so a missed run
      // makes those rows unscoreable permanently, not merely late.
      //
      // 12:45 PT = 15:45 ET, INSIDE the session and deliberately not after it.
      // The first pass reads the day's own persisted snapshots and would prefer
      // to run as late as possible; the second quotes the gap from IB and needs
      // a live quote stream, which after 16:00 ET does not exist -- IB then
      // burns its per-contract timeout and returns nothing. 15:45 is the latest
      // point where both passes work: the intraday quote sweep has been running
      // since 10:00 ET, and a mark observed at 15:45 is an honest executable
      // price on the settlement date, which is all this ever claims.
      ...logs('quantrift-ledger-far-leg-marks'),

      name: 'quantrift-ledger-far-leg-marks',
      cwd: '/Users/congrenhan/Documents/quantrift_options-lab/collector',
      script: 'capture_ledger_far_leg_marks.py',
      interpreter: '/Users/congrenhan/Documents/quantrift_options-lab/collector/venv311/bin/python',
      autorestart: false,
      cron_restart: '45 12 * * 1-5',
      env: {
        // Its own client id: 42 option chain, 12 price, 55 news, 44 borrow,
        // 96 belongs to the other project on this gateway.
        LEDGER_MARKS_IB_CLIENT_ID: '46',
      },
    },
  ],
};
