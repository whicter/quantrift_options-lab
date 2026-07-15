from __future__ import annotations

import os
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

from .base import OptionChainSnapshot, OptionContractSnapshot, UnderlyingSnapshot
from .tastytrade_dxlink import DxlinkQuoteToken, collect_dxlink_events


class TastytradeOptionChainProvider:
    """Internal tastytrade adapter for option-chain metadata.

    tastytrade is used here as a transitional internal provider. This adapter
    fetches chain metadata from the REST API and preserves streamer symbols for
    a follow-up DXLink quote/Greeks/OI merge. It is not a licensed product data
    source for public redistribution.
    """

    source = 'tt_internal'

    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        self.base_url = (base_url or os.getenv('TT_BASE_URL') or 'https://api.tastyworks.com').rstrip('/')
        self.timeout = float(timeout or os.getenv('TT_TIMEOUT', '20'))
        self.session_token = os.getenv('TT_SESSION_TOKEN') or ''
        self.login = os.getenv('TT_LOGIN') or ''
        self.password = os.getenv('TT_PASSWORD') or ''
        self.remember_token = os.getenv('TT_REMEMBER_TOKEN') or ''
        self.min_dte = int(os.getenv('OPTION_MIN_DTE', '0'))
        self.max_dte = int(os.getenv('OPTION_MAX_DTE', '90'))
        self.dte_buckets = _parse_dte_buckets(os.getenv('OPTION_DTE_BUCKETS', '0-14,30-60,60-90'))
        self.max_expirations_per_bucket = int(os.getenv('OPTION_MAX_EXPIRATIONS_PER_BUCKET', '1'))
        self.strike_window_pct = float(os.getenv('OPTION_STRIKE_WINDOW_PCT', '15'))
        self.max_strikes_per_side = int(os.getenv('OPTION_MAX_STRIKES_PER_SIDE', '20'))
        self.max_contracts = int(os.getenv('OPTION_MAX_CONTRACTS', '240'))
        self.max_contracts_per_expiration = int(os.getenv('OPTION_MAX_CONTRACTS_PER_EXPIRATION', '80'))
        self.dxlink_timeout = float(os.getenv('TT_DXLINK_TIMEOUT', '8'))
        self.collect_dxlink = os.getenv('TT_COLLECT_DXLINK', 'true').strip().lower() not in ('0', 'false', 'no')
        self._http = requests.Session()

    def fetch_underlying(self, symbol: str) -> UnderlyingSnapshot:
        symbol = symbol.upper()
        return UnderlyingSnapshot(
            symbol=symbol,
            price=self._spot_override(symbol),
            bid=None,
            ask=None,
            timestamp=datetime.now(timezone.utc),
            source=self.source,
            raw={'price_source': 'TT_SPOT_<SYMBOL> override' if self._spot_override(symbol) is not None else 'unavailable'},
        )

    def fetch_option_chain(
        self,
        symbol: str,
        expirations: list[date] | None = None,
        strike_window_pct: float | None = None,
        max_strikes_per_side: int | None = None,
    ) -> OptionChainSnapshot:
        symbol = symbol.upper()
        snapshot_ts = datetime.now(timezone.utc)
        chain = self._get(f'/option-chains/{symbol}/nested')
        items = ((chain.get('data') or {}).get('items') or [])
        if not items:
            return OptionChainSnapshot(
                symbol=symbol,
                underlying=self.fetch_underlying(symbol),
                contracts=[],
                snapshot_ts=snapshot_ts,
                source=self.source,
                provider_status='empty',
                raw_metadata={'provider_response': chain},
            )

        underlying = self.fetch_underlying(symbol)
        rows = self._flatten_chain(items)
        selected_expirations = self._select_expirations(sorted({row['expiry'] for row in rows}), expirations)
        rows = [row for row in rows if row['expiry'] in selected_expirations]

        selected_strikes = self._select_strikes(
            sorted({row['strike'] for row in rows}),
            underlying.price,
            strike_window_pct if strike_window_pct is not None else self.strike_window_pct,
            max_strikes_per_side if max_strikes_per_side is not None else self.max_strikes_per_side,
        )
        selected_strike_set = set(selected_strikes)
        rows = [row for row in rows if row['strike'] in selected_strike_set]

        contracts = self._build_metadata_contracts(symbol, rows)

        dxlink_summary: dict[str, Any] = {'enabled': self.collect_dxlink, 'event_count': 0}
        if contracts and self.collect_dxlink:
            try:
                quote_token = self.fetch_quote_token()
                streamer_symbols = [symbol]
                streamer_symbols.extend(
                    str((contract.raw or {}).get('streamer_symbol') or contract.provider_contract_id)
                    for contract in contracts
                )
                dxlink_payload = collect_dxlink_events(
                    quote_token,
                    streamer_symbols,
                    timeout_seconds=self.dxlink_timeout,
                )
                contracts = self._merge_dxlink_events(contracts, dxlink_payload)
                underlying = self._merge_underlying_dxlink(symbol, underlying, contracts, dxlink_payload)
                dxlink_summary = {
                    'enabled': True,
                    'level': dxlink_payload.get('level'),
                    'expires_at': dxlink_payload.get('expires_at'),
                    'event_count': len(dxlink_payload.get('events') or []),
                    'errors': dxlink_payload.get('errors') or [],
                    'requested_event_types': dxlink_payload.get('requested_event_types') or [],
                }
            except Exception as exc:
                dxlink_summary = {'enabled': True, 'event_count': 0, 'error': str(exc)}

        status = 'ok' if _has_quote_greeks_and_oi(contracts) else ('metadata_only' if contracts else 'empty')
        return OptionChainSnapshot(
            symbol=symbol,
            underlying=underlying,
            contracts=contracts,
            snapshot_ts=snapshot_ts,
            source=self.source,
            provider_status=status,
            raw_metadata={
                'available_expiration_count': len({row['expiry'] for row in self._flatten_chain(items)}),
                'available_strike_count': len({row['strike'] for row in self._flatten_chain(items)}),
                'selected_expirations': [expiry.isoformat() for expiry in selected_expirations],
                'selected_strike_count': len(selected_strikes),
                'dte_buckets': [list(bucket) for bucket in self.dte_buckets],
                'max_expirations_per_bucket': self.max_expirations_per_bucket,
                'requested_contract_count': len(rows) * 2,
                'returned_contract_count': len(contracts),
                'max_contracts': self.max_contracts,
                'max_contracts_per_expiration': self.max_contracts_per_expiration,
                'quote_path': 'dxlink',
                'provider_capability': 'chain_metadata_plus_dxlink',
                'dxlink': dxlink_summary,
            },
        )

    def _merge_underlying_dxlink(self, symbol: str, underlying: UnderlyingSnapshot, contracts: list[OptionContractSnapshot], dxlink_payload: dict[str, Any]) -> UnderlyingSnapshot:
        events_by_symbol = dxlink_payload.get('events_by_symbol') or {}
        events = events_by_symbol.get(symbol) or []
        events_by_type = _latest_events_by_type(events)
        quote = events_by_type.get('Quote') or {}
        trade = events_by_type.get('Trade') or {}
        bid = _to_float(quote.get('bidPrice'))
        ask = _to_float(quote.get('askPrice'))
        price = _to_float(trade.get('price')) or _mid(bid, ask) or _underlying_price_from_contracts(contracts) or underlying.price
        raw = dict(underlying.raw or {})
        raw['dxlink_events'] = events_by_type
        raw['price_source'] = 'dxlink_underlying_trade_or_quote' if events else raw.get('price_source', 'unavailable')
        if not events and price is not None:
            raw['price_source'] = 'dxlink_theo_underlying_price'
        return UnderlyingSnapshot(
            symbol=symbol,
            price=price,
            bid=bid,
            ask=ask,
            timestamp=datetime.now(timezone.utc),
            source=self.source,
            raw=raw,
        )

    def _merge_dxlink_events(self, contracts: list[OptionContractSnapshot], dxlink_payload: dict[str, Any]) -> list[OptionContractSnapshot]:
        events_by_symbol = dxlink_payload.get('events_by_symbol') or {}
        merged = []
        for contract in contracts:
            raw = dict(contract.raw or {})
            streamer_symbol = raw.get('streamer_symbol') or contract.provider_contract_id
            events = events_by_symbol.get(streamer_symbol) or []
            events_by_type = _latest_events_by_type(events)
            quote = events_by_type.get('Quote') or {}
            trade = events_by_type.get('Trade') or {}
            summary = events_by_type.get('Summary') or {}
            greeks = events_by_type.get('Greeks') or {}
            theo = events_by_type.get('TheoPrice') or {}
            raw['quote_status'] = 'dxlink_collected' if events else 'dxlink_no_events'
            raw['dxlink_events'] = events_by_type
            merged.append(OptionContractSnapshot(
                symbol=contract.symbol,
                expiry=contract.expiry,
                strike=contract.strike,
                right=contract.right,
                bid=_to_float(quote.get('bidPrice')),
                ask=_to_float(quote.get('askPrice')),
                last=_to_float(trade.get('price')),
                mark=_to_float(theo.get('price')) or _to_float(greeks.get('price')),
                volume=_to_int(trade.get('dayVolume')),
                open_interest=_to_int(summary.get('openInterest')),
                iv=_to_float(greeks.get('volatility')),
                delta=_to_float(greeks.get('delta')) or _to_float(theo.get('delta')),
                gamma=_to_float(greeks.get('gamma')) or _to_float(theo.get('gamma')),
                theta=_to_float(greeks.get('theta')),
                vega=_to_float(greeks.get('vega')),
                rho=_to_float(greeks.get('rho')),
                bid_size=_to_int(quote.get('bidSize')),
                ask_size=_to_int(quote.get('askSize')),
                contract_symbol=contract.contract_symbol,
                local_symbol=contract.local_symbol,
                con_id=contract.con_id,
                provider_contract_id=contract.provider_contract_id,
                raw=raw,
            ))
        return merged

    def fetch_quote_token(self) -> DxlinkQuoteToken:
        payload = self._get('/api-quote-tokens')
        data = payload.get('data') or {}
        token = data.get('token')
        dxlink_url = data.get('dxlink-url')
        if not token or not dxlink_url:
            raise RuntimeError('tastytrade quote token response missing token or dxlink-url')
        return DxlinkQuoteToken(
            token=token,
            dxlink_url=dxlink_url,
            level=data.get('level'),
            expires_at=data.get('expires-at'),
        )

    def _metadata_contract(self, symbol: str, row: dict[str, Any], right: str, contract_symbol: str, streamer_symbol: str | None):
        return OptionContractSnapshot(
            symbol=symbol,
            expiry=row['expiry'],
            strike=row['strike'],
            right=right,  # type: ignore[arg-type]
            bid=None,
            ask=None,
            last=None,
            mark=None,
            volume=None,
            open_interest=None,
            iv=None,
            delta=None,
            gamma=None,
            theta=None,
            vega=None,
            rho=None,
            contract_symbol=contract_symbol,
            local_symbol=contract_symbol,
            provider_contract_id=streamer_symbol or contract_symbol,
            raw={
                'provider': self.source,
                'contract_symbol': contract_symbol,
                'streamer_symbol': streamer_symbol,
                'expiration_type': row.get('expiration_type'),
                'settlement_type': row.get('settlement_type'),
                'days_to_expiration': row.get('days_to_expiration'),
                'quote_status': 'dxlink_not_collected',
            },
        )

    def _build_metadata_contracts(self, symbol: str, rows: list[dict[str, Any]]) -> list[OptionContractSnapshot]:
        contracts: list[OptionContractSnapshot] = []
        contracts_by_expiry: dict[date, int] = {}
        for row in rows:
            for right, symbol_key, streamer_key in (
                ('C', 'call_symbol', 'call_streamer_symbol'),
                ('P', 'put_symbol', 'put_streamer_symbol'),
            ):
                if len(contracts) >= self.max_contracts:
                    break
                expiry_count = contracts_by_expiry.get(row['expiry'], 0)
                if expiry_count >= self.max_contracts_per_expiration:
                    break
                contract_symbol = row.get(symbol_key)
                if not contract_symbol:
                    continue
                contracts.append(self._metadata_contract(symbol, row, right, contract_symbol, row.get(streamer_key)))
                contracts_by_expiry[row['expiry']] = expiry_count + 1
            if len(contracts) >= self.max_contracts:
                break
        return contracts

    def _flatten_chain(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = []
        for item in items:
            for expiration in item.get('expirations') or []:
                expiry = _parse_date(expiration.get('expiration-date'))
                if not expiry:
                    continue
                for strike in expiration.get('strikes') or []:
                    strike_price = _to_float(strike.get('strike-price'))
                    if strike_price is None:
                        continue
                    rows.append({
                        'expiry': expiry,
                        'strike': strike_price,
                        'call_symbol': strike.get('call'),
                        'call_streamer_symbol': strike.get('call-streamer-symbol'),
                        'put_symbol': strike.get('put'),
                        'put_streamer_symbol': strike.get('put-streamer-symbol'),
                        'expiration_type': expiration.get('expiration-type'),
                        'settlement_type': expiration.get('settlement-type'),
                        'days_to_expiration': expiration.get('days-to-expiration'),
                    })
        return rows

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

    def _select_strikes(self, available: list[float], spot: float | None, window_pct: float, max_per_side: int) -> list[float]:
        if not available:
            return []
        if spot is None:
            center_index = len(available) // 2
            lower = max(0, center_index - max_per_side)
            upper = min(len(available), center_index + max_per_side + 1)
            return available[lower:upper]
        low = spot * (1 - window_pct / 100)
        high = spot * (1 + window_pct / 100)
        in_window = [strike for strike in available if low <= strike <= high]
        below = [strike for strike in in_window if strike < spot][-max_per_side:]
        above = [strike for strike in in_window if strike >= spot][:max_per_side + 1]
        return below + above

    def _get(self, path: str) -> dict[str, Any]:
        response = self._http.get(
            f'{self.base_url}{path}',
            headers=self._headers(),
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def _headers(self) -> dict[str, str]:
        token = self.session_token or self._login()
        return {'Accept': 'application/json', 'Authorization': token}

    def _login(self) -> str:
        if self.remember_token:
            try:
                from auth import get_session_token

                self.session_token = get_session_token()
                return self.session_token
            except SystemExit:
                raise
            except Exception:
                pass
        if not self.login or not self.password:
            raise RuntimeError('TT_SESSION_TOKEN or TT_LOGIN/TT_PASSWORD is required for tt_internal')
        payload: dict[str, Any] = {'login': self.login, 'password': self.password, 'remember-me': True}
        response = self._http.post(
            f'{self.base_url}/sessions',
            json=payload,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json().get('data') or {}
        token = data.get('session-token')
        if not token:
            raise RuntimeError('tastytrade login succeeded without session-token')
        self.session_token = token
        return token

    def _spot_override(self, symbol: str) -> float | None:
        return _to_float(os.getenv(f'TT_SPOT_{symbol.upper()}'))


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
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


def _to_float(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _to_int(value: Any) -> int | None:
    parsed = _to_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _mid(bid: float | None, ask: float | None) -> float | None:
    if bid is None or ask is None:
        return None
    return (bid + ask) / 2


def _latest_events_by_type(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_type = {}
    for event in events:
        event_type = event.get('eventType')
        if event_type:
            by_type[str(event_type)] = event
    return by_type


def _underlying_price_from_contracts(contracts: list[OptionContractSnapshot]) -> float | None:
    for contract in contracts:
        events = (contract.raw or {}).get('dxlink_events') or {}
        theo = events.get('TheoPrice') or {}
        price = _to_float(theo.get('underlyingPrice'))
        if price is not None:
            return price
    return None


def _has_quote_greeks_and_oi(contracts: list[OptionContractSnapshot]) -> bool:
    if not contracts:
        return False
    return any(contract.bid is not None or contract.ask is not None for contract in contracts) and any(
        contract.gamma is not None and contract.open_interest is not None
        for contract in contracts
    )
