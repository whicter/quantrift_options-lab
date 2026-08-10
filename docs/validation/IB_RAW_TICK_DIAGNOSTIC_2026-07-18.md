# IB Raw Tick Diagnostic

Date: 2026-07-18

## Command

```bash
cd collector
OPTION_DEBUG_SYMBOL=SPY OPTION_MAX_CONTRACTS=2 \
OPTION_MAX_STRIKES_PER_SIDE=1 IB_OPTION_CLIENT_ID=45 \
IB_TIMEOUT=20 IB_OPTION_SNAPSHOT_GRACE_SECONDS=2 \
.venv/bin/python debug_ib_option_ticks.py
```

## Result

Exit status: `0`.

- Gateway returned two actual SPY option contracts and `provider_status=ok`.
- Delayed option tick 83 supplied IV, delta, gamma, theta and vega.
- Tick 27/28 supplied open interest; tick 74 supplied volume; tick 68 supplied last.
- Underlying used historical-close fallback successfully.
- Bid/ask remained null. IB responses `10091` and `10167` state that API market data is not subscribed and delayed data is being displayed.

## Conclusion

The previous Gateway/historical-farm connectivity blocker is resolved. Complete executable quote coverage remains blocked by IB API quote entitlement; no code fallback may substitute last or model price for bid/ask.

## SUPERSEDED IN PART — 2026-08-09

**The bid/ask conclusion above is true only for delayed mode and must not be
generalised.** This run used `IB_MARKET_DATA_TYPE=3` (delayed), which is what
produced `10091`/`10167`. PM2 has since run `IB_MARKET_DATA_TYPE=1` (live) for
both `quantrift-options-collector` and `quantrift-options-quote-worker`, and IB
does deliver executable quotes in that mode:

```
snapshot 23608  ib_internal  2026-08-06 19:53  partial  44 rows  44 with bid  44 tradeable
```

All 44 contracts carried `bid > 0` and `ask > 0`. Nobody returned to update this
record after the mode change, so for three weeks the written record said IB
quotes were impossible while production was already collecting them — a reader
using this file to rule out the IB path would have been wrong.

Still true and unchanged:

- **No code fallback may substitute `last` or a model price for bid/ask.** This
  rule is independent of the entitlement question and is reinforced by the
  Polygon audit (`docs/validation/OPTION_QUOTE_COVERAGE_2026-08-09.md`).
- IB coverage is partial (44 of ~80 contracts vs Polygon on the same symbol) and
  quote quality on thin contracts needs filtering (observed 111% spreads and a
  324% IV in the same snapshot).

Full detail: `docs/validation/OPTION_QUOTE_COVERAGE_2026-08-09.md`.
