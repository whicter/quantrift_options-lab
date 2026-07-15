from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import websocket


DEFAULT_EVENT_TYPES = [
    'Quote',
    'Trade',
    'Summary',
    'Greeks',
    'Profile',
    'TheoPrice',
    'Underlying',
]


@dataclass(frozen=True)
class DxlinkQuoteToken:
    token: str
    dxlink_url: str
    level: str | None = None
    expires_at: str | None = None


def collect_dxlink_events(
    quote_token: DxlinkQuoteToken,
    symbols: list[str],
    event_types: list[str] | None = None,
    timeout_seconds: float = 8,
) -> dict[str, Any]:
    """Collect raw DXLink events for symbols.

    The return value intentionally keeps raw payloads because tastytrade/dxFeed
    payload availability can vary by account level and symbol. Callers can map
    stable fields after inspecting `events_by_symbol`.
    """

    clean_symbols = [symbol for symbol in symbols if symbol]
    if not clean_symbols:
        return {'events': [], 'events_by_symbol': {}, 'messages': [], 'errors': ['no_symbols']}

    ws = websocket.create_connection(quote_token.dxlink_url, timeout=timeout_seconds)
    events: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    errors: list[str] = []
    event_set = event_types or DEFAULT_EVENT_TYPES

    try:
        _send(ws, {'type': 'SETUP', 'channel': 0, 'version': '0.1-DXF-JS/0.3.0', 'keepaliveTimeout': 60, 'acceptKeepaliveTimeout': 60})
        messages.extend(_drain_until(ws, timeout_seconds, lambda msg: msg.get('type') == 'SETUP'))
        _send(ws, {'type': 'AUTH', 'channel': 0, 'token': quote_token.token})
        messages.extend(_drain_until(ws, timeout_seconds, lambda msg: msg.get('type') == 'AUTH_STATE' and msg.get('state') == 'AUTHORIZED'))
        _send(ws, {'type': 'CHANNEL_REQUEST', 'channel': 1, 'service': 'FEED', 'parameters': {'contract': 'AUTO'}})
        messages.extend(_drain_until(ws, timeout_seconds, lambda msg: msg.get('type') in ('CHANNEL_OPENED', 'CHANNEL_ACK') and msg.get('channel') == 1))
        _send(ws, {'type': 'FEED_SETUP', 'channel': 1, 'acceptAggregationPeriod': 1, 'acceptDataFormat': 'COMPACT', 'acceptEventFields': _event_fields(event_set)})
        _send(ws, {'type': 'FEED_SUBSCRIPTION', 'channel': 1, 'add': [{'type': event_type, 'symbol': symbol} for symbol in clean_symbols for event_type in event_set]})

        deadline = time.monotonic() + timeout_seconds
        runtime_fields = _event_fields(event_set)
        while time.monotonic() < deadline:
            try:
                raw = ws.recv()
            except websocket.WebSocketTimeoutException:
                break
            if not raw:
                continue
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                errors.append(f'non_json_message:{raw[:120]}')
                continue
            messages.append(message)
            if isinstance(message.get('eventFields'), dict):
                runtime_fields.update(message['eventFields'])
            events.extend(_extract_events(message, runtime_fields))
    finally:
        try:
            ws.close()
        except Exception:
            pass

    return {
        'events': events,
        'events_by_symbol': _group_events(events),
        'messages': messages,
        'errors': errors,
        'requested_symbols': clean_symbols,
        'requested_event_types': event_set,
        'level': quote_token.level,
        'expires_at': quote_token.expires_at,
    }


def _send(ws, payload: dict[str, Any]) -> None:
    ws.send(json.dumps(payload))


def _drain_until(ws, timeout_seconds: float, predicate) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_seconds
    messages = []
    while time.monotonic() < deadline:
        try:
            raw = ws.recv()
        except websocket.WebSocketTimeoutException:
            break
        if not raw:
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            continue
        messages.append(message)
        if predicate(message):
            break
    return messages


def _event_fields(event_types: list[str]) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for event_type in event_types:
        fields[event_type] = ['eventType', 'eventSymbol']
        if event_type == 'Quote':
            fields[event_type] += ['bidPrice', 'askPrice', 'bidSize', 'askSize', 'timeMillis', 'sequence']
        elif event_type == 'Trade':
            fields[event_type] += ['price', 'size', 'dayVolume', 'timeMillis', 'sequence']
        elif event_type == 'Summary':
            fields[event_type] += ['openInterest', 'dayOpenPrice', 'dayHighPrice', 'dayLowPrice', 'prevDayClosePrice']
        elif event_type == 'Greeks':
            fields[event_type] += ['price', 'volatility', 'delta', 'gamma', 'theta', 'rho', 'vega']
        elif event_type == 'TheoPrice':
            fields[event_type] += ['price', 'underlyingPrice', 'delta', 'gamma', 'dividend', 'interest']
        elif event_type == 'Underlying':
            fields[event_type] += ['volatility', 'frontVolatility', 'backVolatility', 'callVolume', 'putVolume', 'putCallRatio']
        elif event_type == 'Profile':
            fields[event_type] += ['description', 'statusReason', 'tradingStatus']
    return fields


def _extract_events(message: dict[str, Any], event_fields: dict[str, list[str]]) -> list[dict[str, Any]]:
    data = message.get('data')
    if not isinstance(data, list):
        return []
    if len(data) == 2 and isinstance(data[0], str) and isinstance(data[1], list):
        return _events_from_compact(data[0], data[1], event_fields)
    events = []
    for item in data:
        if isinstance(item, dict):
            events.append(item)
        elif isinstance(item, list) and len(item) >= 2:
            event_type = item[0]
            payload = item[1]
            if isinstance(payload, dict):
                events.append({'eventType': event_type, **payload})
            elif isinstance(payload, list):
                events.extend(_events_from_compact(event_type, payload, event_fields))
    return events


def _events_from_compact(event_type: str, payload: list[Any], event_fields: dict[str, list[str]]) -> list[dict[str, Any]]:
    events = []
    fields = event_fields.get(event_type) or ['eventType', 'eventSymbol']
    step = len(fields)
    if step <= 0:
        return events
    for offset in range(0, len(payload), step):
        values = payload[offset:offset + step]
        if len(values) != step:
            continue
        event = {}
        for key, value in zip(fields, values):
            event[key] = value
        event.setdefault('eventType', event_type)
        events.append(event)
    return events


def _group_events(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        symbol = event.get('eventSymbol') or event.get('symbol')
        if symbol:
            grouped.setdefault(str(symbol), []).append(event)
    return grouped
