"""Shortable-share availability from IB.

Cost-to-borrow is the measure a short-squeeze read actually wants, and Polygon
does not carry it; Ortex and S3 sell it for four figures a year. IB does not
expose the fee rate over this API path either -- generic tick 236 returns
availability but tick 47 never arrives -- but availability is the same scarcity
seen from the other side: when the lendable pool collapses the fee spikes. The
level is a snapshot, so the usable signal is its trend, which is why this is
captured daily rather than read on demand.

Tick types returned for generic tick 236:
  46 (generic) Shortable   >2.5 available, 1.5-2.5 hard to borrow, <1.5 none
  89 (size)    ShortableShares

Measured 2026-08-12 against the running gateway: GME 6,134,175 shares,
UUUU 655,587, AAPL 86,673,328, all at level 3.0.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass

from ibapi.client import EClient
from ibapi.contract import Contract
from ibapi.wrapper import EWrapper

log = logging.getLogger(__name__)

# IB's own encoding of the availability tiers, kept as data so a caller never
# has to rediscover what 3.0 means.
LEVEL_AVAILABLE = 2.5
LEVEL_HARD_TO_BORROW = 1.5

# IB reserves 2100-2199 for warnings and system notices. Enumerating them
# individually is how good data gets thrown away by an unfamiliar code: 2176
# ("API version does not support fractional share size rules... Trimmed value
# 5349354.640999 to 5349354") arrives alongside a perfectly good tick, and
# treating it as fatal marked every one of the first 12 symbols as an error
# while the values sat in hand.
def _is_warning(code: int) -> bool:
    return 2100 <= code < 2200


@dataclass
class BorrowAvailability:
    symbol: str
    shortable_shares: int | None
    shortable_level: float | None
    status: str  # ok | no_data | not_shortable | error


class _App(EWrapper, EClient):
    def __init__(self) -> None:
        EClient.__init__(self, self)
        self.ready = threading.Event()
        self.done: dict[int, threading.Event] = {}
        self.shares: dict[int, int] = {}
        self.level: dict[int, float] = {}
        self.errors: dict[int, tuple[int, str]] = {}

    def nextValidId(self, orderId):  # noqa: N803 - ibapi signature
        self.ready.set()

    def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=''):  # noqa: N803
        if _is_warning(errorCode):
            return
        self.errors[reqId] = (errorCode, errorString)
        event = self.done.get(reqId)
        if event:
            event.set()

    def tickGeneric(self, reqId, tickType, value):  # noqa: N803
        if tickType == 46:
            self.level[reqId] = float(value)
            self._maybe_done(reqId)

    def tickSize(self, reqId, tickType, size):  # noqa: N803
        if tickType == 89:
            self.shares[reqId] = int(size)
            self._maybe_done(reqId)

    def _maybe_done(self, req_id: int) -> None:
        # Release as soon as both halves have arrived rather than waiting out
        # the timeout on every symbol -- the difference across a few hundred
        # names is minutes, and this lane is serial.
        if req_id in self.level and req_id in self.shares:
            event = self.done.get(req_id)
            if event:
                event.set()


class IbBorrowProvider:
    source = 'ib_internal'

    def __init__(self, host=None, port=None, client_id=None, timeout=None) -> None:
        self.host = host or os.getenv('IB_HOST', '127.0.0.1')
        self.port = int(port or os.getenv('IB_PORT', '4001'))
        # Distinct from the option chain (42), price (12) and news (55) lanes,
        # and from the other project already on this gateway (96).
        self.client_id = int(client_id or os.getenv('IB_BORROW_CLIENT_ID', '44'))
        self.timeout = float(timeout or os.getenv('IB_TIMEOUT', '30'))
        self.per_symbol_timeout = float(os.getenv('IB_BORROW_SYMBOL_TIMEOUT', '4'))
        self.symbol_delay = float(os.getenv('IB_BORROW_SYMBOL_DELAY', '0.05'))

    def _connect(self) -> _App:
        app = _App()
        app.connect(self.host, self.port, self.client_id)
        threading.Thread(target=app.run, daemon=True).start()
        if not app.ready.wait(self.timeout):
            app.disconnect()
            raise TimeoutError('IB gateway did not return nextValidId')
        return app

    def fetch(self, symbols: list[str]) -> list[BorrowAvailability]:
        app = self._connect()
        out: list[BorrowAvailability] = []
        try:
            for index, symbol in enumerate(symbols):
                if not app.isConnected():
                    # ibapi does not raise on disconnect, so an unreachable
                    # gateway would otherwise burn one full timeout per symbol.
                    log.warning('IB connection lost after %s symbols', len(out))
                    for remaining in symbols[index:]:
                        out.append(BorrowAvailability(remaining, None, None, 'error'))
                    break
                out.append(self._fetch_one(app, symbol, 400 + index))
                if self.symbol_delay:
                    time.sleep(self.symbol_delay)
        finally:
            app.disconnect()
        return out

    def _fetch_one(self, app: _App, symbol: str, req_id: int) -> BorrowAvailability:
        contract = Contract()
        contract.symbol = symbol
        contract.secType = 'STK'
        contract.exchange = 'SMART'
        contract.currency = 'USD'
        app.done[req_id] = threading.Event()
        app.reqMktData(req_id, contract, '236', False, False, [])
        app.done[req_id].wait(self.per_symbol_timeout)
        try:
            app.cancelMktData(req_id)
        except Exception:  # noqa: BLE001 - cancel is best effort
            pass

        level = app.level.get(req_id)
        shares = app.shares.get(req_id)
        # Data in hand outranks a reported error. IB can emit a notice and a
        # usable tick for the same request, and discarding the tick because a
        # message also arrived loses a real observation.
        if req_id in app.errors and level is None and shares is None:
            code, message = app.errors[req_id]
            log.debug('%s: IB error %s %s', symbol, code, message)
            return BorrowAvailability(symbol, None, None, 'error')
        if level is None and shares is None:
            return BorrowAvailability(symbol, None, None, 'no_data')
        # A name IB will not lend is a real observation, not a gap: it is the
        # extreme of the same scale the trend is measured on.
        if level is not None and level < LEVEL_HARD_TO_BORROW:
            return BorrowAvailability(symbol, shares, level, 'not_shortable')
        return BorrowAvailability(symbol, shares, level, 'ok')
