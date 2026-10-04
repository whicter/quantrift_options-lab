#!/usr/bin/env node
/**
 * Report env declared in ecosystem.config.cjs that PM2 is not actually running.
 *
 * `pm2 restart` relaunches the process from the app definition PM2 has SAVED,
 * not from the ecosystem file, so editing the file and restarting leaves the old
 * env in place with no warning anywhere. Only `pm2 delete` + `pm2 start
 * ecosystem.config.cjs` (then `pm2 save`) re-registers it.
 *
 * This has now cost real time three separate ways:
 *   1. Log paths -- pm_out_log_path is resolved at process creation, so a
 *      reloaded app kept writing to the old file.
 *   2. POLYGON_REFERENCE_REQUEST_DELAY on quantrift-market-breadth (2026-08-15).
 *   3. POLYGON_OPTIONS_REQUEST_DELAY on quantrift-options-collector, found
 *      2026-08-20: the option scope silently fell back to
 *      POLYGON_STOCK_REQUEST_DELAY=16 instead of the configured 1.5, so every
 *      chain fetch paced at ~11x its intended interval. Median
 *      option_chain_snapshot runtime was 1297s against ~154s once registered --
 *      the "601s -> 44.1s" speedup committed on 2026-08-15 had never once been
 *      live in production.
 *
 * A config file that does not match the running process is not a config file,
 * it is a wish. Exit code 1 on drift so this can gate a deploy or alert.
 *
 * Only inspects apps named quantrift*: the other ~19 PM2 apps on this machine
 * belong to different repositories.
 */
const { execSync } = require('child_process');
const path = require('path');

const cfg = require(path.join(__dirname, 'ecosystem.config.cjs'));
let live;
try {
  live = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (err) {
  console.error('cannot read pm2 jlist:', err.message);
  process.exit(2);
}

let drift = 0;
for (const app of cfg.apps || []) {
  if (!app.name || !app.name.startsWith('quantrift')) continue;
  const running = live.find(x => x.name === app.name);
  if (!running) {
    console.log(`[${app.name}] declared in ecosystem but NOT registered in PM2`);
    drift += 1;
    continue;
  }
  const problems = [];
  for (const [key, want] of Object.entries(app.env || {})) {
    const got = running.pm2_env[key];
    if (got === undefined) problems.push(`  unregistered: ${key}=${want}`);
    else if (String(got) !== String(want)) problems.push(`  mismatch: ${key} live=${got} config=${want}`);
  }
  if (problems.length) {
    drift += 1;
    console.log(`[${app.name}]`);
    problems.forEach(p => console.log(p));
  }
}

const quantriftApps = (cfg.apps || []).filter(a => a.name && a.name.startsWith('quantrift'));
if (drift) {
  console.log(`\n[env] ${drift} app(s) drifted.`);
} else {
  console.log(`[env] no drift (${quantriftApps.length} quantrift apps checked)`);
}

/* ---------------------------------------------------------------------------
 * Trigger drift.
 *
 * Env drift is only half of it. On 2026-09-23 the PM2 daemon restarted and 13
 * of 14 quantrift cron apps never fired again -- log-rotate (`20 * * * *`)
 * included -- while `pm2 list` showed them present, status normal, with their
 * cron_restart field intact. That day's price collection never started and a
 * whole session of daily bars went missing. Nothing detected it; I found it by
 * hand, days later.
 *
 * Presence in the process list is not evidence that an app will fire. The only
 * signal that distinguishes a registered app from a firing one is whether its
 * log was actually written when its cron expression says it should have been.
 * ------------------------------------------------------------------------- */
const fs = require('fs');

function matchField(spec, value, min, max) {
  return spec.split(',').some(part => {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const bounds = range.split('-');
      lo = parseInt(bounds[0], 10);
      hi = bounds.length > 1 ? parseInt(bounds[1], 10) : lo;
      if (!stepRaw && bounds.length === 1) return value === lo;
    }
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

/** Most recent time this expression should have fired, searching back `days`. */
function lastFireBefore(expr, now, days = 14) {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  const t = new Date(now.getTime());
  t.setSeconds(0, 0);
  for (let i = 0; i < days * 24 * 60; i += 1) {
    t.setMinutes(t.getMinutes() - 1);
    if (
      matchField(min, t.getMinutes(), 0, 59) &&
      matchField(hour, t.getHours(), 0, 23) &&
      matchField(dom, t.getDate(), 1, 31) &&
      matchField(mon, t.getMonth() + 1, 1, 12) &&
      matchField(dow, t.getDay(), 0, 6)
    ) {
      return new Date(t.getTime());
    }
  }
  return null;
}

// A run has to start and produce its first line. Generous, because a false
// alarm here teaches people to ignore the check.
const START_GRACE_MS = 20 * 60 * 1000;
// Test seam only; production never sets it. A detector nobody has watched fire
// is indistinguishable from one that cannot, and this check exists precisely
// because the previous blind spot went unnoticed for days.
const now = process.env.PM2_DRIFT_NOW ? new Date(process.env.PM2_DRIFT_NOW) : new Date();
let triggerDrift = 0;

for (const app of quantriftApps) {
  if (!app.cron_restart) continue;
  const lastFire = lastFireBefore(app.cron_restart, now);
  if (!lastFire || now - lastFire < START_GRACE_MS) continue;

  const running = live.find(x => x.name === app.name);
  if (!running) continue;            // already reported as unregistered above

  // Still executing: it fired, it simply has not finished. This is not a corner
  // case -- quantrift-universe-metadata runs for ~87 minutes and writes its only
  // log line at the end, which produced this check's first false alarm on
  // 2026-10-04. An alert people learn to dismiss is worse than no alert.
  if (running.pm2_env.status === 'online') continue;

  // pm2_env.pm_uptime is the last time PM2 actually launched the app, kept for
  // stopped apps too, and it matches each cron expression to the second. That
  // makes it a far more direct answer to "did it fire" than a log timestamp,
  // which really answers "did it produce output" -- a different question whose
  // answer depends on how each script buffers.
  const lastLaunch = running.pm2_env.pm_uptime || 0;

  const candidates = [app.error_file, app.out_file,
                      running.pm2_env.pm_err_log_path, running.pm2_env.pm_out_log_path]
    .filter(Boolean);
  let newestLog = 0;
  for (const file of candidates) {
    try {
      newestLog = Math.max(newestLog, fs.statSync(file).mtimeMs);
    } catch { /* absent log stays 0 and simply does not vouch for a launch */ }
  }

  // Two independent signals, and drift is reported only when they agree. Either
  // alone has a failure mode: pm_uptime could be refreshed by a daemon
  // resurrect without the app ever running, and a log mtime lags any script
  // that writes only on completion. Agreement costs a little sensitivity and
  // buys an alert that is worth reading.
  if (lastLaunch < lastFire.getTime() && newestLog < lastFire.getTime()) {
    triggerDrift += 1;
    const launched = lastLaunch ? new Date(lastLaunch).toLocaleString() : 'never';
    console.log(
      `[trigger] ${app.name}: cron "${app.cron_restart}" should have fired ${lastFire.toLocaleString()}, ` +
      `but PM2 last launched it ${launched} and no log was written since -- registered but not firing`
    );
  }
}

/* ---------------------------------------------------------------------------
 * Instance drift.
 *
 * The same 2026-09-23 daemon restart orphaned the three long-running collectors
 * (PPID 1, absent from PM2's table). `pm2 delete` cannot reach a process it has
 * lost, so re-registering started a SECOND copy beside each orphan: two
 * collectors and two quote workers ran against one database for about five
 * hours, which is exactly what the single-writer rule exists to prevent.
 *
 * An orphan is never correct, so it is reported whatever the count.
 * ------------------------------------------------------------------------- */
let instanceDrift = 0;
let psLines = [];
try {
  psLines = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n').filter(Boolean);
} catch (err) {
  console.error('cannot read ps:', err.message);
}

for (const app of quantriftApps) {
  if (!app.script || !app.cwd) continue;
  const needle = `${app.cwd.replace(/\/$/, '')}/${app.script}`;
  const procs = psLines
    .map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(m => m && m[3].includes(needle))
    .map(m => ({ pid: m[1], ppid: m[2] }));

  const orphans = procs.filter(p => p.ppid === '1');
  if (orphans.length) {
    instanceDrift += 1;
    console.log(
      `[instance] ${app.name}: ${orphans.length} orphaned process(es) (PPID 1, outside PM2): ` +
      orphans.map(p => p.pid).join(', ')
    );
  }
  // A cron one-shot legitimately runs while its window is open; a daemon must be
  // exactly one. Either way more than one of the same script is a second writer.
  if (procs.length > 1) {
    instanceDrift += 1;
    console.log(`[instance] ${app.name}: ${procs.length} copies running (pids ${procs.map(p => p.pid).join(', ')}) -- expected 1`);
  }
}

if (!triggerDrift) console.log('[trigger] no drift');
if (!instanceDrift) console.log('[instance] no drift');

const total = drift + triggerDrift + instanceDrift;
if (total) {
  console.log(`\n${total} problem(s). Fix with:`);
  console.log('  pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name> && pm2 save');
  console.log('(pm2 restart will NOT pick up ecosystem changes, and will not reach an orphan.)');
  console.log('Then re-run this check: an orphan survives pm2 delete and must be killed by pid.');
  process.exit(1);
}
