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
