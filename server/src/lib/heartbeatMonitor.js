const pool = require('../db');

const maxAgeSeconds = Math.max(30, Number(process.env.HEARTBEAT_MAX_AGE_SECONDS || 180));
const intervalSeconds = Math.max(30, Number(process.env.HEARTBEAT_MONITOR_SECONDS || 60));
const cooldownSeconds = Math.max(60, Number(process.env.HEARTBEAT_ALERT_COOLDOWN_SECONDS || 3600));
const expectedNodes = String(process.env.HEARTBEAT_EXPECTED_NODES || 'mac-studio').split(',').map(value => value.trim()).filter(Boolean);

function mergeExpectedNodes(heartbeatRows, nodes = expectedNodes) {
  const byNode = new Map(heartbeatRows.map(row => [row.node_id, row]));
  return [...new Set([...nodes, ...byNode.keys()])].map(nodeId => byNode.get(nodeId) || {
    node_id: nodeId, last_seen_at: null, alert_status: null, last_notified_at: null,
  });
}

function isHeartbeatOffline(lastSeenAt, now = Date.now(), ageLimitSeconds = maxAgeSeconds) {
  return !lastSeenAt || now - new Date(lastSeenAt).getTime() > ageLimitSeconds * 1000;
}

async function postWebhook(payload) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return 'blocked';
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    return response.ok ? 'sent' : 'failed';
  } catch (error) {
    console.error('heartbeat webhook failed:', error.message);
    return 'failed';
  }
}

async function monitorHeartbeats() {
  const { rows: heartbeatRows } = await pool.query(
    `SELECT h.node_id, h.last_seen_at, a.status alert_status, a.last_notified_at
     FROM collector_heartbeats h LEFT JOIN collector_heartbeat_alerts a USING (node_id)`
  );
  const rows = mergeExpectedNodes(heartbeatRows);
  for (const row of rows) {
    const offline = isHeartbeatOffline(row.last_seen_at);
    if (!offline) {
      await pool.query(
        `UPDATE collector_heartbeat_alerts SET status='resolved', resolved_at=NOW(), last_seen_at=NOW()
         WHERE node_id=$1 AND status='active'`, [row.node_id]
      );
      continue;
    }
    const notify = row.alert_status !== 'active'
      || !row.last_notified_at
      || Date.now() - new Date(row.last_notified_at).getTime() > cooldownSeconds * 1000;
    const payload = { subject: '[Quantrift] Collector heartbeat offline', severity: 'critical', node_id: row.node_id, last_seen_at: row.last_seen_at };
    const channelStatus = notify ? await postWebhook(payload) : 'cooldown';
    await pool.query(
      `INSERT INTO collector_heartbeat_alerts (node_id,status,first_seen_at,last_seen_at,last_notified_at,payload)
       VALUES ($1,'active',NOW(),NOW(),CASE WHEN $3 THEN NOW() ELSE NULL END,$2::jsonb)
       ON CONFLICT (node_id) DO UPDATE SET status='active',last_seen_at=NOW(),
         last_notified_at=CASE WHEN $3 THEN NOW() ELSE collector_heartbeat_alerts.last_notified_at END,
         resolved_at=NULL,payload=EXCLUDED.payload`, [row.node_id, JSON.stringify({ ...payload, channel_status: channelStatus }), notify]
    );
  }
  return rows.length;
}

function startHeartbeatMonitor() {
  if (String(process.env.HEARTBEAT_MONITOR_ENABLED || 'true').toLowerCase() === 'false') return null;
  const run = () => monitorHeartbeats().catch(error => console.error('heartbeat monitor failed:', error.message));
  run();
  const timer = setInterval(run, intervalSeconds * 1000);
  timer.unref();
  return timer;
}

module.exports = { mergeExpectedNodes, isHeartbeatOffline, monitorHeartbeats, startHeartbeatMonitor, postWebhook };
