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

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

function deriveValueArea(nodes, poc, targetPct = 70) {
  if (!nodes.length || !poc) return null;
  const totalVolume = nodes.reduce((sum, node) => sum + node.volume, 0);
  const targetVolume = totalVolume * (targetPct / 100);
  const pocIndex = nodes.findIndex(node => node === poc);
  let left = pocIndex;
  let right = pocIndex;
  let volume = poc.volume;

  while (volume < targetVolume && (left > 0 || right < nodes.length - 1)) {
    const below = left > 0 ? nodes[left - 1] : null;
    const above = right < nodes.length - 1 ? nodes[right + 1] : null;
    if (!above || (below && below.volume >= above.volume)) {
      left -= 1;
      volume += below.volume;
    } else {
      right += 1;
      volume += above.volume;
    }
  }
  return {
    low: nodes[left].low,
    high: nodes[right].high,
    volume,
    volume_pct: totalVolume ? (volume / totalVolume) * 100 : 0,
    target_pct: targetPct,
    node_count: right - left + 1,
  };
}

function deriveLowVolumeNodes(nodes) {
  if (nodes.length < 3) return [];
  const threshold = percentile(nodes.map(node => node.volume), 0.25);
  return nodes.filter((node, index) => {
    if (index === 0 || index === nodes.length - 1) return false;
    return node.volume <= threshold
      && node.volume <= nodes[index - 1].volume
      && node.volume <= nodes[index + 1].volume;
  });
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

  const orderedNodes = [...nodes].sort((a, b) => a.price - b.price);
  const poc = [...orderedNodes].sort((a, b) => b.volume - a.volume || a.price - b.price)[0] || null;
  return {
    status: 'ready',
    bar_count: bars.length,
    price_low: low,
    price_high: high,
    bin_count: bins,
    total_volume: totalVolume,
    nodes: orderedNodes,
    high_volume_nodes: [...orderedNodes].sort((a, b) => b.volume - a.volume || a.price - b.price).slice(0, 5),
    poc,
    value_area: deriveValueArea(orderedNodes, poc),
    low_volume_nodes: deriveLowVolumeNodes(orderedNodes),
  };
}

async function sendVolumeProfile(req, res) {
  const symbol = normalizeSymbol(req.params.symbol);
  const interval = String(req.query.interval || '30m').trim().toLowerCase();
  const defaultDays = interval === '1d' ? 250 : 20;
  const days = parseBoundedInteger(req.query.days, defaultDays, 1, interval === '1d' ? 250 : 60);
  const bins = parseBoundedInteger(req.query.bins, 40, 10, 80);
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (!['30m', '1d'].includes(interval)) return res.status(400).json({ error: 'invalid interval' });
  if (days == null) return res.status(400).json({ error: 'invalid days' });
  if (bins == null) return res.status(400).json({ error: 'invalid bins' });

  try {
    const query = interval === '1d'
      ? `SELECT high, low, close, volume
           FROM price_history
           WHERE symbol = $1
           ORDER BY date DESC
           LIMIT $2`
      : `SELECT high, low, close, volume
           FROM price_history_30m
           WHERE symbol = $1
             AND bar_ts >= NOW() - ($2::int * INTERVAL '1 day')
             AND (bar_ts AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
             AND (bar_ts AT TIME ZONE 'America/New_York')::time < TIME '16:00'
           ORDER BY bar_ts ASC`;
    const { rows: rawRows } = await pool.query(query, [symbol, days]);
    const rows = interval === '1d' ? [...rawRows].reverse() : rawRows;
    const profile = deriveVolumeProfile(rows, bins);
    return res.json({ symbol, interval, days, source: interval === '1d' ? 'price_history' : 'price_history_30m', ...profile });
  } catch (err) {
    console.error('GET /api/vp/:symbol error:', err.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/:symbol', sendVolumeProfile);

module.exports = { router, sendVolumeProfile, deriveVolumeProfile, deriveValueArea, deriveLowVolumeNodes };
