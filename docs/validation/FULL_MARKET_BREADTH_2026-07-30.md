# Full-Market EOD Breadth — 2026-07-30

## Product contract

“全市场”在此处指当日 Nasdaq、NYSE、NYSE American 主上市且有成交的
普通股，不是 Quantrift scan universe。ETF、OTC、优先股、权证和缺少当日
有效 close 的证券不进入统计。

The UI must disclose:

- target market date;
- comparable issue count versus that day's traded common-stock universe;
- advance / decline / unchanged counts;
- net advances and A/D ratio;
- advancing-volume percentage;
- per-exchange counts;
- how many stored sessions are present in the A/D history.

It must never substitute the options scan universe when this product is missing.

## Data path

```text
Polygon Grouped Daily (adjusted=true, include_otc=false)
        + point-in-time ticker references (market=stocks, type=CS,
          active=true, date=market_date, exchange=XNAS/XNYS/XASE)
        -> collect_market_breadth.py
        -> quality gate (counted >= 2000, prior-close coverage >= 90%)
        -> market_breadth_daily (one row per session, idempotent)
        -> GET /api/market/breadth.broad_market
        -> /market Market Internals
```

The collector finds the latest non-empty grouped session on or before the
expected settled date, then independently finds the previous real session.
This handles weekends and market holidays without treating a calendar weekday
as proof of a trading session.

## Isolation

`quantrift-market-breadth` is a PM2 one-shot scheduled at 17:05 and 19:05 PT on
weekdays. It does not enqueue `provider_fetch_jobs`, does not share the option
worker concurrency pool, and never calls IB. The second attempt can overwrite
the same market-date row safely if the first response was not yet finalized.

The API catches PostgreSQL `undefined_table` during additive deployment and
returns `broad_market.status=missing`, leaving the prior options-native breadth
available until migration and first collection complete.

## Code verification

- Collector targeted tests: 6/6 pass (`tests.test_market_breadth`).
- Frontend full suite: 100/100 pass.
- Server full suite: 247/247 pass.
- Additional final verification must run collector full suite, frontend lint,
  frontend production build and server syntax/tests after documentation edits.

## Production acceptance still required

The workspace's local `collector/.env` has no `POLYGON_API_KEY`, and the local
Railway CLI is not linked to the production project. Therefore the current
account's Grouped Daily entitlement has not been claimed as live-verified.

Before enabling the cron:

1. apply `node server/src/migrate.js` against Railway PostgreSQL;
2. run `collect_market_breadth.py` once with the production Polygon key;
3. require HTTP success plus `counted >= 2000` and `coverage_pct >= 90`;
4. query `market_breadth_daily` for exactly one target-date row;
5. verify `/api/market/breadth` and both UI themes;
6. only then `pm2 save`.

If the account returns 403, stop. Do not scrape display-only websites and do not
label Nasdaq-only public statistics as full-market breadth.
