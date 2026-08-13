const express = require('express');
const pool = require('../db');
const { deriveMfi } = require('./supportResistance');
const { buildBreadth, buildBroadMarketBreadth } = require('../domain/market/breadth');
const { buildBriefing } = require('../domain/market/briefing');
const { deriveMomentum, deriveMarketRegime } = require('../domain/market/regime');
const {
  buildSectorRotation,
  ROTATION_BENCHMARK,
  SECTOR_ETFS,
} = require('../domain/market/sectorRotation');
const {
  buildStateMatrix,
  classifyState,
  STATE_META,
  STATE_THRESHOLDS,
} = require('../domain/market/stateMatrix');
const { buildPositioning } = require('../domain/market/positioning');
const { isoDate, number, percentile } = require('../lib/values');

const router = express.Router();

async function loadBroadMarketBreadth() {
  try {
    const result = await pool.query(`
      SELECT market_date, previous_market_date, reference_count, universe_count,
             counted, missing_previous_count, coverage_pct,
             advances, declines, unchanged, advance_pct, decline_pct, unchanged_pct,
             net_advances, advance_decline_ratio,
             volume_counted, advancing_volume, declining_volume, unchanged_volume,
             advancing_volume_pct, declining_volume_pct,
             exchange_breakdown, collected_at
      FROM market_breadth_daily
      ORDER BY market_date DESC
      LIMIT 30
    `);
    return buildBroadMarketBreadth(result.rows);
  } catch (error) {
    // Additive deployment safety: the existing options-native panel must remain
    // available between the API deploy and the one-time schema migration.
    if (error.code === '42P01') return { status: 'missing' };
    throw error;
  }
}

async function sendMarketRegime(req, res) {
  const symbols = ['SPY', 'QQQ'];
  try {
    const [dailyResult, intradayResult, gexResult, metricsResult] = await Promise.all([
      pool.query(`SELECT symbol, date, close FROM price_history WHERE symbol = ANY($1) ORDER BY symbol, date ASC`, [symbols]),
      pool.query(`SELECT symbol, bar_ts, high, low, close, volume, source FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bar_ts DESC) rank
        FROM price_history_30m WHERE symbol = ANY($1)
          AND (bar_ts AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
          AND (bar_ts AT TIME ZONE 'America/New_York')::time < TIME '16:00'
      ) bars WHERE rank <= 60 ORDER BY symbol, bar_ts ASC`, [symbols]),
      pool.query(`SELECT DISTINCT ON (symbol) symbol, snapshot_ts, source, global_gex, gamma_regime, call_wall, put_wall, confidence
        FROM gex_snapshots WHERE symbol = ANY($1) ORDER BY symbol, snapshot_ts DESC`, [symbols]),
      pool.query(`SELECT DISTINCT ON (symbol) symbol, date, iv_rank FROM iv_history WHERE symbol = ANY($1) ORDER BY symbol, date DESC`, [symbols]),
    ]);
    const bySymbol = symbols.map(symbol => {
      const gex = gexResult.rows.find(row => row.symbol === symbol) || null;
      const metric = metricsResult.rows.find(row => row.symbol === symbol) || null;
      const intraday = intradayResult.rows.filter(row => row.symbol === symbol);
      return {
        symbol,
        momentum: deriveMomentum(dailyResult.rows.filter(row => row.symbol === symbol), intraday),
        gex: gex ? {
          regime: gex.gamma_regime,
          gamma_regime: gex.gamma_regime,
          global_gex: number(gex.global_gex),
          call_wall: number(gex.call_wall),
          put_wall: number(gex.put_wall),
          confidence: gex.confidence,
          source: gex.source,
          snapshot_ts: gex.snapshot_ts,
        } : null,
        iv_rank: number(metric?.iv_rank),
        iv_date: metric?.date ? isoDate(metric.date) : null,
        intraday_source: intraday.at(-1)?.source || null,
      };
    });
    return res.json({ status: 'ready', regime: deriveMarketRegime(bySymbol), instruments: bySymbol });
  } catch (error) {
    console.error('GET /api/market/regime error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function loadBreadth() {
  const [trendResult, gammaResult, ivResult, broadMarket] = await Promise.all([
      // Latest close vs MA50/MA200 per scan-enabled symbol, computed in SQL.
      pool.query(`
        WITH universe AS (
          SELECT symbol FROM symbol_universe WHERE scan_enabled = TRUE
        ),
        recent AS (
          SELECT p.symbol, p.close,
                 ROW_NUMBER() OVER (PARTITION BY p.symbol ORDER BY p.date DESC) AS rn
          FROM price_history p
          JOIN universe u ON u.symbol = p.symbol
          WHERE p.source = 'polygon_licensed' AND p.close IS NOT NULL
        )
        SELECT symbol,
               MAX(close) FILTER (WHERE rn = 1) AS latest,
               AVG(close) FILTER (WHERE rn <= 50) AS ma50,
               AVG(close) FILTER (WHERE rn <= 200) AS ma200,
               COUNT(*) AS bars
        FROM recent
        GROUP BY symbol
      `),
      // Latest GEX per scan-enabled symbol: gamma regime + PCR.
      pool.query(`
        SELECT DISTINCT ON (g.symbol) g.symbol, g.snapshot_ts, g.gamma_regime, g.pcr_oi
        FROM gex_snapshots g
        JOIN symbol_universe u ON u.symbol = g.symbol AND u.scan_enabled = TRUE
        ORDER BY g.symbol, g.snapshot_ts DESC
      `),
      // Latest derived IV rank per scan-enabled symbol (ready rows only).
      pool.query(`
        SELECT DISTINCT ON (v.symbol) v.symbol, v.metric_date, v.iv_rank
        FROM volatility_history v
        JOIN symbol_universe u ON u.symbol = v.symbol AND u.scan_enabled = TRUE
        WHERE v.iv_rank IS NOT NULL
        ORDER BY v.symbol, v.metric_date DESC
      `),
      loadBroadMarketBreadth(),
    ]);

    const trendRows = trendResult.rows.map(r => ({
      latest: number(r.latest), ma50: number(r.ma50), ma200: number(r.ma200), bars: Number(r.bars),
    }));
    const gammaRows = gammaResult.rows.map(r => ({
      gamma_regime: r.gamma_regime, pcr_oi: number(r.pcr_oi),
    }));
    const ivRanks = ivResult.rows.map(r => number(r.iv_rank));

    const newestGex = gammaResult.rows.reduce((max, r) => {
      const ts = r.snapshot_ts ? new Date(r.snapshot_ts).getTime() : 0;
      return ts > max ? ts : max;
    }, 0);

  const breadth = buildBreadth(trendRows, gammaRows, ivRanks);
  return {
    status: trendRows.length || gammaRows.length || ivRanks.length || broadMarket.status === 'ready'
      ? 'ready'
      : 'missing',
    universe_count: new Set([
      ...trendResult.rows.map(r => r.symbol),
      ...gammaResult.rows.map(r => r.symbol),
      ...ivResult.rows.map(r => r.symbol),
    ]).size,
    gamma_as_of: newestGex ? new Date(newestGex).toISOString() : null,
    broad_market: broadMarket,
    ...breadth,
  };
}

async function sendMarketBreadth(req, res) {
  try {
    return res.json(await loadBreadth());
  } catch (error) {
    console.error('GET /api/market/breadth error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function loadStateMatrix() {
  const [signalResult, gammaResult, ivResult] = await Promise.all([
      pool.query(`
        WITH universe AS (SELECT symbol FROM symbol_universe WHERE scan_enabled = TRUE),
        recent AS (
          SELECT p.symbol, p.close, p.volume,
                 ROW_NUMBER() OVER (PARTITION BY p.symbol ORDER BY p.date DESC) AS rn
          FROM price_history p JOIN universe u ON u.symbol = p.symbol
          WHERE p.source = 'polygon_licensed' AND p.close IS NOT NULL
        )
        SELECT symbol,
               MAX(close) FILTER (WHERE rn = 1)  AS close,
               MAX(close) FILTER (WHERE rn = 6)  AS close5,
               MAX(close) FILTER (WHERE rn = 21) AS close20,
               AVG(close) FILTER (WHERE rn <= 50)  AS ma50,
               AVG(close) FILTER (WHERE rn <= 200) AS ma200,
               MAX(close) FILTER (WHERE rn BETWEEN 2 AND 21) AS hi20,
               MAX(volume) FILTER (WHERE rn = 1) AS vol1,
               AVG(volume) FILTER (WHERE rn BETWEEN 2 AND 21) AS avgvol20,
               COUNT(*) AS bars
        FROM recent GROUP BY symbol
      `),
      pool.query(`
        SELECT DISTINCT ON (g.symbol) g.symbol, g.gamma_regime
        FROM gex_snapshots g
        JOIN symbol_universe u ON u.symbol = g.symbol AND u.scan_enabled = TRUE
        ORDER BY g.symbol, g.snapshot_ts DESC
      `),
      pool.query(`
        SELECT DISTINCT ON (v.symbol) v.symbol, v.iv_rank
        FROM volatility_history v
        JOIN symbol_universe u ON u.symbol = v.symbol AND u.scan_enabled = TRUE
        WHERE v.iv_rank IS NOT NULL
        ORDER BY v.symbol, v.metric_date DESC
      `),
    ]);

    const gammaBy = new Map(gammaResult.rows.map(r => [r.symbol, r.gamma_regime]));
    const ivBy = new Map(ivResult.rows.map(r => [r.symbol, number(r.iv_rank)]));

    const rows = signalResult.rows.map(r => {
      const close = number(r.close);
      const ma50 = number(r.ma50);
      const close5 = number(r.close5);
      const close20 = number(r.close20);
      const vol1 = number(r.vol1);
      const avgvol20 = number(r.avgvol20);
      const bars = Number(r.bars);
      return {
        symbol: r.symbol,
        close,
        ma50: bars >= 50 ? ma50 : null,
        ma200: bars >= 200 ? number(r.ma200) : null,
        ret5: close != null && close5 ? (close / close5 - 1) * 100 : null,
        ret20: close != null && close20 ? (close / close20 - 1) * 100 : null,
        ext50: close != null && ma50 ? (close / ma50 - 1) * 100 : null,
        hi20: number(r.hi20),
        rvol: vol1 != null && avgvol20 ? vol1 / avgvol20 : null,
        gammaRegime: gammaBy.get(r.symbol) ?? null,
        ivRank: ivBy.get(r.symbol) ?? null,
      };
    });

  const { distribution, symbols } = buildStateMatrix(rows);
  return {
    status: symbols.length ? 'ready' : 'missing',
    universe_count: symbols.length,
    thresholds: STATE_THRESHOLDS,
    states: STATE_META,
    distribution,
    symbols,
  };
}

async function sendMarketStateMatrix(req, res) {
  try {
    return res.json(await loadStateMatrix());
  } catch (error) {
    console.error('GET /api/market/state-matrix error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function loadSectorRotation() {
  const symbols = [...Object.keys(SECTOR_ETFS), ROTATION_BENCHMARK];
  const [signalResult, gammaResult, ivResult, barsResult] = await Promise.all([
      pool.query(`
        WITH recent AS (
          SELECT p.symbol, p.close,
                 ROW_NUMBER() OVER (PARTITION BY p.symbol ORDER BY p.date DESC) AS rn
          FROM price_history p
          WHERE p.source = 'polygon_licensed' AND p.close IS NOT NULL AND p.symbol = ANY($1)
        )
        SELECT symbol,
               MAX(close) FILTER (WHERE rn = 1)  AS close,
               MAX(close) FILTER (WHERE rn = 6)  AS close5,
               MAX(close) FILTER (WHERE rn = 21) AS close20,
               AVG(close) FILTER (WHERE rn <= 50) AS ma50,
               COUNT(*) AS bars
        FROM recent GROUP BY symbol
      `, [symbols]),
      pool.query(`SELECT DISTINCT ON (symbol) symbol, gamma_regime FROM gex_snapshots WHERE symbol = ANY($1) ORDER BY symbol, snapshot_ts DESC`, [symbols]),
      pool.query(`SELECT DISTINCT ON (symbol) symbol, iv_rank FROM volatility_history WHERE symbol = ANY($1) AND iv_rank IS NOT NULL ORDER BY symbol, metric_date DESC`, [symbols]),
      // Recent OHLCV for a money-flow read (MFI) per ETF -- the "flow" dimension.
      pool.query(`
        SELECT symbol, date, high, low, close, volume FROM (
          SELECT symbol, date, high, low, close, volume,
                 ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
          FROM price_history
          WHERE source = 'polygon_licensed' AND symbol = ANY($1) AND volume IS NOT NULL
        ) x WHERE rn <= 16 ORDER BY symbol, date ASC
      `, [symbols]),
    ]);

    const gammaBy = new Map(gammaResult.rows.map(r => [r.symbol, r.gamma_regime]));
    const ivBy = new Map(ivResult.rows.map(r => [r.symbol, number(r.iv_rank)]));
    const barsBy = new Map();
    for (const b of barsResult.rows) {
      if (!barsBy.has(b.symbol)) barsBy.set(b.symbol, []);
      barsBy.get(b.symbol).push(b);
    }
    const mfiBy = new Map();
    for (const [sym, bars] of barsBy) {
      const m = deriveMfi(bars);
      mfiBy.set(sym, m.status === 'ready' ? m.value : null);
    }
    const rows = signalResult.rows.map(r => {
      const close = number(r.close);
      const close5 = number(r.close5);
      const close20 = number(r.close20);
      return {
        symbol: r.symbol,
        close,
        ma50: Number(r.bars) >= 50 ? number(r.ma50) : null,
        ret5: close != null && close5 ? (close / close5 - 1) * 100 : null,
        ret20: close != null && close20 ? (close / close20 - 1) * 100 : null,
        ivRank: ivBy.get(r.symbol) ?? null,
        gammaRegime: gammaBy.get(r.symbol) ?? null,
        mfi: mfiBy.get(r.symbol) ?? null,
      };
    });

  return buildSectorRotation(rows);
}

async function sendSectorRotation(req, res) {
  try {
    return res.json(await loadSectorRotation());
  } catch (error) {
    console.error('GET /api/market/sector-rotation error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function sendMarketBriefing(req, res) {
  try {
    const [breadth, stateMatrix, rotation, regimeRes, earningsRes, unusualRes] = await Promise.all([
      loadBreadth(),
      loadStateMatrix(),
      loadSectorRotation(),
      pool.query(`SELECT DISTINCT ON (symbol) symbol, gamma_regime FROM gex_snapshots WHERE symbol IN ('SPY','QQQ') ORDER BY symbol, snapshot_ts DESC`),
      pool.query(`
        SELECT symbol, earnings_date FROM (
          SELECT DISTINCT ON (symbol) symbol, earnings_date
          FROM iv_history WHERE earnings_date IS NOT NULL
          ORDER BY symbol, date DESC
        ) latest
        WHERE earnings_date >= (NOW() AT TIME ZONE 'America/New_York')::date
          AND earnings_date <= (NOW() AT TIME ZONE 'America/New_York')::date + 7
        ORDER BY earnings_date ASC
      `),
      pool.query(`
        SELECT symbol, SUM(ABS(oi_delta)) AS abs_oi
        FROM option_oi_delta_snapshots
        WHERE created_at > NOW() - INTERVAL '1 day' AND status = 'confirmed' AND oi_delta IS NOT NULL
        GROUP BY symbol ORDER BY abs_oi DESC LIMIT 8
      `),
    ]);

    const gammaBy = new Map(regimeRes.rows.map(r => [r.symbol, r.gamma_regime]));
    const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const briefing = buildBriefing({
      dateLabel,
      breadth,
      stateMatrix,
      rotation,
      spyGamma: gammaBy.get('SPY') ?? null,
      qqqGamma: gammaBy.get('QQQ') ?? null,
      earnings: earningsRes.rows.map(r => ({ symbol: r.symbol, date: isoDate(r.earnings_date) })),
      unusual: unusualRes.rows.map(r => ({ symbol: r.symbol, abs_oi: Number(r.abs_oi) })),
    });
    return res.json({ status: 'ready', ...briefing });
  } catch (error) {
    console.error('GET /api/market/briefing error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

// This is deliberately separate from the rolling seven-day briefing callout.
// The source supplies a date only, so report timing is never inferred.
async function sendEarningsThisWeek(req, res) {
  try {
    const weekOffset = req.query?.week === 'next' ? 1 : 0;
    const result = await pool.query(`
      WITH week_bounds AS (
        SELECT (date_trunc('week', NOW() AT TIME ZONE 'America/New_York')::date + ($1::int * 7)) AS week_start
      ), latest_earnings AS (
        SELECT DISTINCT ON (v.symbol) v.symbol, v.earnings_date
        FROM iv_history v
        WHERE v.earnings_date IS NOT NULL
        ORDER BY v.symbol, v.date DESC
      )
      SELECT e.symbol, u.name, u.metadata->>'branding_icon_url' AS icon_url,
             e.earnings_date, b.week_start, (b.week_start + 4) AS week_end
      FROM week_bounds b
      LEFT JOIN latest_earnings e ON e.earnings_date >= b.week_start
        AND e.earnings_date < b.week_start + 5
      LEFT JOIN symbol_universe u ON u.symbol = e.symbol
        AND u.active = TRUE AND u.scan_enabled = TRUE
      WHERE e.symbol IS NULL OR u.symbol IS NOT NULL
      ORDER BY e.earnings_date ASC NULLS LAST, e.symbol ASC
    `, [weekOffset]);
    const bounds = result.rows[0];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    return res.json({
      status: 'ready',
      week: weekOffset === 1 ? 'next' : 'current',
      week_start: bounds ? isoDate(bounds.week_start) : null,
      week_end: bounds ? isoDate(bounds.week_end) : null,
      today,
      earnings: result.rows.filter(row => row.symbol).map(row => ({
        symbol: row.symbol,
        name: row.name || null,
        icon_url: row.icon_url || null,
        date: isoDate(row.earnings_date),
      })),
    });
  } catch (error) {
    console.error('GET /api/market/earnings-this-week error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/regime', sendMarketRegime);
router.get('/breadth', sendMarketBreadth);
async function loadPositioning() {
  // Latest captured market date only. squeeze_watch holds one row per symbol
  // per date, so serving "the newest date present" avoids mixing sessions on a
  // day the capture has not run yet.
  let result;
  try {
    result = await pool.query(`
      SELECT w.symbol, w.market_date, w.spot, w.top_strike,
             w.distance_to_top_strike_pct, w.call_oi_above, w.put_oi_above,
             w.concentration, w.call_put_ratio_above, w.unusual_oi_count,
             w.days_to_cover, w.gex_confidence,
             b.fee_rate, b.shortable_shares
      FROM squeeze_watch w
      JOIN symbol_universe u ON u.symbol = w.symbol
      -- Borrow cost is the only input here that moves daily; short interest
      -- settles fortnightly and lands a week late. Its own latest date is used
      -- rather than the squeeze date so a day the borrow capture missed shows
      -- the last real reading instead of a hole.
      LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, fee_rate, shortable_shares
        FROM borrow_availability_history
        WHERE fee_rate IS NOT NULL
        ORDER BY symbol, market_date DESC
      ) b ON b.symbol = w.symbol
      WHERE w.market_date = (SELECT MAX(market_date) FROM squeeze_watch)
        -- Common stock only. ETF creation/redemption keeps supply elastic and
        -- market makers hold a naked-short exemption, so an ETF's positioning
        -- does not carry the same meaning and its short interest routinely
        -- exceeds 100% of shares outstanding.
        AND u.asset_type = 'stock'
        AND w.call_oi_above >= $1
        AND w.distance_to_top_strike_pct IS NOT NULL
        AND w.distance_to_top_strike_pct <= $2
      ORDER BY w.call_oi_above DESC
      LIMIT $3
    `, [
      Number(process.env.POSITIONING_MIN_CALL_OI ?? 5000),
      Number(process.env.POSITIONING_MAX_GAP_PCT ?? 10),
      Number(process.env.POSITIONING_LIMIT ?? 25),
    ]);
  } catch (error) {
    // Additive deployment safety, same as broad-market breadth: the API may be
    // live before the one-time migration runs.
    if (error.code === '42P01') return { status: 'missing', calibrated: false, counted: 0, rows: [] };
    throw error;
  }
  const marketDate = result.rows.length ? isoDate(result.rows[0].market_date) : null;
  return buildPositioning(result.rows, { marketDate });
}

async function sendMarketPositioning(req, res) {
  try {
    return res.json(await loadPositioning());
  } catch (error) {
    console.error('GET /api/market/positioning error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/state-matrix', sendMarketStateMatrix);
router.get('/positioning', sendMarketPositioning);
router.get('/sector-rotation', sendSectorRotation);
router.get('/briefing', sendMarketBriefing);
router.get('/earnings-this-week', sendEarningsThisWeek);

module.exports = {
  router, deriveMomentum, deriveMarketRegime, sendMarketRegime,
  buildBreadth, buildBroadMarketBreadth, percentile, sendMarketBreadth,
  classifyState, buildStateMatrix, sendMarketStateMatrix, STATE_META, STATE_THRESHOLDS,
  buildSectorRotation, sendSectorRotation, SECTOR_ETFS,
  buildBriefing, sendMarketBriefing, sendEarningsThisWeek,
  buildPositioning, sendMarketPositioning,
};
