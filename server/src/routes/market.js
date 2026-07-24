const express = require('express');
const pool = require('../db');

const router = express.Router();

function number(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  return value?.toISOString?.().slice(0, 10) || String(value || '').slice(0, 10);
}

function newYorkDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values, p) {
  const clean = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const idx = (clean.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return clean[lo];
  return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
}

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : null;
}

/**
 * Options-native market breadth (R2.2). Pure so the aggregation is unit-tested.
 * Inputs are latest-per-symbol arrays over the scan universe:
 *  - trendRows: { latest, ma50, ma200, bars }
 *  - gammaRows: { gamma_regime, pcr_oi }
 *  - ivRanks:   number[]  (iv_rank per symbol, 0-100)
 * Percentages are share of the symbols that actually had that datum, disclosed
 * via each block's `counted`, so a thin product does not silently read as broad.
 */
function buildBreadth(trendRows, gammaRows, ivRanks) {
  const ma50able = trendRows.filter(r => r.latest != null && r.ma50 != null && r.bars >= 50);
  const ma200able = trendRows.filter(r => r.latest != null && r.ma200 != null && r.bars >= 200);
  const gammaKnown = gammaRows.filter(r => r.gamma_regime);
  const pcrs = gammaRows.map(r => r.pcr_oi).filter(v => v != null && Number.isFinite(v));
  const ranks = ivRanks.filter(v => v != null && Number.isFinite(v));

  return {
    trend: {
      above_ma50_pct: pct(ma50able.filter(r => r.latest >= r.ma50).length, ma50able.length),
      above_ma200_pct: pct(ma200able.filter(r => r.latest >= r.ma200).length, ma200able.length),
      counted_ma50: ma50able.length,
      counted_ma200: ma200able.length,
    },
    gamma: {
      positive_pct: pct(gammaKnown.filter(r => r.gamma_regime === 'positive').length, gammaKnown.length),
      negative_pct: pct(gammaKnown.filter(r => r.gamma_regime === 'negative').length, gammaKnown.length),
      neutral_pct: pct(gammaKnown.filter(r => r.gamma_regime !== 'positive' && r.gamma_regime !== 'negative').length, gammaKnown.length),
      counted: gammaKnown.length,
    },
    iv_rank: {
      median: percentile(ranks, 0.5),
      p25: percentile(ranks, 0.25),
      p75: percentile(ranks, 0.75),
      elevated_pct: pct(ranks.filter(v => v >= 50).length, ranks.length),
      counted: ranks.length,
    },
    pcr: {
      median: percentile(pcrs, 0.5),
      p25: percentile(pcrs, 0.25),
      p75: percentile(pcrs, 0.75),
      counted: pcrs.length,
    },
  };
}

function deriveMomentum(dailyRows, intradayRows) {
  const daily = dailyRows.map(row => ({ close: number(row.close), date: isoDate(row.date) })).filter(row => row.close != null);
  const intraday = intradayRows.map(row => ({
    ts: row.bar_ts,
    high: number(row.high),
    low: number(row.low),
    close: number(row.close),
    volume: number(row.volume) || 0,
  })).filter(row => row.high != null && row.low != null && row.close != null);
  if (daily.length < 20) return { status: 'missing', reason: 'requires_20_daily_bars' };

  const closes = daily.map(row => row.close);
  const latest = closes.at(-1);
  const ma20 = average(closes.slice(-20));
  const ma50 = closes.length >= 50 ? average(closes.slice(-50)) : null;
  const change5d = closes.length >= 6 ? ((latest / closes.at(-6)) - 1) * 100 : null;
  let dailyScore = 50 + (latest >= ma20 ? 15 : -15);
  if (ma50 != null) dailyScore += latest >= ma50 ? 10 : -10;
  if (change5d != null) dailyScore += Math.max(-15, Math.min(15, change5d * 3));
  dailyScore = Math.max(0, Math.min(100, Math.round(dailyScore)));

  let breakout = { status: 'missing', direction: 'none', reason: 'requires_21_30m_bars' };
  let intradayScore = 50;
  if (intraday.length >= 21) {
    const current = intraday.at(-1);
    const prior = intraday.slice(-21, -1);
    const priorHigh = Math.max(...prior.map(row => row.high));
    const priorLow = Math.min(...prior.map(row => row.low));
    const avgVolume = average(prior.map(row => row.volume).filter(value => value > 0));
    const volumeRatio = avgVolume ? current.volume / avgVolume : null;
    const up = current.close > priorHigh;
    const down = current.close < priorLow;
    const confirmed = (up || down) && volumeRatio != null && volumeRatio >= 1.2;
    const stale = newYorkDate(current.ts) !== daily.at(-1).date;
    breakout = {
      status: stale ? 'stale' : 'ready',
      direction: !stale && confirmed ? (up ? 'up' : 'down') : 'none',
      candidate_direction: up ? 'up' : down ? 'down' : 'none',
      confirmed: !stale && confirmed,
      close: current.close,
      prior_high: priorHigh,
      prior_low: priorLow,
      volume_ratio: volumeRatio,
      bar_ts: current.ts,
      market_date: newYorkDate(current.ts),
      rule: 'close outside prior 20 bars and volume ratio >= 1.2',
    };
    intradayScore = confirmed ? (up ? 80 : 20) : current.close >= average(prior.map(row => row.close)) ? 60 : 40;
  }

  return {
    status: 'ready',
    score: Math.round(dailyScore * 0.65 + intradayScore * 0.35),
    daily_score: dailyScore,
    intraday_score: intradayScore,
    latest_date: daily.at(-1).date,
    change_5d: change5d,
    ma20,
    ma50,
    breakout_30m: breakout,
  };
}

function deriveMarketRegime(instruments) {
  const ready = instruments.filter(item => item.momentum?.status === 'ready');
  if (!ready.length) return { status: 'missing', label: '数据不足', score: null };
  const score = Math.round(average(ready.map(item => item.momentum.score)));
  const negativeGamma = ready.filter(item => item.gex?.gamma_regime === 'negative').length;
  const highIv = ready.filter(item => number(item.iv_rank) >= 70).length;
  const adjusted = Math.max(0, Math.min(100, score - negativeGamma * 5 - highIv * 3));
  return {
    status: 'ready',
    score: adjusted,
    label: adjusted >= 65 ? 'Risk-on' : adjusted <= 35 ? 'Risk-off' : 'Mixed',
    negative_gamma_count: negativeGamma,
    high_iv_count: highIv,
  };
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
  const [trendResult, gammaResult, ivResult] = await Promise.all([
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
    status: trendRows.length || gammaRows.length || ivRanks.length ? 'ready' : 'missing',
    universe_count: new Set([
      ...trendResult.rows.map(r => r.symbol),
      ...gammaResult.rows.map(r => r.symbol),
      ...ivResult.rows.map(r => r.symbol),
    ]).size,
    gamma_as_of: newestGex ? new Date(newestGex).toISOString() : null,
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

// ---- Symbol State Matrix (R1.1) ----
// Ordered so the frontend can render buckets in a stable, meaningful sequence.
const STATE_META = [
  { id: 'S1', label: '强势上行', tone: 'bull' },
  { id: 'S2', label: '上行·回调中', tone: 'bull-soft' },
  { id: 'S3', label: '区间突破', tone: 'bull' },
  { id: 'S6', label: '区间/中性', tone: 'neutral' },
  { id: 'S4', label: '下行·企稳试探', tone: 'bear-soft' },
  { id: 'S5', label: '空头', tone: 'bear' },
  { id: 'S0', label: '高波动/事件', tone: 'warn' },
  { id: 'insufficient', label: '数据不足', tone: 'muted' },
];

const STATE_THRESHOLDS = {
  ivrHigh: Number(process.env.STATE_IVR_HIGH ?? 80),
  rvolSpike: Number(process.env.STATE_RVOL_SPIKE ?? 2.5),
  rvolBreakout: Number(process.env.STATE_RVOL_BREAKOUT ?? 1.5),
  extHigh: Number(process.env.STATE_EXT_HIGH ?? 3),
  // A pullback/stabilization must be a meaningful short-term move, not a -0.5%
  // day of noise — otherwise S2/S4 swallow every healthy trend on any down tick.
  momBand: Number(process.env.STATE_MOM_BAND ?? 1.5),
};

/**
 * Classify one symbol into a market state (R1.1). Pure and unit-tested.
 *
 * Structure-first, first-match-wins so states never overlap: a high-vol/volume
 * gate, then a fresh volume breakout, then up/down trend structure split into
 * extended-vs-pullback / capitulation-vs-stabilizing, then a neutral fallback.
 * Labels describe the market STATE, never prescribe an action (no entry/stop/
 * target) — this is a cross-sectional classification, not a buy/sell signal.
 * `gamma`/`ivRank` ride along as context; only ivRank/rvol gate S0.
 */
function classifyState(s, th = STATE_THRESHOLDS) {
  if (s.close == null || s.ma50 == null || s.ma200 == null) {
    return { state: 'insufficient', reasons: ['历史不足 200 根日线'] };
  }
  const reasons = [];
  const ivrHigh = s.ivRank != null && s.ivRank >= th.ivrHigh;
  const rvolSpike = s.rvol != null && s.rvol >= th.rvolSpike;
  if (ivrHigh || rvolSpike) {
    if (ivrHigh) reasons.push(`IV Rank ${Math.round(s.ivRank)} ≥ ${th.ivrHigh}`);
    if (rvolSpike) reasons.push(`RVol ${s.rvol.toFixed(1)}× ≥ ${th.rvolSpike}`);
    return { state: 'S0', reasons };
  }
  if (s.hi20 != null && s.close > s.hi20 && s.rvol != null && s.rvol >= th.rvolBreakout) {
    reasons.push(`收盘突破前 20 日高 ${s.hi20.toFixed(2)}`);
    reasons.push(`放量 RVol ${s.rvol.toFixed(1)}× ≥ ${th.rvolBreakout}`);
    return { state: 'S3', reasons };
  }
  const upStruct = s.close > s.ma200 && s.ma50 > s.ma200;
  const downStruct = s.close < s.ma200 && s.ma50 < s.ma200;
  if (upStruct) {
    const pulling = s.close < s.ma50 || (s.ret5 != null && s.ret5 <= -th.momBand);
    if (pulling) {
      reasons.push('多头结构 (价 > MA200, MA50 > MA200)');
      reasons.push(s.close < s.ma50 ? '回踩至 MA50 下方' : `5 日动量 ${s.ret5.toFixed(1)}% (回落)`);
      return { state: 'S2', reasons };
    }
    reasons.push('多头排列 (价 > MA50 > MA200)');
    if (s.ret20 != null) reasons.push(`20 日 ${s.ret20 >= 0 ? '+' : ''}${s.ret20.toFixed(1)}%`);
    if (s.ext50 != null && s.ext50 >= th.extHigh) reasons.push(`距 MA50 +${s.ext50.toFixed(1)}% (追高区)`);
    return { state: 'S1', reasons };
  }
  if (downStruct) {
    const stabilizing = s.close > s.ma50 || (s.ret5 != null && s.ret5 >= th.momBand);
    if (stabilizing) {
      reasons.push('空头结构 (价 < MA200, MA50 < MA200)');
      reasons.push(s.close > s.ma50 ? '重回 MA50 上方' : `5 日动量 +${s.ret5.toFixed(1)}% (反弹)`);
      return { state: 'S4', reasons };
    }
    reasons.push('空头排列 (价 < MA50 < MA200)');
    if (s.ret20 != null) reasons.push(`20 日 ${s.ret20.toFixed(1)}%`);
    return { state: 'S5', reasons };
  }
  reasons.push('MA 交织，无清晰趋势');
  return { state: 'S6', reasons };
}

/**
 * Assemble the state matrix from per-symbol signal rows (R1.1). Pure.
 * Each row: { symbol, close, ma50, ma200, ret5, ret20, ext50, hi20, rvol,
 * gammaRegime, ivRank }. Returns per-symbol classifications plus a distribution
 * count keyed by state id (every state present, zero-filled), so a bucket with
 * no members reads as 0, not missing.
 */
function buildStateMatrix(rows, th = STATE_THRESHOLDS) {
  const distribution = Object.fromEntries(STATE_META.map(s => [s.id, 0]));
  const symbols = rows.map(row => {
    const { state, reasons } = classifyState(row, th);
    distribution[state] = (distribution[state] || 0) + 1;
    return {
      symbol: row.symbol,
      state,
      reasons,
      iv_rank: row.ivRank,
      gamma_regime: row.gammaRegime,
      ext50: row.ext50,
      ret20: row.ret20,
      rvol: row.rvol,
    };
  });
  return { distribution, symbols };
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

// ---- Sector Rotation (R1.3, RRG-lite) ----
// Curated sector/theme ETFs used as rotation points. The symbol_universe SIC
// `sector` field is 65% null and never classifies ETFs, so a sector-ETF RRG vs
// SPY is both more honest and the canonical RRG. Each ETF IS its sector.
const SECTOR_ETFS = {
  XLK: { label: '科技', group: 'sector' },
  XLF: { label: '金融', group: 'sector' },
  XLE: { label: '能源', group: 'sector' },
  XLV: { label: '医疗', group: 'sector' },
  XLI: { label: '工业', group: 'sector' },
  XLY: { label: '可选消费', group: 'sector' },
  XLP: { label: '必需消费', group: 'sector' },
  XLU: { label: '公用事业', group: 'sector' },
  XLB: { label: '原材料', group: 'sector' },
  XLRE: { label: '房地产', group: 'sector' },
  XLC: { label: '通信服务', group: 'sector' },
  SMH: { label: '半导体', group: 'theme' },
  SOXX: { label: '半导体(SOXX)', group: 'theme' },
  IGV: { label: '软件', group: 'theme' },
  IBB: { label: '生物科技', group: 'theme' },
  GDX: { label: '金矿', group: 'theme' },
  GDXJ: { label: '小型金矿', group: 'theme' },
  IYR: { label: '地产(IYR)', group: 'theme' },
  VNQ: { label: '地产(VNQ)', group: 'theme' },
  ITB: { label: '住宅建筑', group: 'theme' },
  XHB: { label: '住宅建筑(XHB)', group: 'theme' },
  KIE: { label: '保险', group: 'theme' },
  IYT: { label: '运输', group: 'theme' },
  TAN: { label: '太阳能', group: 'theme' },
  ICLN: { label: '清洁能源', group: 'theme' },
  BOTZ: { label: '机器人/AI', group: 'theme' },
};

const ROTATION_BENCHMARK = process.env.ROTATION_BENCHMARK || 'SPY';

function round2(v) {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}

/**
 * Simplified RRG over sector/theme ETFs (R1.3). Pure and unit-tested.
 *
 * Relative strength `rs` = ETF 20-day return minus the benchmark's; momentum =
 * recent relative pace (`ret5 - bench.ret5`) minus the month's average per-5-day
 * relative pace (`rs / 4`), i.e. is the ETF's relative strength accelerating.
 * The (rs, momentum) sign pair maps to the four RRG quadrants. This is a
 * cross-sectional rotation snapshot, not a trade signal.
 */
function buildSectorRotation(rows, benchmarkSymbol = ROTATION_BENCHMARK) {
  const bySym = new Map(rows.map(r => [r.symbol, r]));
  const bench = bySym.get(benchmarkSymbol);
  if (!bench || bench.ret5 == null || bench.ret20 == null) {
    return { status: 'missing', reason: 'benchmark_unavailable', benchmark: benchmarkSymbol };
  }

  const quadrantCounts = { leading: 0, weakening: 0, improving: 0, lagging: 0 };
  const sectors = [];
  for (const [symbol, meta] of Object.entries(SECTOR_ETFS)) {
    const r = bySym.get(symbol);
    if (!r || r.ret5 == null || r.ret20 == null) continue;
    const rs = r.ret20 - bench.ret20;
    const momentum = (r.ret5 - bench.ret5) - rs / 4;
    const quadrant = rs >= 0
      ? (momentum >= 0 ? 'leading' : 'weakening')
      : (momentum >= 0 ? 'improving' : 'lagging');
    quadrantCounts[quadrant] += 1;
    sectors.push({
      symbol,
      label: meta.label,
      group: meta.group,
      rs: round2(rs),
      momentum: round2(momentum),
      quadrant,
      ret20: round2(r.ret20),
      ret5: round2(r.ret5),
      iv_rank: r.ivRank,
      gamma_regime: r.gammaRegime,
      above_ma50: r.close != null && r.ma50 != null ? r.close >= r.ma50 : null,
    });
  }
  sectors.sort((a, b) => (b.rs ?? -Infinity) - (a.rs ?? -Infinity));
  return {
    status: sectors.length ? 'ready' : 'missing',
    benchmark: benchmarkSymbol,
    benchmark_ret20: round2(bench.ret20),
    quadrant_counts: quadrantCounts,
    sectors,
  };
}

async function loadSectorRotation() {
  const symbols = [...Object.keys(SECTOR_ETFS), ROTATION_BENCHMARK];
  const [signalResult, gammaResult, ivResult] = await Promise.all([
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
    ]);

    const gammaBy = new Map(gammaResult.rows.map(r => [r.symbol, r.gamma_regime]));
    const ivBy = new Map(ivResult.rows.map(r => [r.symbol, number(r.iv_rank)]));
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

// ---- Daily Market Briefing (R1.2) ----
const GAMMA_ZH = { positive: '正', negative: '负' };

/**
 * Compose a market-level daily briefing (R1.2). Pure so the synthesis text is
 * unit-testable. Reuses the already-built breadth / state-matrix / rotation
 * objects plus regime gamma, upcoming earnings, and top option activity. It is a
 * market summary, not a trade signal.
 */
function buildBriefing({ dateLabel, breadth, stateMatrix, rotation, spyGamma, qqqGamma, earnings, unusual }) {
  const g = breadth?.gamma || {};
  const iv = breadth?.iv_rank || {};
  const dist = stateMatrix?.distribution || {};
  const s = k => dist[k] || 0;
  const bull = s('S1');
  const bear = s('S5');
  const tilt = bull > bear ? '偏多头' : bear > bull ? '偏空头' : '多空均衡';

  const sectors = rotation?.sectors || [];
  const leaders = sectors.filter(x => x.quadrant === 'leading').slice(0, 2);
  const laggards = sectors.filter(x => x.quadrant === 'lagging').slice(-2).reverse();

  const parts = [];
  parts.push(`${dateLabel} 市场${tilt}`);
  if (g.positive_pct != null) parts.push(`${g.positive_pct}% 标的处正 Gamma`);
  if (iv.median != null) parts.push(`IV Rank 中位 ${Math.round(iv.median)}`);
  parts.push(`状态 强势上行 ${bull} / 回调 ${s('S2')} / 空头 ${bear}${s('S0') ? `，${s('S0')} 只高波动观望` : ''}`);
  if (leaders.length) parts.push(`板块 ${leaders.map(x => x.label).join('、')} 领跑${laggards.length ? `、${laggards.map(x => x.label).join('、')} 落后` : ''}`);
  if (earnings?.length) parts.push(`未来一周 ${earnings.length} 只财报（${earnings.slice(0, 4).map(e => e.symbol).join('、')}${earnings.length > 4 ? '…' : ''}）`);
  const headline = `${parts.join('，')}。`;

  return {
    date: dateLabel,
    tilt,
    headline,
    callouts: {
      regime: {
        positive_gamma_pct: g.positive_pct ?? null,
        spy_gamma: spyGamma ?? null,
        qqq_gamma: qqqGamma ?? null,
      },
      breadth: { iv_median: iv.median ?? null, elevated_pct: iv.elevated_pct ?? null },
      states: { S1: s('S1'), S2: s('S2'), S3: s('S3'), S4: s('S4'), S5: s('S5'), S6: s('S6'), S0: s('S0') },
      rotation: {
        leaders: leaders.map(x => ({ symbol: x.symbol, label: x.label, rs: x.rs })),
        laggards: laggards.map(x => ({ symbol: x.symbol, label: x.label, rs: x.rs })),
      },
    },
    earnings_ahead: earnings || [],
    top_unusual: unusual || [],
    spy_gamma_label: spyGamma ? `${GAMMA_ZH[spyGamma] || spyGamma}Gamma` : null,
    qqq_gamma_label: qqqGamma ? `${GAMMA_ZH[qqqGamma] || qqqGamma}Gamma` : null,
  };
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

router.get('/regime', sendMarketRegime);
router.get('/breadth', sendMarketBreadth);
router.get('/state-matrix', sendMarketStateMatrix);
router.get('/sector-rotation', sendSectorRotation);
router.get('/briefing', sendMarketBriefing);

module.exports = {
  router, deriveMomentum, deriveMarketRegime, sendMarketRegime,
  buildBreadth, percentile, sendMarketBreadth,
  classifyState, buildStateMatrix, sendMarketStateMatrix, STATE_META, STATE_THRESHOLDS,
  buildSectorRotation, sendSectorRotation, SECTOR_ETFS,
  buildBriefing, sendMarketBriefing,
};
