const express = require('express');
const { sendChainSnapshot } = require('./options');
const pool = require('../db');

const router = express.Router();

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function ageMinutes(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / 60000) : null;
}

function toDateString(value) {
  return value?.toISOString?.().slice(0, 10) || String(value).slice(0, 10);
}

function deriveChainStats(snapshot, contracts) {
  const spot = Number(snapshot.underlying_price);
  const valid = contracts.map(row => ({
    expiry: toDateString(row.expiry),
    strike: Number(row.strike),
    right: row.option_right,
    iv: Number(row.iv),
    delta: row.delta == null ? null : Number(row.delta),
    open_interest: row.open_interest == null ? null : Number(row.open_interest),
  })).filter(row => Number.isFinite(row.strike) && Number.isFinite(row.iv) && row.iv > 0);
  const expiries = [...new Set(valid.map(row => row.expiry))].sort();
  const term_structure = expiries.map(expiry => {
    const rows = valid.filter(row => row.expiry === expiry);
    const minDistance = Math.min(...rows.map(row => Math.abs(row.strike - spot)));
    const atm = rows.filter(row => Math.abs(row.strike - spot) === minDistance);
    return {
      expiry,
      atm_strike: atm[0]?.strike ?? null,
      atm_iv: atm.length ? atm.reduce((sum, row) => sum + row.iv, 0) / atm.length : null,
      contract_count: rows.length,
    };
  });
  const skewExpiry = expiries[0] || null;
  const skewMap = new Map();
  valid.filter(row => row.expiry === skewExpiry).forEach(row => {
    const point = skewMap.get(row.strike) || { strike: row.strike };
    if (row.right === 'C') {
      point.call_iv = row.iv;
      point.call_delta = row.delta;
      point.call_oi = row.open_interest;
    } else {
      point.put_iv = row.iv;
      point.put_delta = row.delta;
      point.put_oi = row.open_interest;
    }
    skewMap.set(row.strike, point);
  });
  return {
    term_structure,
    skew: { expiry: skewExpiry, points: [...skewMap.values()].sort((a, b) => a.strike - b.strike) },
    iv_contract_count: valid.length,
  };
}

async function sendChainStats(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });

  try {
    const snapshotResult = await pool.query(
      `SELECT s.*
       FROM option_chain_snapshots s
       WHERE s.symbol = $1
         AND EXISTS (
           SELECT 1 FROM option_contract_snapshots c
           WHERE c.snapshot_id = s.id AND c.iv IS NOT NULL AND c.iv > 0
         )
       ORDER BY s.snapshot_ts DESC
       LIMIT 1`,
      [symbol]
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) return res.json({ symbol, status: 'missing', term_structure: [], skew: { expiry: null, points: [] } });

    const contractsResult = await pool.query(
      `SELECT expiry, strike, option_right, iv, delta, open_interest
       FROM option_contract_snapshots
       WHERE snapshot_id = $1
         AND expiry >= (NOW() AT TIME ZONE 'America/New_York')::date
         AND iv IS NOT NULL AND iv > 0
       ORDER BY expiry ASC, strike ASC, option_right ASC`,
      [snapshot.id]
    );
    const stats = deriveChainStats(snapshot, contractsResult.rows);
    const age = ageMinutes(snapshot.snapshot_ts);
    return res.json({
      symbol,
      status: stats.iv_contract_count ? 'ready' : 'missing',
      source: snapshot.source,
      snapshot_ts: snapshot.snapshot_ts,
      age_minutes: age,
      freshness: age != null && age <= 180 ? 'fresh' : 'stale',
      underlying_price: snapshot.underlying_price,
      ...stats,
    });
  } catch (err) {
    console.error('GET /api/chain/stats/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/stats/:symbol', sendChainStats);

router.get('/:symbol', (req, res) => sendChainSnapshot(req, res, { includeContracts: true }));

module.exports = router;
module.exports.sendChainStats = sendChainStats;
module.exports.deriveChainStats = deriveChainStats;
