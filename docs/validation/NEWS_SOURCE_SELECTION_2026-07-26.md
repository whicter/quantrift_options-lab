# News Ingestion (R3.2) — Source Selection — 2026-07-26

## Goal

Decide the data source for the news-ingestion MVP before writing any collector
code, per the project's own repeated lesson: verify a data source's real
availability/cost/limits with a live request, never assume from documentation
or general knowledge.

## Two candidates evaluated

### GDELT DOC 2.0 API

- Free, no API key.
- **Live test result: HTTP 429** on the very first request
  (`query=Tesla&mode=artlist&maxrecords=5&format=json&timespan=3d`), with the
  error body stating "limit requests to one every 5 seconds." A retry after a
  20-second wait **still 429'd** — the live limit is stricter than the
  documented "5 seconds," or there is an additional cooldown after a violation.
- At the documented rate, one pass over the 292-symbol watchlist would take
  ~25 minutes — workable for hourly refresh but with no slack, and the observed
  behavior suggests it may be worse in practice.
- Ticker association is not native: a news article must be matched to a symbol
  by string-matching the headline/body against company names or tickers, which
  is unreliable (e.g. "Block" collides with the common word).

### IB Gateway news API

- `reqNewsProviders` / `reqHistoricalNews` / `reqNewsArticle` via the existing
  local IB Gateway connection (already used for the option-chain fallback and,
  pending, P2.1 intraday spot).
- **Live test: `reqNewsProviders` returned 8 subscribed providers** — Dow Jones
  Global Equity Trader, Dow Jones Trader News, Dow Jones Top Stories
  (Asia Pacific / Europe / Global), Dow Jones Newsletters, Briefing.com General
  Market Columns, Briefing.com Analyst Actions. All already subscribed, $0
  incremental cost.
- **Live test: `reqHistoricalNews` for TSLA (conId 76792991), last 7 days,
  across all 6 relevant provider codes returned 10 real articles** — Dow
  Jones/Barron's analysis pieces ("Tesla's Robotaxi Deployments in Focus Ahead
  of 2Q Results", "Two Risks for Tesla Stock Not Everyone Is Talking About"),
  not generic wire noise.
- Ticker association is native and exact: news is requested by `conId`, so there
  is no string-matching ambiguity.

## Decision: IB only, no dual-source

GDELT is downgraded from a candidate primary source to "not in scope for the
MVP; a possible future fallback if the IB Gateway dependency becomes unreliable."
Rationale:

- Association quality: IB's conId-based association is exact; GDELT's
  string-matching is not, and building a second, separate association pipeline
  to reconcile the two sources doubles the complexity for the weaker half of
  the pair.
- Rate/reliability: IB's request path is local (no public rate limit observed
  in this test); GDELT's public 429 behavior is tighter than documented and
  leaves no margin.
- Cost: both are effectively $0 (IB providers already subscribed; GDELT is
  free), so cost is not a differentiator.
- Existing dependency: the project already depends on the Mac Studio IB Gateway
  for the option-chain fallback and (pending market-open acceptance) P2.1
  intraday spot, so adding news does not introduce a new failure mode, only
  extends an accepted one.

## Remaining before implementation

- How far back IB historical news can be queried (not yet tested).
- Whether requesting news for the full ~292-symbol watchlist in one pass
  triggers any IB-side pacing (the local Gateway has no public-internet rate
  limit like Polygon's `provider_rate_limits`, but batch behavior at this scale
  is untested).

## Implementation sketch (not yet built)

- New collector `collect_news.py`, skeleton mirrors `collect_reddit_trends.py`
  (`fetch → aggregate → persist_snapshot` with JSONB metadata), wired into
  `ecosystem.config.cjs` on a schedule.
- Symbol association via IB `conId` directly — do not reuse Reddit's
  `extract_symbols` string-matching helper; it solves a problem IB news does not
  have.
- New table stores `provider_code`/`article_id` (enables a future
  `reqNewsArticle` full-text fetch without a schema change).
- `GET /api/news/:symbol` + an Analyze "近期消息" section.
- Upgrades `synthesis.js::volatilityAttribution`'s "消息面" clause from
  overnight-gap granularity to a real headline when one exists for the day.

## Compliance boundary (unchanged)

Objective headlines + source attribution only. No "AI stock-picking" copy, no
packaging as a buy/sell signal, no interpretation invented beyond what the
source states.

## Files

- (none yet — this is the pre-implementation source-selection record)
