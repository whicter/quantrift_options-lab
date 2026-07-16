import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Analyze.jsx');
const source = fs.readFileSync(pagePath, 'utf8');

test('Analyze never imports or uses development mock analysis data', () => {
  assert.doesNotMatch(source, /mockAnalysis/);
  assert.doesNotMatch(source, /getMockAnalysis/);
  assert.match(source, /function createRealAnalysis/);
});
