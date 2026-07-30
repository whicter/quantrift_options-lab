const test = require('node:test');
const assert = require('node:assert/strict');
const { interleaveByStrategy } = require('../src/domain/scanner/candidateEngine.cjs');

function candidate(strategy, effectiveScore, returnOnRisk = null) {
  return { strategy, effectiveScore, returnOnRisk };
}

// Ranking used to pool every candidate and sort globally, which silently ranks
// by enumeration size: on live batch 2056 Diagonal Spread produced 6,761 of
// 11,116 candidates against Long Put's 414. Drawing 16x more samples from the
// same quality distribution wins the top slots far more often -- a
// multiple-comparisons artifact, not a better strategy. That is how Diagonal
// Spread came to hold 71% of top-3-per-symbol slots while being the one family
// that cannot be settled at a single expiry.

test('a strategy with far more candidates cannot monopolize the top slots', () => {
  const many = Array.from({ length: 50 }, (_, i) => candidate('Diagonal Spread', 80 - i * 0.1));
  const few = [candidate('Long Put', 75), candidate('Long Put', 74)];
  const ordered = interleaveByStrategy([...many, ...few]);

  // Globally sorted, all 50 diagonals (80 down to 75.1) would precede both puts.
  const topFive = ordered.slice(0, 5).map(c => c.strategy);
  assert.ok(topFive.includes('Long Put'), 'the smaller family must reach the top slots');
  assert.equal(ordered[0].strategy, 'Diagonal Spread', 'the genuinely highest score still leads');
  assert.equal(ordered[1].strategy, 'Long Put', 'then the next family\'s best');
});

test('a genuinely stronger family still leads, order is not round-robin by name', () => {
  const ordered = interleaveByStrategy([
    candidate('Iron Condor', 60),
    candidate('Long Call', 90),
    candidate('Bull Put Spread', 75),
  ]);
  assert.deepEqual(ordered.map(c => c.strategy), ['Long Call', 'Bull Put Spread', 'Iron Condor']);
});

test('within one strategy the existing score ordering is preserved', () => {
  const ordered = interleaveByStrategy([
    candidate('Long Call', 70),
    candidate('Long Call', 90),
    candidate('Long Call', 80),
  ]);
  assert.deepEqual(ordered.map(c => c.effectiveScore), [90, 80, 70]);
});

test('every candidate survives -- interleaving reorders, it never drops', () => {
  const input = [
    ...Array.from({ length: 7 }, (_, i) => candidate('Diagonal Spread', 70 - i)),
    ...Array.from({ length: 3 }, (_, i) => candidate('Iron Condor', 65 - i)),
    candidate('Long Put', 60),
  ];
  const ordered = interleaveByStrategy(input);
  assert.equal(ordered.length, input.length);
  assert.equal(ordered.filter(c => c.strategy === 'Diagonal Spread').length, 7);
});

test('returnOnRisk still breaks a score tie', () => {
  const ordered = interleaveByStrategy([
    candidate('Long Call', 70, 0.1),
    candidate('Long Call', 70, 0.5),
  ]);
  assert.equal(ordered[0].returnOnRisk, 0.5);
});

test('an empty candidate list is safe', () => {
  assert.deepEqual(interleaveByStrategy([]), []);
});
