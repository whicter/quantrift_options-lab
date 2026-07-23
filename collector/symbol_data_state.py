"""
Per-symbol, per-product data-state summary.

Writes symbol_data_state: one row per (symbol, product) recording what data
actually landed, when, from which source, and what the last refresh attempt
did. Readers (Analyze, the scheduler) use it to decide whether to enqueue,
whether to label data stale, and whether to keep showing an older snapshot.

This module records observed facts only. It deliberately does not store a
freshness label: freshness decays with wall-clock time, so a stored value
would be wrong the moment nothing writes. Callers derive freshness from
latest_snapshot_ts against the product policy at read time.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

log = logging.getLogger(__name__)

# Data products tracked independently. A symbol can have fresh prices and a
# missing option chain at the same time; they must never collapse into one
# per-symbol status.
PRODUCT_PRICE_DAILY = 'price_daily'
PRODUCT_PRICE_30M = 'price_30m'
PRODUCT_METRICS = 'metrics'
PRODUCT_OPTION_CHAIN = 'option_chain'
PRODUCT_GEX = 'gex'

PRODUCTS = (
    PRODUCT_PRICE_DAILY,
    PRODUCT_PRICE_30M,
    PRODUCT_METRICS,
    PRODUCT_OPTION_CHAIN,
    PRODUCT_GEX,
)

# refresh_status describes the last attempt, not the data itself.
STATUS_OK = 'ok'
STATUS_FAILED = 'failed'
STATUS_BLOCKED = 'blocked'
STATUS_UNKNOWN = 'unknown'


def _classify_error(error: str) -> str:
    """Reduce a provider error to a coarse, non-sensitive code.

    The raw message can carry provider names and request detail, which must not
    reach product surfaces. Callers store the code; the full message stays in
    provider_fetch_jobs.last_error for operators.
    """
    text = (error or '').lower()
    if 'device_challenge' in text or 'auth' in text or 'credential' in text or '401' in text or '403' in text:
        return 'auth_unavailable'
    if 'no usable quotes' in text or 'no valid bid/ask' in text or 'bid/ask' in text:
        return 'no_quotes'
    # The data arrived but failed a model quality gate. Distinct from a provider
    # failure: retrying the same provider will not fix it.
    if 'cannot compute gex' in text or 'completeness below' in text:
        return 'insufficient_data'
    if 'unsupported' in text:
        return 'unsupported_provider'
    if 'rate limit' in text or 'too many requests' in text or '429' in text:
        return 'rate_limited'
    if 'not configured' in text or 'unavailable' in text or 'connect' in text or 'timeout' in text:
        return 'provider_unavailable'
    return 'error'


def record_success(
    conn,
    symbol: str,
    product: str,
    snapshot_ts: datetime | None = None,
    market_date: date | None = None,
    source: str | None = None,
    job_id: int | None = None,
    commit: bool = True,
) -> None:
    """Record that real data for (symbol, product) landed."""
    _upsert(
        conn,
        symbol=symbol,
        product=product,
        snapshot_ts=snapshot_ts,
        market_date=market_date,
        source=source,
        refresh_status=STATUS_OK,
        job_id=job_id,
        error_code=None,
        clear_snapshot_fields=False,
        commit=commit,
    )


def record_failure(
    conn,
    symbol: str,
    product: str,
    error: str,
    job_id: int | None = None,
    blocked: bool = False,
    commit: bool = True,
) -> None:
    """Record that the last refresh attempt for (symbol, product) did not land.

    Any previously persisted snapshot fields are preserved: a failed refresh
    does not erase data the product can still legitimately show as stale.
    """
    _upsert(
        conn,
        symbol=symbol,
        product=product,
        snapshot_ts=None,
        market_date=None,
        source=None,
        refresh_status=STATUS_BLOCKED if blocked else STATUS_FAILED,
        job_id=job_id,
        error_code=_classify_error(error),
        clear_snapshot_fields=False,
        commit=commit,
    )


def _upsert(
    conn,
    symbol: str,
    product: str,
    snapshot_ts: datetime | None,
    market_date: date | None,
    source: str | None,
    refresh_status: str,
    job_id: int | None,
    error_code: str | None,
    clear_snapshot_fields: bool,
    commit: bool,
) -> None:
    if product not in PRODUCTS:
        raise ValueError(f'unknown data product: {product}')

    symbol = (symbol or '').strip().upper()
    if not symbol:
        raise ValueError('symbol is required')

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO symbol_data_state (
              symbol, product, latest_snapshot_ts, latest_market_date,
              source, refresh_status, last_job_id, last_error_code, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (symbol, product) DO UPDATE SET
              -- COALESCE keeps the last real snapshot when this attempt did not
              -- produce one, so a failure never blanks still-displayable data.
              latest_snapshot_ts = COALESCE(EXCLUDED.latest_snapshot_ts, symbol_data_state.latest_snapshot_ts),
              latest_market_date = COALESCE(EXCLUDED.latest_market_date, symbol_data_state.latest_market_date),
              source             = COALESCE(EXCLUDED.source, symbol_data_state.source),
              refresh_status     = EXCLUDED.refresh_status,
              last_job_id        = COALESCE(EXCLUDED.last_job_id, symbol_data_state.last_job_id),
              last_error_code    = EXCLUDED.last_error_code,
              updated_at         = NOW()
            """,
            (symbol, product, snapshot_ts, market_date, source, refresh_status, job_id, error_code),
        )
    if commit:
        conn.commit()


def record_products(
    conn,
    symbol: str,
    product_facts: dict[str, dict[str, Any]],
    job_id: int | None = None,
    commit: bool = True,
) -> None:
    """Record several products for one symbol in a single transaction.

    Each product carries its own facts. A price refresh writes daily and 30M
    bars with different market dates, so they must not share one summary.
    """
    for product, facts in product_facts.items():
        error = facts.get('error')
        if error is not None:
            record_failure(conn, symbol, product, error, job_id=job_id, commit=False)
        else:
            record_success(
                conn,
                symbol,
                product,
                snapshot_ts=facts.get('snapshot_ts'),
                market_date=facts.get('market_date'),
                source=facts.get('source'),
                job_id=job_id,
                commit=False,
            )
    if commit:
        conn.commit()
