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
 * into the UI.
 *
 * They do NOT prove a runtime value can never be rendered: these strings arrive
 * from the API at request time. The durable fix is the server downgrading
 * provider/source for normal users (V3A-4 / E10 in docs/task.md); until then the
 * guarantee also rests on no component reading the field.
 */

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const INTERNAL_SOURCE_NAMES = ['polygon_licensed', 'ib_internal', 'tt_internal', 'tastytrade', 'stooq'];
const INTERNAL_UI_FRAGMENTS = [
  '模型版本',
  '计算参数',
  '定位假设',
  '聚类容差',
  '固定规则',
  '启发式综合评分',
  '模型筛选结果',
  '公开 OI 的模型估算',
  '按 (ask-bid)/mid 计算',
  'GEX 用 Gamma、OI、合约乘数',
  'S/R 基于',
  '模型平滑趋势',
  '模型一标准差区间',
  '模型估算 POP',
  '模型情景 P/L',
  '数据源：',
  'DataDetails',
  '赔付按「标的走到',
  '两侧胜率不可直接比较：买方胜率按',
  '{environment.reason}',
  '{structure.reason}',
  'structure.expressionText',
];

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

test('scanner rows do not carry raw provider strings into component props', () => {
  const source = fs.readFileSync(path.join(srcDir, 'pages/Scan.jsx'), 'utf8');

  // toScanRow previously built a dataMeta object holding row.source,
  // row.price_source and row.quote_source that nothing ever read.
  assert.doesNotMatch(source, /priceSource:/);
  assert.doesNotMatch(source, /quoteSource:/);
  assert.doesNotMatch(source, /dataMeta/);
});

test('product UI does not disclose implementation or algorithm details', () => {
  const productFiles = productionSources(srcDir).filter(file => {
    const relative = path.relative(srcDir, file);
    return relative.startsWith('pages/')
      || relative.startsWith('components/')
      || relative === 'lib/synthesis.js';
  });
  const offenders = [];
  for (const file of productFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const fragment of INTERNAL_UI_FRAGMENTS) {
      if (content.includes(fragment)) offenders.push(`${path.relative(srcDir, file)}: ${fragment}`);
    }
  }
  assert.deepEqual(offenders, [], `implementation details must not appear in product UI:\n${offenders.join('\n')}`);
});

test('display adapters drop internal metadata fields', () => {
  const analysis = fs.readFileSync(path.join(srcDir, 'lib/analyzeData.js'), 'utf8');
  const recommendation = fs.readFileSync(path.join(srcDir, 'lib/analyzeRecommendation.js'), 'utf8');
  const technical = fs.readFileSync(path.join(srcDir, 'lib/technicalLevels.js'), 'utf8');

  assert.doesNotMatch(analysis, /\bgexMeta\s*:/);
  assert.doesNotMatch(analysis, /\bproviderStatus\s*:/);
  assert.doesNotMatch(analysis, /\bwallMethod\s*:/);
  assert.doesNotMatch(analysis, /\brawMetrics\s*:/);
  assert.doesNotMatch(technical, /\bevidence\s*:/);
  assert.doesNotMatch(technical, /\bscore\s*:/);
  assert.doesNotMatch(recommendation, /candidateResponse\.environment\.(?:reason|inputs|ivRank|gammaFavours)/);
  assert.doesNotMatch(recommendation, /candidateResponse\.structure\.(?:reason|confirmations|support|expression|caveat)/);
});
