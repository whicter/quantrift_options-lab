import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Market.jsx');
const source = fs.readFileSync(pagePath, 'utf8');

test('state columns render every returned symbol inside their scroll area', () => {
  assert.match(source, /bucket\.symbols\.map\(/);
  assert.doesNotMatch(source, /CHIP_LIMIT/);
  assert.doesNotMatch(source, /bucket\.symbols\.slice\(/);
  assert.doesNotMatch(source, /\+\{bucket\.count/);
});
