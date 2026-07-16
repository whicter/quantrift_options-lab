from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

from providers.unusual_whales_stream_provider import UnusualWhalesStreamProvider


load_dotenv(Path(__file__).with_name('.env'))
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

OSI_PATTERN = re.compile(r'^(.+?)(\d{6})([CP])(\d{8})$')


def _number(value):
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _timestamp(value):
    if value in (None, ''):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric > 10_000_000_000:
        numeric /= 1000
    return datetime.fromtimestamp(numeric, tz=timezone.utc)


def _unwrap(message: dict) -> tuple[str, dict]:
    topic = str(message.get('topic') or message.get('type') or message.get('channel') or '').lower()
    payload = message.get('data') or message.get('payload') or message.get('message') or message
    return topic, payload if isinstance(payload, dict) else {}


def _parse_osi(option_chain: str) -> tuple[date | None, str | None, Decimal | None]:
    match = OSI_PATTERN.match(option_chain.strip().replace(' ', ''))
    if not match:
        return None, None, None
    expiry = datetime.strptime(match.group(2), '%y%m%d').date()
    return expiry, match.group(3), Decimal(match.group(4)) / Decimal(1000)


def normalize_message(message: dict) -> dict | None:
    topic, payload = _unwrap(message)
    is_flow = topic in {'flow-alerts', 'flow_alerts', 'flowalert'} or 'option_chain' in payload
    is_trade = topic in {'all-trade-report', 'all_trade_report', 'tradereport'} or 'market_center' in payload

    if is_flow:
        symbol = str(payload.get('ticker') or '').strip().upper()
        event_id = str(payload.get('id') or '').strip()
        option_chain = str(payload.get('option_chain') or '').strip()
        executed_at = _timestamp(payload.get('executed_at') or payload.get('end_time'))
        if not symbol or not event_id or not option_chain or executed_at is None:
            return None
        expiry, option_right, strike = _parse_osi(option_chain)
        return {
            'provider_event_id': event_id,
            'symbol': symbol,
            'event_type': 'option_flow',
            'executed_at': executed_at,
            'contract_symbol': option_chain,
            'expiry': expiry,
            'option_right': option_right,
            'strike': strike,
            'underlying_price': _number(payload.get('underlying_price')),
            'price': _number(payload.get('price')),
            'size': int(payload.get('total_size') or 0),
            'premium': _number(payload.get('total_premium')),
            'open_interest': int(payload.get('open_interest') or 0),
            'volume': int(payload.get('volume') or 0),
            'ask_side_premium': _number(payload.get('total_ask_side_prem')),
            'bid_side_premium': _number(payload.get('total_bid_side_prem')),
            'has_sweep': bool(payload.get('has_sweep')),
            'all_opening_trades': bool(payload.get('all_opening_trades')),
            'market_center': None,
            'raw_metadata': payload,
        }

    if is_trade and str(payload.get('market_center') or '').upper() in {'L', '2'}:
        symbol = str(payload.get('symbol') or '').strip().upper()
        executed_at = _timestamp(payload.get('trf_executed_at') or payload.get('executed_at'))
        event_id = str(payload.get('control_number') or payload.get('tracking_id') or '').strip()
        if not symbol or not event_id or executed_at is None:
            return None
        price = _number(payload.get('price'))
        size = int(payload.get('size') or 0)
        return {
            'provider_event_id': event_id,
            'symbol': symbol,
            'event_type': 'dark_pool',
            'executed_at': executed_at,
            'contract_symbol': None,
            'expiry': None,
            'option_right': None,
            'strike': None,
            'underlying_price': price,
            'price': price,
            'size': size,
            'premium': price * size if price is not None else None,
            'open_interest': None,
            'volume': int(payload.get('volume') or 0),
            'ask_side_premium': None,
            'bid_side_premium': None,
            'has_sweep': False,
            'all_opening_trades': False,
            'market_center': str(payload.get('market_center')),
            'raw_metadata': payload,
        }
    return None


def persist_event(conn, event: dict, source='unusual_whales') -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO external_flow_events (
              source,provider_event_id,symbol,event_type,executed_at,contract_symbol,expiry,
              option_right,strike,underlying_price,price,size,premium,open_interest,volume,
              ask_side_premium,bid_side_premium,has_sweep,all_opening_trades,market_center,raw_metadata
            ) VALUES (
              %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
            ) ON CONFLICT (source,provider_event_id,event_type) DO NOTHING
            RETURNING id
            """,
            (
                source, event['provider_event_id'], event['symbol'], event['event_type'], event['executed_at'],
                event['contract_symbol'], event['expiry'], event['option_right'], event['strike'],
                event['underlying_price'], event['price'], event['size'], event['premium'],
                event['open_interest'], event['volume'], event['ask_side_premium'], event['bid_side_premium'],
                event['has_sweep'], event['all_opening_trades'], event['market_center'],
                json.dumps(event['raw_metadata'], separators=(',', ':')),
            ),
        )
        inserted = cur.fetchone() is not None
    conn.commit()
    return inserted


def update_provider_state(conn, status: str, last_message_at=None, last_error=None, source='unusual_whales'):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO external_flow_provider_state (source,status,last_connected_at,last_message_at,last_error,updated_at)
            VALUES (%s,%s,CASE WHEN %s='connected' THEN NOW() END,%s,%s,NOW())
            ON CONFLICT (source) DO UPDATE SET
              status=EXCLUDED.status,
              last_connected_at=CASE WHEN EXCLUDED.status='connected' THEN NOW() ELSE external_flow_provider_state.last_connected_at END,
              last_message_at=COALESCE(EXCLUDED.last_message_at,external_flow_provider_state.last_message_at),
              last_error=EXCLUDED.last_error,
              updated_at=NOW()
            """,
            (source, status, status, last_message_at, last_error),
        )
    conn.commit()


def run(provider=None) -> dict:
    if os.getenv('UW_FLOW_ENABLED', 'false').strip().lower() != 'true':
        log.info('Unusual Whales flow disabled')
        return {'status': 'disabled', 'received': 0, 'inserted': 0}
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    provider = provider or UnusualWhalesStreamProvider()
    max_messages = max(int(os.getenv('UW_FLOW_MAX_MESSAGES', '0')), 0)
    reconnect_seconds = max(float(os.getenv('UW_RECONNECT_SECONDS', '5')), 1)
    received = inserted = 0
    conn = psycopg2.connect(database_url)
    try:
        while max_messages <= 0 or received < max_messages:
            try:
                update_provider_state(conn, 'connected')
                remaining = max_messages - received if max_messages else 0
                for message in provider.messages(remaining):
                    received += 1
                    event = normalize_message(message)
                    now = datetime.now(timezone.utc)
                    if event and persist_event(conn, event, provider.source):
                        inserted += 1
                    update_provider_state(conn, 'connected', last_message_at=now)
                if max_messages:
                    break
            except Exception as exc:
                conn.rollback()
                update_provider_state(conn, 'error', last_error=str(exc)[:1000])
                if max_messages:
                    raise
                log.error('Unusual Whales stream disconnected: %s', exc)
                time.sleep(reconnect_seconds)
        return {'status': 'written', 'received': received, 'inserted': inserted}
    finally:
        conn.close()


if __name__ == '__main__':
    result = run()
    if result['status'] == 'disabled' and os.getenv('UW_PM2_IDLE_WHEN_DISABLED', 'false').lower() == 'true':
        log.info('Unusual Whales PM2 worker idle until enabled and restarted')
        while True:
            time.sleep(3600)
