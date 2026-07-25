const test = require('node:test');
const assert = require('node:assert/strict');
const { toCandidateDto } = require('../src/domain/scanner/candidateDto.cjs');

function baseCandidate(overrides = {}) {
  return {
    strategy: 'Long Call', summary: 's', structure: 'x', pricing: 'p', legLabels: [],
    expiry: '2026-08-29', dte: 45, score: 60,
    directionConflict: false, directionNote: null, gammaNote: null,
    credit: null, debit: 2, maxLoss: 2, returnOnRisk: null, breakevens: [],
    legs: [{ action: 'BUY', expiry: '2026-08-29', dte: 45, strike: 105, right: 'C', bid: 2, ask: 2.1, delta: 0.3 }],
    ...overrides,
  };
}

test('toCandidateDto passes through gammaNote (informational, independent of directionConflict)', () => {
  const dto = toCandidateDto(baseCandidate({ gammaNote: '负 Gamma 环境：做市商对冲往往放大波动，利于做多 Gamma' }));
  assert.equal(dto.gammaNote, '负 Gamma 环境：做市商对冲往往放大波动，利于做多 Gamma');
  assert.equal(dto.directionConflict, false);
});

test('toCandidateDto defaults gammaNote to null when absent', () => {
  const dto = toCandidateDto(baseCandidate({ gammaNote: undefined }));
  assert.equal(dto.gammaNote, null);
});
