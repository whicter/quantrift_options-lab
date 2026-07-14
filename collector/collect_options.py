"""
Option-chain snapshot collector.

Phase 3D-2 internal path:
  IB Gateway -> provider contract -> PostgreSQL snapshots

This collector is intentionally bounded and internal. It does not serve public
requests directly, and rows are labeled source=ib_internal.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json, execute_values

from providers.ib_option_chain_provider import IbOptionChainProvider

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
OPTION_PROVIDER = os.getenv('OPTION_PROVIDER', 'ib_internal').strip().lower()
DEFAULT_OPTION_SYMBOLS = 'AAPL,SPY,QQQ,PLTR'


def load_symbols() -> list[str]:
    raw_symbols = os.getenv('OPTION_SYMBOLS') or os.getenv('SYMBOLS') or DEFAULT_OPTION_SYMBOLS
    symbols = []
    seen = set()
    for part in raw_symbols.split(','):
        symbol = part.strip().upper()
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def make_provider():
    if OPTION_PROVIDER == 'ib_internal':
        return IbOptionChainProvider()
    raise ValueError(f'Unknown OPTION_PROVIDER={OPTION_PROVIDER}')


def create_job(conn, symbol: str, provider: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO provider_fetch_jobs (symbol, job_type, provider, status, attempts, started_at)
            VALUES (%s, 'option_chain_snapshot', %s, 'running', 1, NOW())
            RETURNING id
            """,
            (symbol, provider),
        )
        job_id = cur.fetchone()[0]
    conn.commit()
    return job_id


def finish_job(conn, job_id: int, status: str, summary: dict | None = None, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE provider_fetch_jobs
            SET status = %s,
                result_summary = %s,
                last_error = %s,
                finished_at = NOW()
            WHERE id = %s
            """,
            (status, Json(summary or {}), error, job_id),
        )
    conn.commit()


def persist_snapshot(conn, snapshot) -> int:
    contract_count = len(snapshot.contracts)
    missing_greeks = sum(1 for contract in snapshot.contracts if contract.gamma is None or contract.delta is None)
    missing_oi = sum(1 for contract in snapshot.contracts if contract.open_interest is None)
    completeness_pct = 100.0 if contract_count == 0 else round(100 * (1 - (missing_greeks + missing_oi) / (2 * contract_count)), 2)
    missing_greeks_ratio = None if contract_count == 0 else round(missing_greeks / contract_count, 4)
    missing_oi_ratio = None if contract_count == 0 else round(missing_oi / contract_count, 4)
    provider_status = snapshot.provider_status
    if contract_count == 0:
        provider_status = 'empty'
    elif completeness_pct < 50:
        provider_status = 'partial'

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO option_chain_snapshots (
              symbol, underlying_price, underlying_bid, underlying_ask, snapshot_ts,
              source, provider_status, provider_snapshot_id, contract_count,
              completeness_pct, missing_greeks_ratio, missing_oi_ratio, raw_metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                snapshot.symbol,
                snapshot.underlying.price,
                snapshot.underlying.bid,
                snapshot.underlying.ask,
                snapshot.snapshot_ts,
                snapshot.source,
                provider_status,
                snapshot.provider_snapshot_id,
                contract_count,
                completeness_pct,
                missing_greeks_ratio,
                missing_oi_ratio,
                Json(snapshot.raw_metadata or {}),
            ),
        )
        snapshot_id = cur.fetchone()[0]

    if snapshot.contracts:
        cols = [
            'snapshot_id', 'symbol', 'expiry', 'strike', 'option_right',
            'bid', 'ask', 'last', 'mark', 'volume', 'open_interest',
            'iv', 'delta', 'gamma', 'theta', 'vega', 'rho',
            'bid_size', 'ask_size', 'contract_symbol', 'local_symbol',
            'con_id', 'provider_contract_id', 'raw_contract',
        ]
        values = [
            (
                snapshot_id,
                contract.symbol,
                contract.expiry,
                contract.strike,
                contract.right,
                contract.bid,
                contract.ask,
                contract.last,
                contract.mark,
                contract.volume,
                contract.open_interest,
                contract.iv,
                contract.delta,
                contract.gamma,
                contract.theta,
                contract.vega,
                contract.rho,
                contract.bid_size,
                contract.ask_size,
                contract.contract_symbol,
                contract.local_symbol,
                contract.con_id,
                contract.provider_contract_id,
                Json(contract.raw or {}),
            )
            for contract in snapshot.contracts
        ]
        with conn.cursor() as cur:
            execute_values(
                cur,
                f"INSERT INTO option_contract_snapshots ({', '.join(cols)}) VALUES %s",
                values,
            )

    conn.commit()
    return snapshot_id


def run():
    log.info('=== Option Chain Collector starting ===')
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')

    symbols = load_symbols()
    provider = make_provider()
    conn = psycopg2.connect(DB_URL)
    log.info(f'Loaded {len(symbols)} symbols; provider={provider.source}; symbols={symbols}')

    written = 0
    failed = []

    for symbol in symbols:
        job_id = create_job(conn, symbol, provider.source)
        try:
            snapshot = provider.fetch_option_chain(symbol)
            snapshot_id = persist_snapshot(conn, snapshot)
            summary = {
                'snapshot_id': snapshot_id,
                'contract_count': len(snapshot.contracts),
                'provider_status': snapshot.provider_status,
                'snapshot_ts': snapshot.snapshot_ts.isoformat(),
            }
            finish_job(conn, job_id, 'succeeded', summary=summary)
            written += 1
            log.info(f'{symbol}: snapshot_id={snapshot_id}; contracts={len(snapshot.contracts)}')
        except Exception as exc:
            conn.rollback()
            finish_job(conn, job_id, 'failed', error=str(exc))
            failed.append(symbol)
            log.error(f'{symbol}: option chain fetch failed: {exc}')

    conn.close()
    log.info(f'=== Done: {written} snapshots written, {len(failed)} failed ===')
    if failed:
        log.warning(f'Failed symbols: {failed}')


if __name__ == '__main__':
    run()
