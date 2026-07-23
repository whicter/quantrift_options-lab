const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { requireAdminToken } = require('../lib/adminAuth');

const router = express.Router();
const MAX_AGE_SECONDS = Math.max(30, Number(process.env.HEARTBEAT_MAX_AGE_SECONDS || 180));
const EXPECTED_NODES = String(process.env.HEARTBEAT_EXPECTED_NODES || 'mac-studio').split(',').map(value => value.trim()).filter(Boolean);

function tokenMatches(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function heartbeatState(lastSeen, now = new Date(), maxAgeSeconds = MAX_AGE_SECONDS) {
  if (!lastSeen) return { state: 'missing', age_seconds: null };
  const ageSeconds = Math.max(0, (now.getTime() - new Date(lastSeen).getTime()) / 1000);
  return { state: ageSeconds > maxAgeSeconds ? 'offline' : 'online', age_seconds: Math.round(ageSeconds) };
}

async function receiveHeartbeat(req, res) {
  const expected = process.env.HEARTBEAT_TOKEN || '';
  const received = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !tokenMatches(received, expected)) return res.status(401).json({ error: 'unauthorized' });
  const nodeId = String(req.body?.node_id || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(nodeId)) return res.status(400).json({ error: 'invalid node_id' });
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  try {
    const { rows } = await pool.query(
      `INSERT INTO collector_heartbeats (node_id, status, payload, last_seen_at)
       VALUES ($1, 'online', $2::jsonb, NOW())
       ON CONFLICT (node_id) DO UPDATE SET status='online', payload=EXCLUDED.payload,
         last_seen_at=EXCLUDED.last_seen_at, updated_at=NOW()
       RETURNING node_id, last_seen_at`, [nodeId, JSON.stringify(payload)]
    );
    return res.json({ status: 'accepted', ...rows[0] });
  } catch (error) {
    console.error('POST /api/heartbeat error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function sendHeartbeatStatus(req, res) {
  try {
    const { rows } = await pool.query('SELECT node_id, status, payload, last_seen_at FROM collector_heartbeats ORDER BY node_id');
    const byId = new Map(rows.map(row => [row.node_id, row]));
    const nodeIds = [...new Set([...EXPECTED_NODES, ...byId.keys()])];
    const nodes = nodeIds.map(nodeId => {
      const row = byId.get(nodeId);
      return row ? { ...row, ...heartbeatState(row.last_seen_at) } : { node_id: nodeId, status: 'missing', payload: {}, last_seen_at: null, ...heartbeatState(null) };
    });
    return res.json({ status: nodes.some(node => node.state !== 'online') || !nodes.length ? 'degraded' : 'ok', max_age_seconds: MAX_AGE_SECONDS, nodes });
  } catch (error) {
    console.error('GET /api/heartbeat/status error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.post('/', receiveHeartbeat);
// Node liveness is operator detail, not product data.
router.get('/status', requireAdminToken, sendHeartbeatStatus);

module.exports = { router, tokenMatches, heartbeatState, receiveHeartbeat, sendHeartbeatStatus };
