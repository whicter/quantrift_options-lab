const express = require('express');
const router = express.Router();
const pool = require('../db');
const { cacheKey, getCache, setCache } = require('../lib/cache');

const FLOW_CACHE_SECONDS = parseInt(process.env.FLOW_CACHE_SECONDS ?? 30, 10);
const FLOW_STALE_MINUTES = parseInt(process.env.FLOW_STALE_MINUTES ?? 5, 10);
const FLOW_WINDOW_HOURS = Math.min(Math.max(parseInt(process.env.FLOW_WINDOW_HOURS ?? 24, 10), 1), 72);

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9.-]{1,12}$/.test(symbol);
}

function missingPayload(symbol) {
  return {
    symbol,
    source: 'unusual_whales',
    status: 'missing',
    freshness: 'missing',
    is_stale: true,
    provider_last_message_at: null,
    summary: { option_flow_count: 0, sweep_count: 0, dark_pool_count: 0, option_premium: 0, dark_pool_notional: 0 },
    items: [],
  };
}

async function sendFlow(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? 30, 10), 1), 100);
  if (!isValidSymbol(symbol) || Number.isNaN(limit)) return res.status(400).json({ error: 'invalid params' });

  const key = cacheKey('external-flow', { symbol, limit });
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const stateResult = await pool.query(
      `SELECT source,status,last_connected_at,last_message_at,last_error,updated_at
       FROM external_flow_provider_state WHERE source='unusual_whales'`
    );
    const state = stateResult.rows[0];
    if (!state?.last_message_at) return res.json(missingPayload(symbol));

    const { rows } = await pool.query(
      `SELECT source,provider_event_id,symbol,event_type,executed_at,contract_symbol,expiry,
              option_right AS right,strike,underlying_price,price,size,premium,open_interest,volume,
              ask_side_premium,bid_side_premium,has_sweep,all_opening_trades,market_center
       FROM external_flow_events
       WHERE symbol=$1 AND executed_at >= NOW() - ($2::text || ' hours')::interval
       ORDER BY executed_at DESC LIMIT $3`,
      [symbol, FLOW_WINDOW_HOURS, limit]
    );
    const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(state.last_message_at).getTime()) / 60000));
    const isStale = ageMinutes > FLOW_STALE_MINUTES || state.status === 'error';
    const summary = rows.reduce((result, row) => {
      if (row.event_type === 'option_flow') {
        result.option_flow_count += 1;
        result.sweep_count += row.has_sweep ? 1 : 0;
        result.option_premium += Number(row.premium || 0);
      } else if (row.event_type === 'dark_pool') {
        result.dark_pool_count += 1;
        result.dark_pool_notional += Number(row.premium || 0);
      }
      return result;
    }, { option_flow_count: 0, sweep_count: 0, dark_pool_count: 0, option_premium: 0, dark_pool_notional: 0 });

    const payload = {
      symbol,
      source: state.source,
      status: isStale ? 'stale' : rows.length ? 'active' : 'quiet',
      freshness: isStale ? 'stale' : 'fresh',
      is_stale: isStale,
      provider_last_message_at: state.last_message_at,
      age_minutes: ageMinutes,
      window_hours: FLOW_WINDOW_HOURS,
      summary,
      items: rows,
    };
    return res.json(setCache(key, payload, FLOW_CACHE_SECONDS));
  } catch (err) {
    if (err?.code === '42P01') return res.json(missingPayload(symbol));
    console.error('GET /api/flow/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendFlow);

module.exports = { router, sendFlow };
