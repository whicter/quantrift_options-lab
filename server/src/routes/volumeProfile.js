const express = require('express');
const pool = require('../db');

const router = express.Router();

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function deriveVolumeProfile(rows, bins = 40) {
  const bars = rows.map(row => ({
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  })).filter(bar => [bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) && bar.volume > 0);

  if (bars.length < 2) {
    return { status: 'missing', reason: 'requires_2_30m_bars_with_volume', bar_count: bars.length, nodes: [], high_volume_nodes: [] };
  }

  const low = Math.min(...bars.map(bar => bar.low));
  const high = Math.max(...bars.map(bar => bar.high));
  if (!(high > low)) {
    return { status: 'missing', reason: 'requires_price_range', bar_count: bars.length, nodes: [], high_volume_nodes: [] };
  }

  const width = (high - low) / bins;
  const volumes = Array.from({ length: bins }, () => 0);
  bars.forEach(bar => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const index = Math.min(bins - 1, Math.max(0, Math.floor((typicalPrice - low) / width)));
    volumes[index] += bar.volume;
  });

  const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  const nodes = volumes.map((volume, index) => ({
    low: low + index * width,
    high: low + (index + 1) * width,
    price: low + (index + 0.5) * width,
    volume,
    volume_pct: totalVolume ? (volume / totalVolume) * 100 : 0,
  })).filter(node => node.volume > 0);

  return {
    status: 'ready',
    bar_count: bars.length,
    price_low: low,
    price_high: high,
    bin_count: bins,
    total_volume: totalVolume,
    nodes,
    high_volume_nodes: [...nodes].sort((a, b) => b.volume - a.volume || a.price - b.price).slice(0, 5),
  };
}

async function sendVolumeProfile(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  const interval = String(req.query.interval || '30m').trim().toLowerCase();
  const days = parseBoundedInteger(req.query.days, 20, 1, 60);
  const bins = parseBoundedInteger(req.query.bins, 40, 10, 80);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (interval !== '30m') return res.status(400).json({ error: 'invalid interval' });
  if (days == null) return res.status(400).json({ error: 'invalid days' });
  if (bins == null) return res.status(400).json({ error: 'invalid bins' });

  try {
    const { rows } = await pool.query(`SELECT high, low, close, volume
      FROM price_history_30m
      WHERE symbol = $1
        AND bar_ts >= NOW() - ($2::int * INTERVAL '1 day')
        AND (bar_ts AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
        AND (bar_ts AT TIME ZONE 'America/New_York')::time < TIME '16:00'
      ORDER BY bar_ts ASC`, [symbol, days]);
    const profile = deriveVolumeProfile(rows, bins);
    return res.json({ symbol, interval, days, source: 'price_history_30m', ...profile });
  } catch (err) {
    console.error('GET /api/vp/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendVolumeProfile);

module.exports = { router, sendVolumeProfile, deriveVolumeProfile };
