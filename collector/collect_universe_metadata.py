from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

from providers.polygon_reference_provider import PolygonReferenceProvider, TickerReference


load_dotenv(Path(__file__).with_name('.env'))
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)


def sector_from_sic(value: str | None) -> str | None:
    try:
        code = int(value or '')
    except ValueError:
        return None
    if 1300 <= code <= 1399 or 2900 <= code <= 2999:
        return 'Energy'
    if 1000 <= code <= 1499:
        return 'Basic Materials'
    if 1500 <= code <= 1799:
        return 'Industrials'
    if 2000 <= code <= 2399:
        return 'Consumer Defensive'
    if 2400 <= code <= 2799:
        return 'Basic Materials'
    if 2830 <= code <= 2839 or 3840 <= code <= 3859 or 8000 <= code <= 8099:
        return 'Healthcare'
    if 2800 <= code <= 2899 or 3200 <= code <= 3399:
        return 'Basic Materials'
    if 3570 <= code <= 3699 or 7370 <= code <= 7379:
        return 'Technology'
    if 3400 <= code <= 3569 or 3700 <= code <= 3799 or 4000 <= code <= 4799:
        return 'Industrials'
    if 3800 <= code <= 3839 or 3860 <= code <= 3899:
        return 'Technology'
    if 4800 <= code <= 4899:
        return 'Communication Services'
    if 4900 <= code <= 4999:
        return 'Utilities'
    if 6000 <= code <= 6799:
        return 'Financial Services'
    if 5000 <= code <= 5999 or 7000 <= code <= 7999:
        return 'Consumer Cyclical'
    return None


def asset_type(reference: TickerReference) -> str | None:
    ticker_type = (reference.ticker_type or '').upper()
    if ticker_type in {'ETF', 'ETV', 'ETN'}:
        return 'etf'
    if ticker_type in {'CS', 'ADRC', 'PFD', 'UNIT', 'WARRANT', 'RIGHT'}:
        return 'stock'
    return ticker_type.lower() or reference.market


def load_symbols(conn) -> list[str]:
    configured = [item.strip().upper() for item in os.getenv('REFERENCE_SYMBOLS', '').split(',') if item.strip()]
    if configured:
        return sorted(set(configured))
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM symbol_universe WHERE active=TRUE AND scan_enabled=TRUE ORDER BY symbol")
        return [row[0] for row in cur.fetchall()]


def confirmed_optionable(conn, symbol: str) -> bool | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
              SELECT 1 FROM option_chain_snapshots
              WHERE symbol=%s AND contract_count > 0 AND provider_status NOT IN ('empty','metadata_only')
            ) AS optionable
            """,
            (symbol,),
        )
        return True if cur.fetchone()[0] else None


def persist_reference(conn, reference: TickerReference, optionable: bool | None) -> None:
    sector = sector_from_sic(reference.sic_code)
    metadata = {
        'reference_source': 'polygon_reference',
        'reference_updated_at': datetime.now(timezone.utc).isoformat(),
        'ticker_type': reference.ticker_type,
        'market': reference.market,
        'sic_code': reference.sic_code,
        'sic_description': reference.sic_description,
        'sector_method': 'sec_sic_derived_v1' if sector else None,
        'primary_exchange': reference.primary_exchange,
        'provider_last_updated_utc': reference.last_updated_utc,
        'provider_active': reference.active,
        'optionable_method': 'persisted_usable_option_snapshot' if optionable else None,
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE symbol_universe SET
              name=CASE WHEN name IS NULL OR metadata->>'reference_source'='polygon_reference' THEN %s ELSE name END,
              asset_type=CASE WHEN asset_type IS NULL OR metadata->>'reference_source'='polygon_reference' THEN %s ELSE asset_type END,
              sector=CASE WHEN sector IS NULL OR metadata->>'reference_source'='polygon_reference' THEN %s ELSE sector END,
              market_cap=CASE WHEN market_cap IS NULL OR metadata->>'reference_source'='polygon_reference' THEN %s ELSE market_cap END,
              optionable=CASE WHEN %s IS TRUE THEN TRUE ELSE optionable END,
              metadata=metadata || %s::jsonb,
              updated_at=NOW()
            WHERE symbol=%s
            """,
            (
                reference.name, asset_type(reference), sector, reference.market_cap, optionable,
                json.dumps(metadata, separators=(',', ':')), reference.symbol,
            ),
        )
    conn.commit()


def run(provider=None) -> dict:
    if os.getenv('REFERENCE_METADATA_ENABLED', 'true').lower() != 'true':
        return {'status': 'disabled', 'updated': 0, 'missing': 0, 'failed': 0}
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    provider = provider or PolygonReferenceProvider()
    conn = psycopg2.connect(database_url)
    updated = missing = failed = 0
    try:
        symbols = load_symbols(conn)
        for symbol in symbols:
            try:
                reference = provider.fetch_ticker(symbol)
                if reference is None:
                    missing += 1
                    continue
                persist_reference(conn, reference, confirmed_optionable(conn, symbol))
                updated += 1
            except Exception as exc:
                conn.rollback()
                failed += 1
                log.error('Reference metadata failed for %s: %s', symbol, exc)
        result = {'status': 'written', 'symbols': len(symbols), 'updated': updated, 'missing': missing, 'failed': failed}
        log.info('Reference metadata complete: %s', result)
        return result
    finally:
        conn.close()


if __name__ == '__main__':
    print(run())
