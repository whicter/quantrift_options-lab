const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/**
 * migrate.js must parse.
 *
 * On 2026-08-28 it did not, for four consecutive commits, and the full server
 * suite passed every time: nothing in test/ referenced the file. The cause was
 * a pair of backticks around an identifier in a SQL comment --
 *
 *     -- `refreshed_on` plus the stored min/max let the provider notice...
 *
 * -- inside the template literal that wraps the entire migration body. The
 * backtick closed the literal about 1150 lines early, and node reported
 * "SyntaxError: missing ) after argument list" pointing at line 11, nowhere
 * near the cause. Nothing ran: not the new table, not any pre-existing one.
 *
 * The whole migration is one `pool.query(`...`)` call, so any stray backtick
 * anywhere in ~1200 lines of SQL has this effect. Markdown habits make it an
 * easy thing to type into a comment.
 *
 * Parsed with vm.Script rather than require(): the module calls migrate() at
 * load time, so requiring it would run migrations against whatever DATABASE_URL
 * the test environment happens to carry.
 */

const MIGRATE = path.resolve(__dirname, '../src/migrate.js');

test('migrate.js parses as JavaScript', () => {
  const source = fs.readFileSync(MIGRATE, 'utf8');
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: MIGRATE }),
    'migrate.js has a syntax error; a backtick inside the SQL template literal '
    + 'is the usual cause, and node will report a line far from the real one',
  );
});

test('no backtick appears inside the migration SQL', () => {
  // Narrower and far more legible than the parse error, so a failure names the
  // actual offending line instead of pointing 1150 lines away.
  const lines = fs.readFileSync(MIGRATE, 'utf8').split('\n');
  const open = lines.findIndex(line => line.includes('pool.query(`'));
  assert.ok(open >= 0, 'expected the migration body to be one pool.query(`...`) call');

  const offenders = [];
  for (let i = open + 1; i < lines.length; i += 1) {
    if (lines[i].includes('`);')) break;            // end of the template literal
    if (lines[i].includes('`')) offenders.push(`${i + 1}: ${lines[i].trim()}`);
  }
  assert.deepEqual(offenders, [], 'these lines carry a backtick inside the SQL '
    + 'template literal, which ends it early -- use plain text in comments');
});
