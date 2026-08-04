const { Pool } = require('pg');

// Every one of these has a pg/Postgres default of "wait forever". Without them,
// a database that is down or saturated does not produce errors -- it produces
// hangs: the pool fills, every later pool.query() awaits a checkout that never
// resolves, the Express handler never responds, and sockets accumulate until the
// process runs out of file descriptors. That is exactly what the 2026-07-30
// volume-full outage looked like from the outside, and adding a 30s deadline to
// the browser only hid it: the client gave up while the server stayed wedged.
//
// Values are deliberately shorter than the frontend's 30s request deadline so
// the API fails fast enough to return a real error, rather than the client
// timing out first and leaving the server still working on a dead request.
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Fail a checkout instead of queueing behind a dead database.
  connectionTimeoutMillis: num(process.env.PG_CONNECTION_TIMEOUT_MS, 10000),
  // Bound a single statement server-side, so a pathological query cannot hold a
  // connection (and therefore a pool slot) indefinitely.
  statement_timeout: num(process.env.PG_STATEMENT_TIMEOUT_MS, 20000),
  // Client-side companion: covers the case where the server never answers at all.
  query_timeout: num(process.env.PG_QUERY_TIMEOUT_MS, 25000),
  idleTimeoutMillis: num(process.env.PG_IDLE_TIMEOUT_MS, 30000),
  max: num(process.env.PG_POOL_MAX, 10),
});

// An idle-client error (server restart, network drop, admin disconnect) is
// emitted on the pool, and an unhandled 'error' event would crash the process.
// Log and let pg discard the client -- the next checkout creates a fresh one.
pool.on('error', (err) => {
  console.error('pg pool idle client error:', err.message);
});

module.exports = pool;
