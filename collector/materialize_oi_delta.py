"""
Materialize contract-level open-interest deltas.

Reads consecutive option_contract_snapshots from PostgreSQL and writes
option_oi_delta_snapshots. This job does not call market-data providers.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json, execute_values

from common import load_watchlist

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
DEFAULT_SYMBOLS = 'AAPL,SPY,QQQ,PLTR'
OI_DELTA_MIN_ABS = int(os.getenv('OI_DELTA_MIN_ABS', '100'))
OI_DELTA_MIN_PCT = float(os.getenv('OI_DELTA_MIN_PCT', '0.25'))
OI_DELTA_MIN_VOLUME = int(os.getenv('OI_DELTA_MIN_VOLUME', '10'))
OI_DELTA_MAX_PREVIOUS_AGE_HOURS = int(os.getenv('OI_DELTA_MAX_PREVIOUS_AGE_HOURS', '96'))


def load_symbols() -> list[str]:
    raw_symbols = os.getenv('OI_DELTA_SYMBOLS') or os.getenv('OPTION_SYMBOLS') or os.getenv('SYMBOLS')
    if raw_symbols:
        seen = set()
        symbols = []
        for part in raw_symbols.split(','):
            symbol = part.strip().upper()
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
        return symbols
    symbols = load_watchlist()
    return symbols or [part.strip() for part in DEFAULT_SYMBOLS.split(',')]


def contract_key(row: dict[str, Any]) -> str:
    contract_symbol = row.get('contract_symbol')
    if contract_symbol and contract_symbol != row.get('symbol'):
        return str(contract_symbol)
    if row.get('provider_contract_id'):
        return str(row['provider_contract_id'])
    return f"{row['expiry']}|{row['strike']}|{row['option_right']}"


def fetch_latest_and_previous_snapshots(conn, symbol: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, symbol, snapshot_ts, source
            FROM option_chain_snapshots
            WHERE symbol = %s
              AND contract_count > 0
            ORDER BY snapshot_ts DESC
            LIMIT 2
            """,
            (symbol,),
        )
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    latest = rows[0] if rows else None
    previous = rows[1] if len(rows) > 1 else None
    return latest, previous


def fetch_contracts(conn, snapshot_id: int) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, contract_symbol, provider_contract_id, expiry, strike, option_right,
                   bid, ask, volume, open_interest
            FROM option_contract_snapshots
            WHERE snapshot_id = %s
            ORDER BY expiry ASC, strike ASC, option_right ASC
            """,
            (snapshot_id,),
        )
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_delta_rows(latest: dict[str, Any], previous: dict[str, Any] | None, contracts: list[dict[str, Any]], previous_contracts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    previous_by_key = {contract_key(row): row for row in previous_contracts}
    status = 'confirmed'
    age_hours = None
    if not previous:
        status = 'baseline'
    else:
        age_hours = (latest['snapshot_ts'] - previous['snapshot_ts']).total_seconds() / 3600
        if age_hours > OI_DELTA_MAX_PREVIOUS_AGE_HOURS:
            status = 'stale'

    rows = []
    for contract in contracts:
        key = contract_key(contract)
        prev = previous_by_key.get(key)
        open_interest = _to_int(contract.get('open_interest'))
        previous_oi = _to_int(prev.get('open_interest')) if prev else None
        volume = _to_int(contract.get('volume')) or 0
        oi_delta = None
        oi_delta_pct = None
        is_unusual = False
        unusual_score = None
        row_status = status

        if open_interest is None:
            row_status = 'missing_oi'
        elif status == 'confirmed':
            if previous_oi is None:
                row_status = 'baseline'
            else:
                oi_delta = open_interest - previous_oi
                base = max(abs(previous_oi), 1)
                oi_delta_pct = oi_delta / base
                volume_oi_ratio = _safe_ratio(volume, open_interest)
                is_unusual = (
                    abs(oi_delta) >= OI_DELTA_MIN_ABS
                    and abs(oi_delta_pct) >= OI_DELTA_MIN_PCT
                    and volume >= OI_DELTA_MIN_VOLUME
                )
                if is_unusual:
                    unusual_score = abs(oi_delta) * (1 + abs(oi_delta_pct)) * (1 + (volume_oi_ratio or 0))
        volume_oi_ratio = _safe_ratio(volume, open_interest)

        rows.append({
            'snapshot_id': latest['id'],
            'previous_snapshot_id': previous['id'] if previous else None,
            'symbol': latest['symbol'],
            'snapshot_ts': latest['snapshot_ts'],
            'previous_snapshot_ts': previous['snapshot_ts'] if previous else None,
            'source': latest['source'],
            'contract_key': key,
            'contract_symbol': contract.get('contract_symbol'),
            'provider_contract_id': contract.get('provider_contract_id'),
            'expiry': contract['expiry'],
            'strike': contract['strike'],
            'option_right': contract['option_right'],
            'bid': contract.get('bid'),
            'ask': contract.get('ask'),
            'volume': volume,
            'open_interest': open_interest,
            'previous_open_interest': previous_oi,
            'oi_delta': oi_delta,
            'oi_delta_pct': oi_delta_pct,
            'volume_oi_ratio': volume_oi_ratio,
            'status': row_status,
            'is_unusual': is_unusual,
            'unusual_score': unusual_score,
            'raw_metrics': {
                'previous_age_hours': age_hours,
                'min_abs': OI_DELTA_MIN_ABS,
                'min_pct': OI_DELTA_MIN_PCT,
                'min_volume': OI_DELTA_MIN_VOLUME,
            },
        })
    return rows


def persist_rows(conn, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0

    cols = [
        'snapshot_id', 'previous_snapshot_id', 'symbol', 'snapshot_ts',
        'previous_snapshot_ts', 'source', 'contract_key', 'contract_symbol',
        'provider_contract_id', 'expiry', 'strike', 'option_right', 'bid', 'ask',
        'volume', 'open_interest', 'previous_open_interest', 'oi_delta',
        'oi_delta_pct', 'volume_oi_ratio', 'status', 'is_unusual',
        'unusual_score', 'raw_metrics',
    ]
    values = [
        tuple(Json(row[col]) if col == 'raw_metrics' else row.get(col) for col in cols)
        for row in rows
    ]
    update_cols = [col for col in cols if col not in ('snapshot_id', 'contract_key')]
    update_set = ', '.join(f'{col} = EXCLUDED.{col}' for col in update_cols)

    with conn.cursor() as cur:
        execute_values(
            cur,
            f"""
            INSERT INTO option_oi_delta_snapshots ({', '.join(cols)})
            VALUES %s
            ON CONFLICT (snapshot_id, contract_key) DO UPDATE SET {update_set}
            """,
            values,
        )
    conn.commit()
    return len(rows)


def run() -> None:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    symbols = load_symbols()
    conn = psycopg2.connect(DB_URL)
    try:
        total = 0
        for symbol in symbols:
            latest, previous = fetch_latest_and_previous_snapshots(conn, symbol)
            if not latest:
                log.info('%s: no option snapshot; skipped', symbol)
                continue
            contracts = fetch_contracts(conn, latest['id'])
            previous_contracts = fetch_contracts(conn, previous['id']) if previous else []
            rows = build_delta_rows(latest, previous, contracts, previous_contracts)
            written = persist_rows(conn, rows)
            total += written
            unusual = sum(1 for row in rows if row['is_unusual'])
            state = rows[0]['status'] if rows else 'empty'
            log.info('%s: wrote %s OI delta rows; unusual=%s; status=%s', symbol, written, unusual, state)
        log.info('Materialized %s OI delta rows', total)
    finally:
        conn.close()


def _safe_ratio(numerator: int | None, denominator: int | None) -> float | None:
    if numerator is None or not denominator:
        return None
    return numerator / denominator


def _to_int(value: Any) -> int | None:
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


if __name__ == '__main__':
    run()
