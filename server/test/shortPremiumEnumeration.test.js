const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ACTIONABLE_STRATEGIES,
  buildActionableSetups,
} = require('../src/domain/scanner/candidateEngine.cjs');
const { toPublicAnalyzeCandidate } = require('../src/domain/analyze/publicCandidateDto.cjs');
const { toCandidateDto } = require('../src/domain/scanner/candidateDto.cjs');

function contract(overrides) {
  return {
    expiry: '2026-09-18',
    dte: 34,
    strike: 100,
    right: 'C',
    bid: 2.0,
    ask: 2.1,
    delta: 0.3,
    iv: 0.3,
    openInterest: 500,
    volume: 200,
    ...overrides,
  };
}

// A chain wide enough for the short single-leg and strangle enumerators.
function chain() {
  const rows = [];
  for (const strike of [90, 95, 100, 105, 110]) {
    rows.push(contract({ strike, right: 'C', delta: 0.35 }));
    rows.push(contract({ strike, right: 'P', delta: -0.3 }));
  }
  return rows;
}

const row = { price_close: 100, call_wall: 120, put_wall: 80, gamma_regime: 'positive' };

function strategiesIn(setups) {
  return new Set(setups.map(s => s.strategy));
}

test('short premium is enumerated by default', () => {
  // Regression for the defect this fixes: the batch path passes {} for
  // overrides, so `allowUndefinedRisk === true` was never satisfied and all
  // three short strategies were absent from every batch -- and therefore from
  // candidate_ledger, which was measuring 10 of 13 strategies while reading as
  // though it covered the engine.
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);
  const present = strategiesIn(setups);
  assert.ok(present.has('Short Put'), 'Short Put must be enumerated with default rules');
  assert.ok(present.has('Short Call'), 'Short Call must be enumerated with default rules');
});

test('an explicit opt-out still suppresses the uncapped structures', () => {
  const setups = buildActionableSetups(
    chain(), row, { allowUndefinedRisk: false }, ACTIONABLE_STRATEGIES, null,
  );
  const present = strategiesIn(setups);
  assert.ok(!present.has('Short Call'), 'Short Call is uncapped and must respect the opt-out');
  assert.ok(!present.has('Short Strangle'), 'Short Strangle is uncapped and must respect the opt-out');
});

test('the opt-out does not take the cash-secured put with it', () => {
  // Short Put's loss is bounded at strike - credit, computed from real quotes.
  // Grouping it with the naked call under one "undefined risk" switch is what
  // made a defined-risk structure unavailable for months.
  const setups = buildActionableSetups(
    chain(), row, { allowUndefinedRisk: false }, ACTIONABLE_STRATEGIES, null,
  );
  assert.ok(strategiesIn(setups).has('Short Put'));
});

test('an uncapped structure scores zero on economics, not the not-computed default', () => {
  // Both a naked call and a calendar have returnOnRisk === null, for opposite
  // reasons: one has no denominator because the loss is unbounded, the other
  // because it was not computed. Paying the same neutral 5 points for each let
  // the riskiest structure outrank a defined one whose return merely happened
  // to be poor.
  //
  // scoreCandidate is private, so this pins the resulting scores for a fixed
  // chain instead. Reintroducing the subsidy raises each uncapped score by
  // exactly 5 and fails here -- which is the only way this regresses, since the
  // branch has no other effect.
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);

  const shortCall = setups.find(s => s.strategy === 'Short Call');
  assert.equal(shortCall.returnOnRisk, null);
  assert.equal(shortCall.riskClass, 'uncapped');
  assert.equal(shortCall.score, 52, 'a subsidised uncapped call would score 57');

  const strangle = setups.find(s => s.strategy === 'Short Strangle');
  assert.equal(strangle.returnOnRisk, null);
  assert.equal(strangle.score, 56, 'a subsidised strangle would score 61');

  // The cash-secured put has a real denominator, so it is scored on economics
  // rather than on either default -- it must not be caught by the same branch.
  const shortPut = setups.find(s => s.strategy === 'Short Put');
  assert.ok(shortPut.returnOnRisk > 0);
  assert.equal(shortPut.riskClass, 'cash_secured');
});

test('every short candidate carries a risk disclosure', () => {
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);
  for (const strategy of ['Short Put', 'Short Call']) {
    const candidate = setups.find(s => s.strategy === strategy);
    assert.ok(candidate, `expected a ${strategy} candidate`);
    assert.ok(candidate.riskDisclosure, `${strategy} must carry riskDisclosure`);
    assert.ok(candidate.riskDisclosure.level, `${strategy} disclosure needs a level`);
    assert.ok(candidate.riskDisclosure.reason, `${strategy} disclosure needs a reason`);
  }
  assert.equal(setups.find(s => s.strategy === 'Short Call').riskDisclosure.level, 'severe');
  assert.equal(setups.find(s => s.strategy === 'Short Put').riskDisclosure.level, 'elevated');
});

test('a cash-secured put reports the collateral its ratio hides', () => {
  // returnOnRisk is credit / maxLoss, so an $8,800 collateral requirement and a
  // $500 spread width can show the same figure. Capital has to be visible
  // separately or it is not visible at all.
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);
  const shortPut = setups.find(s => s.strategy === 'Short Put');
  assert.ok(shortPut.collateral > 0);
  assert.equal(shortPut.collateral, shortPut.legs[0].strike * 100);
});

test('the narrow Analyze boundary carries the disclosure but no internals', () => {
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);
  const shortCall = setups.find(s => s.strategy === 'Short Call');
  const dto = toPublicAnalyzeCandidate(shortCall);

  // maxLoss is null for an uncapped structure; without a disclosure a reader
  // cannot tell "unbounded" from "not computed".
  assert.equal(dto.maxLoss, null);
  assert.equal(dto.riskDisclosure.level, 'severe');

  const serialized = JSON.stringify(dto);
  for (const leaked of ['score', 'riskClass', 'collateral', 'minOpenInterest', 'avgSpreadPct']) {
    assert.ok(!serialized.includes(leaked), `${leaked} must not cross the narrow boundary`);
  }
});

test('the wide Scan boundary carries risk class and collateral', () => {
  const setups = buildActionableSetups(chain(), row, {}, ACTIONABLE_STRATEGIES, null);
  const shortPut = setups.find(s => s.strategy === 'Short Put');
  const dto = toCandidateDto(shortPut, { inputSnapshotTs: '2026-08-15T00:00:00.000Z' });
  assert.equal(dto.riskClass, 'cash_secured');
  assert.equal(dto.riskDisclosure.level, 'elevated');
  assert.ok(dto.collateral > 0);
});
