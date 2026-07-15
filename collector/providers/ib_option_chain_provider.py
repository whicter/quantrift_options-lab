from __future__ import annotations

import os
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .base import OptionChainSnapshot, OptionContractSnapshot, UnderlyingSnapshot


class IbOptionChainProvider:
    """Internal IB Gateway adapter skeleton for Phase 3D.

    This adapter is intentionally not wired to production APIs. It will be used
    to validate the provider contract and snapshot schema before a licensed
    options-data provider is integrated.
    """

    source = 'ib_internal'

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        client_id: int | None = None,
        timeout: float | None = None,
    ) -> None:
        self.host = host or os.getenv('IB_HOST', '127.0.0.1')
        self.port = int(port or os.getenv('IB_PORT', '4001'))
        self.client_id = int(client_id or os.getenv('IB_OPTION_CLIENT_ID', '42'))
        self.timeout = float(timeout or os.getenv('IB_TIMEOUT', '30'))
        self.min_dte = int(os.getenv('OPTION_MIN_DTE', '0'))
        self.max_dte = int(os.getenv('OPTION_MAX_DTE', '90'))
        self.dte_buckets = _parse_dte_buckets(os.getenv('OPTION_DTE_BUCKETS', '0-14,30-60,60-90'))
        self.max_expirations_per_bucket = int(os.getenv('OPTION_MAX_EXPIRATIONS_PER_BUCKET', '1'))
        self.strike_window_pct = float(os.getenv('OPTION_STRIKE_WINDOW_PCT', '15'))
        self.max_strikes_per_side = int(os.getenv('OPTION_MAX_STRIKES_PER_SIDE', '20'))
        self.max_contracts = int(os.getenv('OPTION_MAX_CONTRACTS', '240'))
        self.max_contracts_per_expiration = int(os.getenv('OPTION_MAX_CONTRACTS_PER_EXPIRATION', '80'))
        self.contract_delay = float(os.getenv('IB_OPTION_CONTRACT_DELAY', '0.05'))
        self.snapshot_grace_seconds = float(os.getenv('IB_OPTION_SNAPSHOT_GRACE_SECONDS', '2'))

    def fetch_underlying(self, symbol: str) -> UnderlyingSnapshot:
        app = self._connect()
        try:
            contract = self._stock_contract(symbol)
            req_id = app.next_req_id()
            app.market_data[req_id] = _MarketData()
            app.reqMktData(req_id, contract, '', True, False, [])

            if not app.wait_for_snapshot(req_id, self.timeout):
                raise TimeoutError(f'IB underlying quote timed out for {symbol}')
            data = app.market_data[req_id]
            price = data.last or data.close or _mid(data.bid, data.ask)
            price_source = 'quote'
            if price is None:
                price = self._fetch_historical_close(app, contract, symbol)
                price_source = 'historical_close'
            return UnderlyingSnapshot(
                symbol=symbol.upper(),
                price=price,
                bid=data.bid,
                ask=data.ask,
                timestamp=datetime.now(timezone.utc),
                source=self.source,
                raw={**data.raw, 'price_source': price_source},
            )
        finally:
            app.disconnect()

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
    ) -> OptionChainSnapshot:
        symbol = symbol.upper()
        app = self._connect()
        snapshot_ts = datetime.now(timezone.utc)
        raw_metadata: dict[str, Any] = {}

        try:
            stock_contract = self._stock_contract(symbol)
            details = self._resolve_underlying(app, stock_contract, symbol)
            underlying_con_id = int(details.contract.conId)
            trading_class = getattr(details.contract, 'tradingClass', '') or symbol

            underlying = self._fetch_underlying_with_app(app, stock_contract, symbol)
            if underlying.price is None:
                raise RuntimeError(f'IB underlying price unavailable for {symbol}')

            params = self._fetch_option_params(app, symbol, underlying_con_id)
            selected_expirations = self._select_expirations(params['expirations'], expirations)
            selected_strikes = self._select_strikes(
                params['strikes'],
                underlying.price,
                strike_window_pct if strike_window_pct is not None else self.strike_window_pct,
                max_strikes_per_side if max_strikes_per_side is not None else self.max_strikes_per_side,
            )

            raw_metadata = {
                'underlying_con_id': underlying_con_id,
                'trading_class': trading_class,
                'available_expiration_count': len(params['expirations']),
                'available_strike_count': len(params['strikes']),
                'selected_expirations': [d.isoformat() for d in selected_expirations],
                'selected_strike_count': len(selected_strikes),
                'strike_window_pct': strike_window_pct if strike_window_pct is not None else self.strike_window_pct,
                'max_strikes_per_side': max_strikes_per_side if max_strikes_per_side is not None else self.max_strikes_per_side,
                'dte_buckets': [list(bucket) for bucket in self.dte_buckets],
                'max_expirations_per_bucket': self.max_expirations_per_bucket,
            }

            contracts = []
            contracts_by_expiry: dict[date, int] = {}
            for expiry in selected_expirations:
                for strike in selected_strikes:
                    for right in ('C', 'P'):
                        if len(contracts) >= self.max_contracts:
                            break
                        expiry_count = contracts_by_expiry.get(expiry, 0)
                        if expiry_count >= self.max_contracts_per_expiration:
                            break
                        contract = self._option_contract(symbol, expiry, strike, right, trading_class)
                        contracts.append(self._fetch_contract_snapshot(app, contract, symbol, expiry, strike, right))
                        contracts_by_expiry[expiry] = expiry_count + 1
                        if self.contract_delay > 0:
                            time.sleep(self.contract_delay)
                    if len(contracts) >= self.max_contracts:
                        break
                if len(contracts) >= self.max_contracts:
                    break

            missing_greeks = sum(1 for c in contracts if c.gamma is None or c.delta is None)
            missing_oi = sum(1 for c in contracts if c.open_interest is None)
            raw_metadata.update({
                'requested_contract_count': len(selected_expirations) * len(selected_strikes) * 2,
                'returned_contract_count': len(contracts),
                'missing_greeks_count': missing_greeks,
                'missing_oi_count': missing_oi,
                'max_contracts': self.max_contracts,
                'max_contracts_per_expiration': self.max_contracts_per_expiration,
            })

            return OptionChainSnapshot(
                symbol=symbol,
                underlying=underlying,
                contracts=contracts,
                snapshot_ts=snapshot_ts,
                source=self.source,
                provider_status='ok' if contracts else 'empty',
                raw_metadata=raw_metadata,
            )
        finally:
            app.disconnect()

    def _connect(self):
        try:
            from ibapi.client import EClient
            from ibapi.contract import Contract
            from ibapi.wrapper import EWrapper
        except ImportError as exc:
            raise RuntimeError('ibapi is not installed. Install collector requirements before using IB option chain provider.') from exc

        provider = self

        class App(EWrapper, EClient):
            def __init__(self):
                EClient.__init__(self, self)
                self.ready = threading.Event()
                self.error_msg = None
                self._next_req_id = 1000
                self.contract_details: dict[int, list[Any]] = {}
                self.contract_details_done: dict[int, threading.Event] = {}
                self.option_params: dict[int, dict[str, set[Any]]] = {}
                self.option_params_done: dict[int, threading.Event] = {}
                self.market_data: dict[int, _MarketData] = {}
                self.snapshot_done: dict[int, threading.Event] = {}
                self.historical_bars: dict[int, list[Any]] = {}
                self.historical_done: dict[int, threading.Event] = {}

            def next_req_id(self):
                self._next_req_id += 1
                return self._next_req_id

            def nextValidId(self, orderId):  # noqa: N802
                self.ready.set()

            def contractDetails(self, reqId, contractDetails):  # noqa: N802
                self.contract_details.setdefault(reqId, []).append(contractDetails)

            def contractDetailsEnd(self, reqId):  # noqa: N802
                self.contract_details_done.setdefault(reqId, threading.Event()).set()

            def securityDefinitionOptionParameter(self, reqId, exchange, underlyingConId, tradingClass, multiplier, expirations, strikes):  # noqa: N802
                bucket = self.option_params.setdefault(reqId, {'expirations': set(), 'strikes': set(), 'trading_classes': set(), 'multipliers': set()})
                bucket['expirations'].update(expirations)
                bucket['strikes'].update(strikes)
                if tradingClass:
                    bucket['trading_classes'].add(tradingClass)
                if multiplier:
                    bucket['multipliers'].add(multiplier)

            def securityDefinitionOptionParameterEnd(self, reqId):  # noqa: N802
                self.option_params_done.setdefault(reqId, threading.Event()).set()

            def tickPrice(self, reqId, tickType, price, attrib):  # noqa: N802
                data = self.market_data.setdefault(reqId, _MarketData())
                data.apply_price(tickType, price)

            def tickSize(self, reqId, tickType, size):  # noqa: N802
                data = self.market_data.setdefault(reqId, _MarketData())
                data.apply_size(tickType, size)

            def tickOptionComputation(self, reqId, tickType, tickAttrib, impliedVol, delta, optPrice, pvDividend, gamma, vega, theta, undPrice):  # noqa: N802
                data = self.market_data.setdefault(reqId, _MarketData())
                data.apply_greeks(tickType, impliedVol, delta, gamma, theta, vega, optPrice, undPrice)

            def tickSnapshotEnd(self, reqId):  # noqa: N802
                self.snapshot_done.setdefault(reqId, threading.Event()).set()

            def historicalData(self, reqId, bar):  # noqa: N802
                self.historical_bars.setdefault(reqId, []).append(bar)

            def historicalDataEnd(self, reqId, start, end):  # noqa: N802
                self.historical_done.setdefault(reqId, threading.Event()).set()

            def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=''):  # noqa: N802
                if errorCode not in (2104, 2106, 2158, 10167, 354):
                    self.error_msg = f'IB error {errorCode}: {errorString}'
                if reqId >= 0:
                    data = self.market_data.setdefault(reqId, _MarketData())
                    data.apply_error(errorCode, errorString)
                if reqId in self.snapshot_done:
                    self.snapshot_done[reqId].set()

            def wait_for_snapshot(self, req_id, timeout):
                return self.snapshot_done.setdefault(req_id, threading.Event()).wait(timeout)

        app = App()
        app.connect(provider.host, provider.port, provider.client_id)
        thread = threading.Thread(target=app.run, daemon=True)
        thread.start()
        if not app.ready.wait(provider.timeout):
            app.disconnect()
            raise TimeoutError(f'IB connection timed out: {provider.host}:{provider.port}')
        app.reqMarketDataType(3)
        return app

    def _resolve_underlying(self, app, contract, symbol: str):
        req_id = app.next_req_id()
        app.contract_details_done[req_id] = threading.Event()
        app.reqContractDetails(req_id, contract)
        if not app.contract_details_done[req_id].wait(self.timeout):
            raise TimeoutError(f'IB contract details timed out for {symbol}')
        details = app.contract_details.get(req_id, [])
        if not details:
            raise RuntimeError(f'IB contract details empty for {symbol}')
        return details[0]

    def _fetch_option_params(self, app, symbol: str, underlying_con_id: int):
        req_id = app.next_req_id()
        app.option_params_done[req_id] = threading.Event()
        app.reqSecDefOptParams(req_id, symbol, '', 'STK', underlying_con_id)
        if not app.option_params_done[req_id].wait(self.timeout):
            raise TimeoutError(f'IB option params timed out for {symbol}')
        params = app.option_params.get(req_id) or {'expirations': set(), 'strikes': set()}
        expirations = sorted(_parse_expiration(value) for value in params['expirations'] if _parse_expiration(value))
        strikes = sorted(float(value) for value in params['strikes'] if value is not None)
        if not expirations or not strikes:
            raise RuntimeError(f'IB option params empty for {symbol}')
        return {'expirations': expirations, 'strikes': strikes}

    def _fetch_underlying_with_app(self, app, contract, symbol: str) -> UnderlyingSnapshot:
        req_id = app.next_req_id()
        app.market_data[req_id] = _MarketData()
        app.snapshot_done[req_id] = threading.Event()
        app.reqMktData(req_id, contract, '', True, False, [])
        if not app.wait_for_snapshot(req_id, self.timeout):
            raise TimeoutError(f'IB underlying quote timed out for {symbol}')
        data = app.market_data[req_id]
        price = data.last or data.close or _mid(data.bid, data.ask)
        price_source = 'quote'
        if price is None:
            price = self._fetch_historical_close(app, contract, symbol)
            price_source = 'historical_close'
        return UnderlyingSnapshot(
            symbol=symbol.upper(),
            price=price,
            bid=data.bid,
            ask=data.ask,
            timestamp=datetime.now(timezone.utc),
            source=self.source,
            raw={**data.raw, 'price_source': price_source},
        )

    def _fetch_historical_close(self, app, contract, symbol: str) -> float | None:
        req_id = app.next_req_id()
        app.historical_done[req_id] = threading.Event()
        app.reqHistoricalData(
            req_id,
            contract,
            '',
            '5 D',
            '1 day',
            'TRADES',
            1,
            1,
            False,
            [],
        )
        if not app.historical_done[req_id].wait(self.timeout):
            raise TimeoutError(f'IB historical fallback timed out for {symbol}')
        bars = app.historical_bars.get(req_id, [])
        if not bars:
            return None
        return float(bars[-1].close)

    def _fetch_contract_snapshot(self, app, contract, symbol: str, expiry: date, strike: float, right: str) -> OptionContractSnapshot:
        req_id = app.next_req_id()
        app.market_data[req_id] = _MarketData()
        app.snapshot_done[req_id] = threading.Event()
        app.reqMktData(req_id, contract, '100,101,106', True, False, [])
        if not app.wait_for_snapshot(req_id, self.timeout):
            data = app.market_data[req_id]
        else:
            data = app.market_data[req_id]
            if not data.has_option_payload() and self.snapshot_grace_seconds > 0:
                time.sleep(self.snapshot_grace_seconds)
                data = app.market_data[req_id]

        return OptionContractSnapshot(
            symbol=symbol.upper(),
            expiry=expiry,
            strike=float(strike),
            right=right,  # type: ignore[arg-type]
            bid=data.bid,
            ask=data.ask,
            last=data.last,
            mark=data.mark,
            volume=data.volume,
            open_interest=data.call_open_interest if right == 'C' else data.put_open_interest,
            iv=data.iv,
            delta=data.delta,
            gamma=data.gamma,
            theta=data.theta,
            vega=data.vega,
            rho=data.rho,
            bid_size=data.bid_size,
            ask_size=data.ask_size,
            contract_symbol=getattr(contract, 'symbol', None),
            local_symbol=getattr(contract, 'localSymbol', None) or None,
            con_id=getattr(contract, 'conId', None) or None,
            provider_contract_id=str(getattr(contract, 'conId', '')) if getattr(contract, 'conId', None) else None,
            raw=data.raw,
        )

    def _stock_contract(self, symbol: str):
        from ibapi.contract import Contract

        contract = Contract()
        contract.symbol = _ib_contract_symbol(symbol)
        contract.secType = 'STK'
        contract.exchange = 'SMART'
        contract.currency = 'USD'
        return contract

    def _option_contract(self, symbol: str, expiry: date, strike: float, right: str, trading_class: str):
        from ibapi.contract import Contract

        contract = Contract()
        contract.symbol = _ib_contract_symbol(symbol)
        contract.secType = 'OPT'
        contract.exchange = 'SMART'
        contract.currency = 'USD'
        contract.lastTradeDateOrContractMonth = expiry.strftime('%Y%m%d')
        contract.strike = float(strike)
        contract.right = right
        contract.multiplier = '100'
        contract.tradingClass = trading_class
        return contract

    def _select_expirations(self, available: list[date], requested: list[date] | None) -> list[date]:
        if requested:
            requested_set = set(requested)
            return [expiry for expiry in available if expiry in requested_set]
        today = date.today()
        if self.dte_buckets:
            selected = []
            seen = set()
            for dte_min, dte_max in self.dte_buckets:
                bucket_matches = [
                    expiry for expiry in available
                    if dte_min <= (expiry - today).days <= dte_max
                ][:self.max_expirations_per_bucket]
                for expiry in bucket_matches:
                    if expiry not in seen:
                        seen.add(expiry)
                        selected.append(expiry)
            if selected:
                return selected
        min_expiry = today + timedelta(days=self.min_dte)
        max_expiry = today + timedelta(days=self.max_dte)
        return [expiry for expiry in available if min_expiry <= expiry <= max_expiry]

    def _select_strikes(self, available: list[float], spot: float, window_pct: float, max_per_side: int) -> list[float]:
        low = spot * (1 - window_pct / 100)
        high = spot * (1 + window_pct / 100)
        in_window = [strike for strike in available if low <= strike <= high]
        below = [strike for strike in in_window if strike < spot][-max_per_side:]
        above = [strike for strike in in_window if strike >= spot][:max_per_side + 1]
        return below + above


class _MarketData:
    def __init__(self):
        self.bid = None
        self.ask = None
        self.last = None
        self.close = None
        self.mark = None
        self.volume = None
        self.bid_size = None
        self.ask_size = None
        self.call_open_interest = None
        self.put_open_interest = None
        self.call_volume = None
        self.put_volume = None
        self.iv = None
        self.delta = None
        self.gamma = None
        self.theta = None
        self.vega = None
        self.rho = None
        self.raw = {'prices': {}, 'sizes': {}, 'greeks': {}, 'errors': []}

    def apply_price(self, tick_type: int, price: float):
        if price is None or price < 0:
            return
        self.raw['prices'][str(tick_type)] = price
        if tick_type in (1, 66):
            self.bid = float(price)
        elif tick_type in (2, 67):
            self.ask = float(price)
        elif tick_type in (4, 68):
            self.last = float(price)
        elif tick_type in (9, 75):
            self.close = float(price)
        elif tick_type == 37:
            self.mark = float(price)

    def apply_size(self, tick_type: int, size: int):
        if size is None or size < 0:
            return
        self.raw['sizes'][str(tick_type)] = int(size)
        if tick_type in (0, 69):
            self.bid_size = int(size)
        elif tick_type in (3, 70):
            self.ask_size = int(size)
        elif tick_type in (8, 74):
            self.volume = int(size)
        elif tick_type == 27:
            self.call_open_interest = int(size)
        elif tick_type == 28:
            self.put_open_interest = int(size)
        elif tick_type == 29:
            self.call_volume = int(size)
        elif tick_type == 30:
            self.put_volume = int(size)

    def apply_greeks(self, tick_type: int, implied_vol: float, delta: float, gamma: float, theta: float, vega: float, opt_price: float | None, und_price: float | None):
        self.raw['greeks'][str(tick_type)] = {
            'iv': implied_vol,
            'delta': delta,
            'gamma': gamma,
            'theta': theta,
            'vega': vega,
            'opt_price': opt_price,
            'und_price': und_price,
        }
        if tick_type not in (13, 83):
            if self.iv is not None or tick_type not in (10, 11, 12, 80, 81, 82):
                return
        self.iv = _clean_float(implied_vol)
        self.delta = _clean_float(delta)
        self.gamma = _clean_float(gamma)
        self.theta = _clean_float(theta)
        self.vega = _clean_float(vega)

    def apply_error(self, code: int, message: str):
        self.raw['errors'].append({'code': code, 'message': message})

    def has_option_payload(self) -> bool:
        return any(
            value is not None
            for value in (
                self.bid,
                self.ask,
                self.last,
                self.mark,
                self.volume,
                self.call_open_interest,
                self.put_open_interest,
                self.iv,
                self.delta,
                self.gamma,
            )
        )


def _parse_expiration(value: str) -> date | None:
    try:
        return datetime.strptime(value, '%Y%m%d').date()
    except (TypeError, ValueError):
        return None


def _parse_dte_buckets(raw: str | None) -> list[tuple[int, int]]:
    buckets = []
    for part in (raw or '').split(','):
        text = part.strip()
        if not text or '-' not in text:
            continue
        left, right = text.split('-', 1)
        try:
            dte_min = int(left.strip())
            dte_max = int(right.strip())
        except ValueError:
            continue
        if dte_min <= dte_max:
            buckets.append((dte_min, dte_max))
    return buckets


def _ib_contract_symbol(symbol: str) -> str:
    return symbol.upper().replace('.', ' ')


def _mid(bid: float | None, ask: float | None) -> float | None:
    if bid is None or ask is None:
        return None
    return (bid + ask) / 2


def _clean_float(value: float) -> float | None:
    if value is None or value < -1e100:
        return None
    return float(value)
