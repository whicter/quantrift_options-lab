from __future__ import annotations

import os
import threading
import time
from datetime import date, datetime

from .base import PriceBar


class IBPriceProvider:
    source = 'ib_internal'

    def __init__(self, host=None, port=None, client_id=None, timeout=None):
        self.host = host or os.getenv('IB_HOST', '127.0.0.1')
        self.port = int(port or os.getenv('IB_PORT', '4001'))
        self.client_id = int(client_id or os.getenv('IB_PRICE_CLIENT_ID', '12'))
        self.timeout = int(timeout or os.getenv('IB_TIMEOUT', '30'))

    def fetch_daily_bars(self, symbol: str, limit: int = 60) -> list[PriceBar]:
        try:
            from ibapi.client import EClient
            from ibapi.contract import Contract
            from ibapi.wrapper import EWrapper
        except ImportError as exc:
            raise RuntimeError('ibapi is not installed. Install ibapi or set PRICE_PROVIDER=stooq for dev backfill.') from exc

        provider = self

        class App(EWrapper, EClient):
            def __init__(self):
                EClient.__init__(self, self)
                self.ready = threading.Event()
                self.done = threading.Event()
                self.error_msg = None
                self.bars = []

            def nextValidId(self, orderId):  # noqa: N802 - ibapi callback name
                self.ready.set()

            def historicalData(self, reqId, bar):  # noqa: N802
                self.bars.append(bar)

            def historicalDataEnd(self, reqId, start, end):  # noqa: N802
                self.done.set()

            def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=''):  # noqa: N802
                if errorCode not in (2104, 2106, 2158):
                    self.error_msg = f'IB error {errorCode}: {errorString}'
                    self.done.set()

        app = App()
        app.connect(self.host, self.port, self.client_id)
        thread = threading.Thread(target=app.run, daemon=True)
        thread.start()

        if not app.ready.wait(self.timeout):
            app.disconnect()
            raise TimeoutError(f'IB connection timed out: {self.host}:{self.port}')

        contract = Contract()
        contract.symbol = _ib_contract_symbol(symbol)
        contract.secType = 'STK'
        contract.exchange = 'SMART'
        contract.currency = 'USD'

        app.reqHistoricalData(
            1,
            contract,
            '',
            f'{max(90, limit * 2)} D',
            '1 day',
            'TRADES',
            1,
            1,
            False,
            [],
        )

        if not app.done.wait(self.timeout):
            app.disconnect()
            raise TimeoutError(f'IB historical data timed out for {symbol}')

        app.disconnect()
        if app.error_msg:
            raise RuntimeError(app.error_msg)

        rows = []
        for bar in app.bars:
            bar_date = _parse_ib_date(bar.date)
            rows.append(PriceBar(
                symbol=symbol.upper(),
                date=bar_date,
                open=float(bar.open),
                high=float(bar.high),
                low=float(bar.low),
                close=float(bar.close),
                volume=int(float(bar.volume)) if bar.volume is not None else None,
                source=provider.source,
            ))

        return rows[-limit:]


def _parse_ib_date(value: str) -> date:
    if len(value) == 8 and value.isdigit():
        return datetime.strptime(value, '%Y%m%d').date()
    return datetime.fromisoformat(value).date()


def _ib_contract_symbol(symbol: str) -> str:
    """Map display/DB ticker to IB's stock contract symbol where needed."""
    return symbol.upper().replace('.', ' ')
