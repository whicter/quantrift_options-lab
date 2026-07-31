# Analyze Decision Rules — Internal Only

> **Confidentiality boundary**
>
> This document is for backend implementation, replay, validation and
> administrator review. Its thresholds, weights, input selection, rule reasons
> and strategy mappings must not be rendered by product pages or serialized by
> normal product APIs. Public Analyze responses are governed by
> `server/src/domain/analyze/publicCandidateDto.cjs`.

## 1. Candidate environment inputs

`GET /api/analyze/:symbol/candidate` builds a backend-only environment object:

- `trendRegime`: derived from the latest daily closes.
- `ivRank`: latest ready derived IV Rank.
- `gammaRegime`: latest GEX snapshot regime.

Trend classification uses the most recent 30 closes:

- 10-bar average more than 1% above the 30-bar average → `bull`.
- 10-bar average more than 1% below the 30-bar average → `bear`.
- Otherwise → `neutral`.
- Fewer than 12 usable closes or a query failure → unavailable; it never blocks
  candidate generation.

## 2. Candidate ordering weights

`candidateEngine.cjs::directionalWeight()` applies independent multiplicative
tilts when an input is available:

### Trend

- Bull trend + bullish strategy → `×1.15`.
- Bull trend + bearish strategy → `×0.30` and direction conflict.
- Bear trend + bearish strategy → `×1.15`.
- Bear trend + bullish strategy → `×0.30` and direction conflict.
- Neutral trend + neutral strategy → `×1.10`.

### IV Rank

- IV Rank `>= 60` + short-premium strategy → `×1.10`.
- IV Rank `<= 30` + long-premium strategy → `×1.10`.
- IV Rank `>= 60` + long-premium strategy → `×0.90`.

### Gamma regime

- Negative Gamma + long-gamma strategy → `×1.10`.
- Positive Gamma + long-gamma strategy → `×0.90`.
- Positive Gamma + short-gamma strategy → `×1.10`.
- Negative Gamma + short-gamma strategy → `×0.90`.

Gamma is a soft ordering tilt and never creates a direction-conflict flag.

## 3. Environment classification

`environmentEdge.cjs` converts IV Rank into an internal environment view:

| Condition | Premium state | Favours |
|---|---|---|
| IV Rank `>= 60` | `rich` | `seller` |
| IV Rank `<= 30` | `cheap` | `buyer` |
| Between 30 and 60 | `neutral` | `neither` |
| IV Rank unavailable | unavailable | none |

Gamma context is evaluated separately:

- Negative Gamma → buyer/long-gamma context.
- Positive Gamma → seller/short-gamma context.
- `signalsAgree` is true only when the Gamma direction matches a non-neutral IV
  Rank direction.

The complete internal object may contain exact IV Rank, Gamma direction,
human-readable reason and named input list. None of those fields may cross the
normal Analyze API boundary.

## 4. Pullback-support detection

`derivePullbackStructure()` requires 200 daily bars. It reuses the market-state,
support/resistance, Focus/RSI and MFI derivations rather than recomputing them in
the browser.

`pullbackStructure.cjs` requires the market state to be `S2` (uptrend with a
short-term pullback). It then evaluates these optional confirmations:

| Confirmation | Internal rule |
|---|---|
| Near support | Nearest technical support or Put Wall below spot is within 3% |
| RSI oversold | RSI14 `<= 35` |
| MFI oversold | MFI14 `<= 20` |
| Fear priced | IV Rank `>= 60` |

At least two confirmations are required for `status=present`. Fewer than two is
`weak`; a non-S2 state is `absent`; insufficient history is `unavailable`.

For a present structure, the internal strategy-expression mapping is:

- Rich premium (`IV Rank >= 60`) → seller side,
  `put_spread_below_support`.
- Otherwise → buyer side, `long_call`.

The internal object may contain confirmation text, support kind/level/distance,
expression shape/text, exact reason and caveat. The public API may expose only
that a present state exists and the high-level favoured side.

## 5. Buyer/seller pairing and payoff

The candidate engine ranks all supported setups, then Analyze selects:

- Main candidate: first ranked candidate.
- Buyer: first debit candidate with available POP and payoff.
- Seller: first credit candidate with available POP and payoff.

An unevaluable debit candidate such as a multi-expiry diagonal is skipped
instead of producing an empty buyer card.

Internal payoff mechanics:

- Credit structures use credit divided by maximum loss.
- An Iron Butterfly peak is marked `peak_requires_pin` because its maximum
  requires expiry at the body strike.
- A single-leg long option is evaluated at one expected move in its favour;
  expected move uses the mean IV of the nearest ATM call/put and
  `spot × IV × sqrt(DTE/365)`.
- POP uses a risk-neutral lognormal expiry distribution and executable
  breakevens.

The public DTO may expose only the estimated probability, reward/risk result and
the pin-risk boolean. Model version, distribution, rate, IV input, breakeven
calculation, basis, reference price/profit and input snapshot time remain
backend-only.

## 6. Public Analyze DTO allowlist

Normal `GET /api/analyze/:symbol/candidate` responses may contain:

- Top level: `symbol`, `status`, `candidate`, `buyer`, `seller`, `environment`,
  `structure`.
- Environment: `status`, `premium`, `favours`, `signalsAgree`.
- Structure: `status`, `favours`.
- Candidate/side: strategy, display structure, DTE, direction-conflict boolean,
  credit/debit, maximum loss, display-safe POP/payoff and selected leg facts.
- Leg: action, DTE, strike, right and Delta.

The following must never be serialized by this product endpoint:

- `reason`, `inputs`, `confirmations`, support evidence or expression text.
- Thresholds, weights, score, ranking rationale, `gammaNote` or
  `directionNote`.
- Expected-move internals, POP model metadata, payoff basis/reference scenario
  or input snapshot IDs.
- Bid/ask chain rows, contract symbols, provider/source/provenance or raw
  errors.

There is currently no normal or admin endpoint that returns the full decision
objects. They remain in backend code and tests. Any future administrator view
must use a separate admin route protected by `ADMIN_API_TOKEN`; it must not add
an `admin=true` branch to the normal product response.

## 7. Regression contract

- `server/test/analyzePublicCandidateDto.test.js` validates the allowlist.
- `server/test/analyzeRoute.test.js` verifies the route response does not carry
  private decision fields.
- `frontend/src/lib/analyzeRecommendation.test.js` verifies the browser adapter
  consumes only the safe contract.
- `frontend/src/lib/providerDisclosure.test.js` blocks implementation copy from
  product components.
