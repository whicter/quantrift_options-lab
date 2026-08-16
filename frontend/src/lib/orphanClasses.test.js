import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Every className used in JSX must have a rule somewhere in the CSS.
 *
 * `.pos-num` shipped with no rule at all: every numeric cell in the positioning
 * table carried it, the headers were right-aligned by a different rule, and the
 * figures sat left-aligned underneath. `.az-data-note` was the same shape but
 * worse -- it wraps the compliance disclaimers ("估算概率不保证实际胜率…"), and
 * with no rule they computed identically to body text, reading as another line
 * of the product's own conclusion rather than as an aside.
 *
 * A render test cannot catch this. The class is in the DOM either way, so
 * nothing throws and no assertion about structure fails; only the pixels differ.
 * The two sides have to be compared statically, which is what this does.
 *
 * The runner has no JSX transform, so this reads source text rather than
 * rendering. It therefore sees only literal class strings -- see BUILT_PREFIXES.
 */

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Classes assembled at runtime, e.g. `rrg-tone-${tone}`. Stripping the
 * interpolation leaves a bare prefix that is never itself a selector, so
 * matching it against the CSS would always fail. Listing the prefixes keeps the
 * check honest about what it cannot see instead of silently skipping anything
 * with a template literal in it.
 */
const BUILT_PREFIXES = [
  'az-side-', 'brief-', 'cat-', 'earnings-day-', 'home-product-', 'iv-profile-',
  'lvl-', 'rrg-c-', 'rrg-flow-', 'rrg-grade-', 'rrg-tone-', 'scan-regime-',
  'scan-row-', 'sm-col-', 'sm-tone-', 'tag-', 'tl-status-', 'tl-zone-',
  'tl-zone-column-', 'type-', 'wk-overview-',
];

/**
 * Classes deliberately carrying no style: pure markup hooks kept for structure
 * or for tests to select on. Each must be justified here, so adding one is a
 * decision rather than an omission.
 */
const INTENTIONALLY_UNSTYLED = new Set([
  'earnings-head',        // layout comes from the shared page-header rule
  'market-head',          // ditto
  'positioning-page',     // page-level wrapper, no own box
  'scan-header',          // ditto
  'scan-title',
  'scan-subtitle',
  'tab-overview',
  'az-obv-card',          // styled via the generic .az-card it also carries
  'az-price-ruler-card',  // ditto
  'blue',                 // colour modifier resolved by its parent's rule
]);

function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

test('every className used in JSX has a matching CSS rule', () => {
  const css = walk(srcDir, '.css').map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const defined = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]));

  const pattern = /className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\})/g;
  const orphans = new Map();

  for (const file of walk(srcDir, '.jsx')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const raw = (match[1] || match[2] || match[3] || '').replace(/\$\{[^}]*\}/g, ' ');
      for (const cls of raw.split(/\s+/)) {
        if (!cls || defined.has(cls)) continue;
        if (INTENTIONALLY_UNSTYLED.has(cls)) continue;
        if (BUILT_PREFIXES.includes(cls)) continue;
        if (!orphans.has(cls)) orphans.set(cls, path.relative(srcDir, file));
      }
    }
  }

  assert.deepEqual(
    [...orphans.entries()],
    [],
    'these classes are used in JSX but no CSS rule defines them; either add the '
    + 'rule or, if the class is a pure markup hook, list it in INTENTIONALLY_UNSTYLED',
  );
});

test('the disclaimer class is actually styled, not just present', () => {
  // Named explicitly because its failure mode is silent: compliance copy that
  // renders exactly like the product's own prose is the outcome to prevent.
  const css = walk(srcDir, '.css').map(f => fs.readFileSync(f, 'utf8')).join('\n');
  assert.match(css, /\.az-data-note\s*\{[^}]*color\s*:/);
  assert.match(css, /\.az-data-note\s*\{[^}]*font-size\s*:/);
});
