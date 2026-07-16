const express = require('express');
const pool = require('../db');
const { deriveSupportResistance } = require('./supportResistance');

const router = express.Router();

function number(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  return value?.toISOString?.().slice(0, 10) || String(value || '').slice(0, 10);
}

function dayLabel(value) {
  return new Date(`${isoDate(value)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function deriveWeekly(symbol, priceRows, gexRows, oiRows, srResult) {
  const prices = priceRows.map(row => ({
    date: isoDate(row.date), open: number(row.open), high: number(row.high), low: number(row.low),
    close: number(row.close), volume: number(row.volume) || 0, source: row.source,
  })).filter(row => [row.open, row.high, row.low, row.close].every(value => value != null));
  if (prices.length < 6) return { symbol, status: 'missing', reason: 'requires_6_daily_bars' };
  const weekBars = prices.slice(-5);
  const previousClose = prices.at(-6).close;
  const latest = weekBars.at(-1);
  const weekChange = ((latest.close / previousClose) - 1) * 100;
  const gammaHistory = gexRows.map(row => ({
    date: isoDate(row.market_date), day: dayLabel(row.market_date), snapshot_ts: row.snapshot_ts,
    source: row.source, global_gex: number(row.global_gex), local_gamma: number(row.local_gamma),
    gamma_regime: row.gamma_regime, gamma_flip: number(row.gamma_flip), call_wall: number(row.call_wall),
    put_wall: number(row.put_wall), max_pain: number(row.max_pain), pcr_oi: number(row.pcr_oi),
    confidence: row.confidence,
    strikes: Array.isArray(row.strikes) ? row.strikes.map(strike => ({
      strike: number(strike.strike), net_gex: number(strike.net_gex), call_oi: number(strike.call_oi), put_oi: number(strike.put_oi),
    })) : [],
  }));
  const latestGex = gammaHistory.at(-1) || null;
  const oiHistory = oiRows.map(row => ({
    date: isoDate(row.market_date), day: dayLabel(row.market_date), oi_delta: number(row.oi_delta) || 0,
    unusual_count: Number(row.unusual_count || 0), confirmed_count: Number(row.confirmed_count || 0),
  }));
  const totalOiDelta = oiHistory.reduce((sum, row) => sum + row.oi_delta, 0);
  const trend = weekChange >= 1 ? '上涨' : weekChange <= -1 ? '下跌' : '震荡';
  const gammaText = latestGex ? `${latestGex.gamma_regime === 'positive' ? '正' : latestGex.gamma_regime === 'negative' ? '负' : '近零'} Gamma` : 'Gamma 数据不足';
  const tone = `${symbol} 本周${trend} ${Math.abs(weekChange).toFixed(2)}%，最新结构为${gammaText}。`;
  const support = srResult?.supports?.[0]?.price ?? null;
  const resistance = srResult?.resistances?.[0]?.price ?? null;
  const validCallWall = latestGex?.call_wall > latest.close ? latestGex.call_wall : null;
  const validPutWall = latestGex?.put_wall < latest.close ? latestGex.put_wall : null;
  const upTrigger = validCallWall ?? resistance;
  const downTrigger = validPutWall ?? support;
  const upperStrike = upTrigger == null ? null : latestGex?.strikes?.filter(row => row.strike > upTrigger).sort((a, b) => a.strike - b.strike)[0]?.strike ?? resistance;
  const lowerStrike = downTrigger == null ? null : latestGex?.strikes?.filter(row => row.strike < downTrigger).sort((a, b) => b.strike - a.strike)[0]?.strike ?? support;
  const maxPain = latestGex?.max_pain ?? null;

  return {
    symbol,
    status: 'ready',
    period: { start: weekBars[0].date, end: latest.date },
    price: {
      source: latest.source, previous_close: previousClose, close: latest.close, change_pct: weekChange,
      high: Math.max(...weekBars.map(row => row.high)), low: Math.min(...weekBars.map(row => row.low)),
      candles: weekBars.map(row => ({ ...row, day: dayLabel(row.date) })),
    },
    tone,
    score: Math.max(0, Math.min(100, Math.round(50 + weekChange * 7 + (latestGex?.gamma_regime === 'positive' ? 6 : latestGex?.gamma_regime === 'negative' ? -6 : 0)))),
    gamma: { status: latestGex ? 'ready' : 'missing', history: gammaHistory, latest: latestGex },
    pinning: maxPain == null ? { status: 'missing' } : {
      status: 'ready', max_pain: maxPain, close: latest.close, deviation_pct: ((latest.close / maxPain) - 1) * 100,
    },
    positioning: { status: oiHistory.length ? 'ready' : 'missing', total_oi_delta: totalOiDelta, history: oiHistory },
    levels: { support, resistance },
    scenarios: upTrigger != null || downTrigger != null ? {
      up: upTrigger == null ? null : { trigger: upTrigger, target: upperStrike, evidence: validCallWall != null ? 'Call Wall' : 'price resistance' },
      down: downTrigger == null ? null : { trigger: downTrigger, target: lowerStrike, evidence: validPutWall != null ? 'Put Wall' : 'price support' },
    } : null,
  };
}

async function sendWeekly(req, res) {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  try {
    const [priceResult, gexResult, oiResult] = await Promise.all([
      pool.query(`SELECT date, open, high, low, close, volume, source FROM (
        SELECT * FROM price_history WHERE symbol = $1 ORDER BY date DESC LIMIT 250
      ) rows ORDER BY date ASC`, [symbol]),
      pool.query(`WITH daily AS (
        SELECT *, (snapshot_ts AT TIME ZONE 'America/New_York')::date market_date,
          ROW_NUMBER() OVER (PARTITION BY (snapshot_ts AT TIME ZONE 'America/New_York')::date ORDER BY snapshot_ts DESC) rank
        FROM gex_snapshots WHERE symbol = $1
      )
      SELECT daily.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'strike', strike, 'net_gex', net_gex, 'call_oi', call_oi, 'put_oi', put_oi
      ) ORDER BY strike) FROM gex_by_strike_snapshots WHERE snapshot_id = daily.snapshot_id), '[]'::jsonb) strikes
      FROM daily WHERE rank = 1 ORDER BY market_date DESC LIMIT 5`, [symbol]),
      pool.query(`SELECT (snapshot_ts AT TIME ZONE 'America/New_York')::date market_date,
        COALESCE(SUM(oi_delta), 0) oi_delta,
        COUNT(*) FILTER (WHERE is_unusual) unusual_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') confirmed_count
        FROM option_oi_delta_snapshots WHERE symbol = $1 AND oi_delta IS NOT NULL
        GROUP BY market_date ORDER BY market_date DESC LIMIT 5`, [symbol]),
    ]);
    const sr = deriveSupportResistance(priceResult.rows);
    const result = deriveWeekly(symbol, priceResult.rows, [...gexResult.rows].reverse(), [...oiResult.rows].reverse(), sr);
    return res.json(result);
  } catch (error) {
    console.error('GET /api/weekly/:symbol error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendWeekly);

module.exports = { router, deriveWeekly, sendWeekly };
