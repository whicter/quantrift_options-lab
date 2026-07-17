#!/usr/bin/env node
/**
 * Production artifact gate.
 *
 * Fails the build when dist/ ships source maps or anything that looks like a
 * provider credential. vite.config.js already sets build.sourcemap=false; this
 * asserts the artifact rather than trusting the setting.
 *
 * Usage: node scripts/check-dist.mjs [distDir]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const distDir = process.argv[2] || 'dist';

// Provider keys we must never bundle. VITE_-prefixed values are public by
// design and are intentionally not matched here.
const SECRET_PATTERNS = [
  { name: 'Polygon API key', pattern: /POLYGON_API_KEY\s*[:=]\s*['"][^'"]+['"]/ },
  { name: 'Clerk secret key', pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe secret key', pattern: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook secret', pattern: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: 'Tastytrade credential', pattern: /TT_(LOGIN|PASSWORD|REMEMBER_TOKEN)\s*[:=]\s*['"][^'"]+['"]/ },
  { name: 'Database URL', pattern: /postgres(ql)?:\/\/[^\s'"]+:[^\s'"]+@/ },
  { name: 'VAPID private key', pattern: /VAPID_PRIVATE_KEY\s*[:=]\s*['"][^'"]+['"]/ },
  { name: 'Admin API token', pattern: /ADMIN_API_TOKEN\s*[:=]\s*['"][^'"]+['"]/ },
];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

let files;
try {
  files = walk(distDir);
} catch {
  console.error(`check-dist: cannot read ${distDir}. Run the production build first.`);
  process.exit(1);
}

const failures = [];

const sourceMaps = files.filter(file => file.endsWith('.map'));
for (const file of sourceMaps) failures.push(`source map shipped: ${relative('.', file)}`);

const inlineMapPattern = /sourceMappingURL=data:application\/json/;
const scannable = files.filter(file => /\.(js|css|html|json)$/.test(file));
for (const file of scannable) {
  const content = readFileSync(file, 'utf8');
  if (inlineMapPattern.test(content)) failures.push(`inline source map: ${relative('.', file)}`);
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) failures.push(`${name} in ${relative('.', file)}`);
  }
}

if (files.length === 0) failures.push(`${distDir} is empty`);

if (failures.length > 0) {
  console.error('check-dist FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`check-dist OK: ${files.length} files, no source maps, no secret patterns.`);
