import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Normal product UI must not surface internal data-source names.
 *
 * The test runner has no JSX transform, so these are static assertions over the
 * source rather than render assertions. They catch a provider name hardcoded
 * into the UI and catch the disclosure component growing a source field.
 *
 * They do NOT prove a runtime value can never be rendered: these strings arrive
 * from the API at request time. The durable fix is the server downgrading
 * provider/source for normal users (V3A-4 / E10 in docs/task.md); until then the
 * guarantee also rests on no component reading the field.
 */

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const INTERNAL_SOURCE_NAMES = ['polygon_licensed', 'ib_internal', 'tt_internal', 'tastytrade', 'stooq'];

function productionSources(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...productionSources(full));
    else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.js')) files.push(full);
  }
  return files;
}

test('no internal data-source name is hardcoded into production frontend code', () => {
  const offenders = [];
  for (const file of productionSources(srcDir)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const name of INTERNAL_SOURCE_NAMES) {
      if (content.includes(name)) offenders.push(`${path.relative(srcDir, file)}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], `internal source names must not appear in product code:\n${offenders.join('\n')}`);
});

test('DataDetails discloses snapshot context without the originating source', () => {
  const source = fs.readFileSync(path.join(srcDir, 'components/DataDetails.jsx'), 'utf8');

  // It reads only these four groups out of the metadata contract.
  assert.match(source, /const \{ model = \{\}, data_state: state = \{\}, coverage = \{\}, parameters = \{\} \} = metadata;/);

  // `source` is part of the gex_metadata data_state contract; it must stay unread.
  assert.doesNotMatch(source, /state\.source/);
  assert.doesNotMatch(source, /data_state\.source/);
  assert.doesNotMatch(source, /\bsource\b\s*[,}]/);
});

test('scanner rows do not carry raw provider strings into component props', () => {
  const source = fs.readFileSync(path.join(srcDir, 'pages/Scan.jsx'), 'utf8');

  // toScanRow previously built a dataMeta object holding row.source,
  // row.price_source and row.quote_source that nothing ever read.
  assert.doesNotMatch(source, /priceSource:/);
  assert.doesNotMatch(source, /quoteSource:/);
  assert.doesNotMatch(source, /dataMeta/);
});
