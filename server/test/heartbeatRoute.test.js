const assert = require('node:assert/strict');
const test = require('node:test');

process.env.HEARTBEAT_TOKEN = 'test-heartbeat-token';

const dbPath = require.resolve('../src/db');
const queryResults = [];
const queries = [];
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    return queryResults.shift() || { rows: [], rowCount: 0 };
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

const { tokenMatches, heartbeatState, receiveHeartbeat, sendHeartbeatStatus } = require('../src/routes/heartbeat');
const { mergeExpectedNodes, isHeartbeatOffline, monitorHeartbeats } = require('../src/lib/heartbeatMonitor');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('heartbeat token comparison and freshness states are deterministic', () => {
  assert.equal(tokenMatches('same', 'same'), true);
  assert.equal(tokenMatches('bad', 'same'), false);
  assert.deepEqual(heartbeatState(null), { state: 'missing', age_seconds: null });
  assert.equal(heartbeatState('2026-07-15T00:00:00Z', new Date('2026-07-15T00:01:00Z'), 180).state, 'online');
  assert.equal(heartbeatState('2026-07-15T00:00:00Z', new Date('2026-07-15T00:04:00Z'), 180).state, 'offline');
});

test('heartbeat endpoint rejects invalid credentials and accepts a valid report', async () => {
  const denied = responseRecorder();
  await receiveHeartbeat({ get: () => 'Bearer wrong', body: { node_id: 'mac-studio' } }, denied);
  assert.equal(denied.statusCode, 401);

  queryResults.push({ rows: [{ node_id: 'mac-studio', last_seen_at: '2026-07-15T00:00:00Z' }] });
  const accepted = responseRecorder();
  await receiveHeartbeat({ get: () => 'Bearer test-heartbeat-token', body: { node_id: 'mac-studio', payload: { runtime: 'pm2' } } }, accepted);
  assert.equal(accepted.body.status, 'accepted');
  assert.equal(queries.at(-1).params[0], 'mac-studio');
});

test('status reports an expected node that has never sent a heartbeat', async () => {
  queryResults.push({ rows: [] });
  const res = responseRecorder();
  await sendHeartbeatStatus({}, res);
  assert.equal(res.body.status, 'degraded');
  assert.equal(res.body.nodes[0].node_id, 'mac-studio');
  assert.equal(res.body.nodes[0].state, 'missing');
});

test('monitor creates an offline incident for an expected missing node', async () => {
  assert.equal(isHeartbeatOffline(null), true);
  assert.equal(isHeartbeatOffline('2026-07-15T00:00:00Z', Date.parse('2026-07-15T00:01:00Z'), 180), false);
  assert.equal(mergeExpectedNodes([], ['mac-studio'])[0].node_id, 'mac-studio');
  queryResults.push({ rows: [] });
  const count = await monitorHeartbeats();
  assert.equal(count, 1);
  const incident = queries.find(entry => entry.sql.includes('INSERT INTO collector_heartbeat_alerts'));
  assert.ok(incident);
  assert.equal(incident.params[0], 'mac-studio');
  assert.match(incident.params[1], /"channel_status":"blocked"/);
});
