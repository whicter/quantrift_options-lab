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

if (drift) {
  console.log(`\n${drift} app(s) drifted. Fix with:`);
  console.log('  pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name> && pm2 save');
  console.log('(pm2 restart will NOT pick up ecosystem env changes.)');
  process.exit(1);
}
console.log(`pm2 env drift: none (${(cfg.apps || []).filter(a => a.name.startsWith('quantrift')).length} quantrift apps checked)`);
