const test = require('node:test');
const assert = require('node:assert/strict');
const { environmentEdge, RICH_IV_RANK, CHEAP_IV_RANK } = require('../src/domain/scanner/environmentEdge.cjs');
const { directionalWeight } = require('../src/domain/scanner/candidateEngine.cjs');

test('a high IV Rank states that premium is rich and favours the seller', () => {
  const edge = environmentEdge({ ivRank: 72 });
  assert.equal(edge.status, 'available');
  assert.equal(edge.premium, 'rich');
  assert.equal(edge.favours, 'seller');
  assert.match(edge.reason, /IV Rank 72/);
  assert.match(edge.reason, /高位/);
});

test('a low IV Rank states that premium is cheap and favours the buyer', () => {
  const edge = environmentEdge({ ivRank: 18 });
  assert.equal(edge.premium, 'cheap');
  assert.equal(edge.favours, 'buyer');
  assert.match(edge.reason, /低位/);
});

test('a mid IV Rank says neither side is favoured, rather than inventing a tilt', () => {
  const edge = environmentEdge({ ivRank: 45 });
  assert.equal(edge.premium, 'neutral');
  assert.equal(edge.favours, 'neither');
});

test('a missing IV Rank is unavailable, not neutral', () => {
  // "We cannot see the environment" and "the environment is balanced" are
  // different claims. IV Rank needs 252 observations, so a young listing
  // legitimately lands here and must not be reported as a neutral reading.
  const edge = environmentEdge({ ivRank: null });
  assert.equal(edge.status, 'unavailable');
  assert.equal(edge.premium, undefined);
  assert.match(edge.reason, /尚未就绪/);
});

test('dealer gamma is appended as context and never flips the premium call', () => {
  // IV Rank compares price to its own history -- a real divergence from current
  // pricing. Gamma regime only describes hedging behaviour. The weaker signal
  // must not overrule the measured one.
  const richButNegativeGamma = environmentEdge({ ivRank: 80, gammaRegime: 'negative' });
  assert.equal(richButNegativeGamma.premium, 'rich', 'IV Rank still decides');
  assert.equal(richButNegativeGamma.favours, 'seller');
  assert.match(richButNegativeGamma.reason, /负 Gamma/);
  assert.ok(richButNegativeGamma.inputs.includes('做市商负 Gamma'));
});

test('the stated view agrees with the weighting the engine actually applies', () => {
  // A stated reason that the scoring ignores would be worse than no reason at
  // all, so the thresholds must stay tied to directionalWeight's own tilt.
  const rich = environmentEdge({ ivRank: RICH_IV_RANK });
  assert.equal(rich.favours, 'seller');
  const sellerWeight = directionalWeight('Bull Put Spread', { ivRank: RICH_IV_RANK }).weight;
  const buyerWeight = directionalWeight('Long Call', { ivRank: RICH_IV_RANK }).weight;
  assert.ok(sellerWeight > buyerWeight, 'rich premium must actually favour the seller in scoring');

  const cheap = environmentEdge({ ivRank: CHEAP_IV_RANK });
  assert.equal(cheap.favours, 'buyer');
  const cheapBuyer = directionalWeight('Long Call', { ivRank: CHEAP_IV_RANK }).weight;
  const cheapSeller = directionalWeight('Bull Put Spread', { ivRank: CHEAP_IV_RANK }).weight;
  assert.ok(cheapBuyer > cheapSeller, 'cheap premium must actually favour the buyer in scoring');
});

test('the reason names its inputs so the view is auditable', () => {
  const edge = environmentEdge({ ivRank: 72, gammaRegime: 'positive' });
  assert.deepEqual(edge.inputs, ['IV Rank 72', '做市商正 Gamma']);
});

test('no reason ever instructs the user to trade', () => {
  for (const ivRank of [10, 45, 90]) {
    const { reason } = environmentEdge({ ivRank });
    assert.doesNotMatch(reason, /建议|应该|买入|卖出|入场/, `compliance: ${reason}`);
  }
});

test('disagreeing signals are labelled as disagreeing, not stated flatly', () => {
  // Live 2026-07-30: NVDA IV Rank 13 (favours buyer) with positive dealer gamma
  // (favours seller). Stating both flatly produced a sentence that read as a
  // self-contradiction. The conflict is real information and must be kept, but
  // it has to be presented as two lenses that differ.
  const conflicted = environmentEdge({ ivRank: 13, gammaRegime: 'positive' });
  assert.equal(conflicted.favours, 'buyer', 'IV Rank still decides the headline');
  assert.equal(conflicted.gammaFavours, 'seller');
  assert.equal(conflicted.signalsAgree, false);
  assert.match(conflicted.reason, /方向不同|相反/);
});

test('agreeing signals are labelled as confirming', () => {
  const aligned = environmentEdge({ ivRank: 80, gammaRegime: 'positive' });
  assert.equal(aligned.favours, 'seller');
  assert.equal(aligned.gammaFavours, 'seller');
  assert.equal(aligned.signalsAgree, true);
  assert.match(aligned.reason, /同向印证/);
});

test('a neutral premium reading never counts as agreement', () => {
  const neutral = environmentEdge({ ivRank: 45, gammaRegime: 'positive' });
  assert.equal(neutral.favours, 'neither');
  assert.equal(neutral.signalsAgree, false);
});

test('no gamma data leaves the agreement flag null rather than false', () => {
  // Unknown is not disagreement.
  const edge = environmentEdge({ ivRank: 80 });
  assert.equal(edge.gammaFavours, null);
  assert.equal(edge.signalsAgree, null);
});
