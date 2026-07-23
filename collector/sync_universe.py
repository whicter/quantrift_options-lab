"""Seed and reconcile the persisted scanner universe from known symbols."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from common import load_watchlist

load_dotenv(Path(__file__).with_name('.env'))

DB_URL = os.getenv('DATABASE_URL')


def known_symbols(conn) -> list[str]:
    symbols = set(load_watchlist())
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT symbol FROM (
              SELECT symbol FROM iv_history
              UNION SELECT symbol FROM price_history
              UNION SELECT symbol FROM option_chain_snapshots
            ) known
            WHERE symbol ~ '^[A-Z][A-Z0-9.-]{0,9}$'
            """
        )
        symbols.update(row[0] for row in cur.fetchall())
    return sorted(symbols)


def upsert_symbols(conn, symbols: list[str], source: str = 'known_data') -> int:
    if not symbols:
        return 0
    values = [(symbol, source, 'seed') for symbol in symbols]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO symbol_universe (symbol, source, added_via)
            VALUES %s
            ON CONFLICT (symbol) DO UPDATE SET
              active = TRUE,
              updated_at = NOW()
            """,
            values,
        )
    conn.commit()
    return len(symbols)


def run() -> int:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    conn = psycopg2.connect(DB_URL)
    try:
        count = upsert_symbols(conn, known_symbols(conn))
        print(f'Synced {count} symbols into symbol_universe')
        return count
    finally:
        conn.close()


if __name__ == '__main__':
    run()
