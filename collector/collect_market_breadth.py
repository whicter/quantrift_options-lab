"""Collect full U.S. common-stock market breadth after the close.

The job is intentionally separate from the option/GEX refresh lane. It makes
one grouped-daily request per required market date plus point-in-time reference
pagination, computes the aggregate locally, and stores only a compact daily
snapshot. The public API reads PostgreSQL and never calls Polygon directly.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg2
from requests.exceptions import HTTPError

from collector_runtime import configure_collector
from providers.polygon_market_breadth_provider import (
    CommonStockReference,
    GroupedDailyBar,
    PolygonMarketBreadthProvider,
)


configure_collector(__file__)
log = logging.getLogger(__name__)

MARKET_TIMEZONE = ZoneInfo('America/New_York')
EOD_SETTLE_HOUR_ET = int(os.getenv('MARKET_BREADTH_EOD_SETTLE_HOUR_ET', '20'))
LOOKBACK_CALENDAR_DAYS = int(os.getenv('MARKET_BREADTH_LOOKBACK_CALENDAR_DAYS', '10'))
MIN_COUNT = int(os.getenv('MARKET_BREADTH_MIN_COUNT', '2000'))
MIN_COVERAGE_PCT = float(os.getenv('MARKET_BREADTH_MIN_COVERAGE_PCT', '90'))
EXCHANGES = tuple(
    item.strip().upper()
    for item in os.getenv('MARKET_BREADTH_EXCHANGES', 'XNAS,XNYS,XASE').split(',')
    if item.strip()
)
EXCHANGE_LABELS = {
    'XNAS': 'Nasdaq',
    'XNYS': 'NYSE',
    'XASE': 'NYSE American',
}
# Polygon answers 403/404 for a grouped-daily date this plan cannot serve yet,
# which is indistinguishable from "not published" and must not end the walk-back.
# Everything else (401 bad key, 429 pacing, 5xx) still propagates: a genuinely
# unentitled key 403s on every date, exhausts the lookback and fails closed.
UNAVAILABLE_STATUSES = frozenset({403, 404})


def expected_market_date(now_et: datetime, settle_hour: int = EOD_SETTLE_HOUR_ET) -> date:
    candidate = now_et.date()
    if now_et.hour < settle_hour:
        candidate -= timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def latest_grouped_on_or_before(
    provider: PolygonMarketBreadthProvider,
    candidate: date,
    max_calendar_days: int = LOOKBACK_CALENDAR_DAYS,
) -> tuple[date, dict[str, GroupedDailyBar]]:
    skipped: list[str] = []
    for offset in range(max_calendar_days + 1):
        market_date = candidate - timedelta(days=offset)
        if market_date.weekday() >= 5:
            continue
        try:
            bars = provider.fetch_grouped_daily(market_date)
        except HTTPError as exc:
            status = getattr(exc.response, 'status_code', None)
            if status not in UNAVAILABLE_STATUSES:
                raise
            skipped.append(f'{market_date.isoformat()}:{status}')
            log.warning(
                'grouped daily unavailable for %s (HTTP %s); trying earlier session',
                market_date.isoformat(),
                status,
            )
            continue
        if bars:
            if skipped:
                log.info(
                    'settled on %s after skipping %s',
                    market_date.isoformat(),
                    ', '.join(skipped),
                )
            return market_date, bars
        skipped.append(f'{market_date.isoformat()}:empty')
    raise RuntimeError(
        f'no grouped daily data found on or before {candidate} '
        f'(attempted: {", ".join(skipped) or "none"})'
    )


def pct(value: int | float, total: int | float) -> float | None:
    return round((value / total) * 100, 1) if total else None


def summarize_scope(
    symbols: set[str],
    current: dict[str, GroupedDailyBar],
    previous: dict[str, GroupedDailyBar],
) -> dict:
    advances = declines = unchanged = 0
    advancing_volume = declining_volume = unchanged_volume = 0
    volume_counted = 0
    counted = 0

    for symbol in symbols:
        current_bar = current.get(symbol)
        previous_bar = previous.get(symbol)
        if current_bar is None or previous_bar is None:
            continue
        counted += 1
        if current_bar.close > previous_bar.close:
            bucket = 'advance'
            advances += 1
        elif current_bar.close < previous_bar.close:
            bucket = 'decline'
            declines += 1
        else:
            bucket = 'unchanged'
            unchanged += 1

        if current_bar.volume is None:
            continue
        volume_counted += 1
        if bucket == 'advance':
            advancing_volume += current_bar.volume
        elif bucket == 'decline':
            declining_volume += current_bar.volume
        else:
            unchanged_volume += current_bar.volume

    total_volume = advancing_volume + declining_volume + unchanged_volume
    return {
        'counted': counted,
        'advances': advances,
        'declines': declines,
        'unchanged': unchanged,
        'advance_pct': pct(advances, counted),
        'decline_pct': pct(declines, counted),
        'unchanged_pct': pct(unchanged, counted),
        'net_advances': advances - declines,
        'advance_decline_ratio': round(advances / declines, 4) if declines else None,
        'volume_counted': volume_counted,
        'advancing_volume': advancing_volume,
        'declining_volume': declining_volume,
        'unchanged_volume': unchanged_volume,
        'advancing_volume_pct': pct(advancing_volume, total_volume),
        'declining_volume_pct': pct(declining_volume, total_volume),
    }


def build_snapshot(
    market_date: date,
    previous_market_date: date,
    current: dict[str, GroupedDailyBar],
    previous: dict[str, GroupedDailyBar],
    references: dict[str, CommonStockReference],
) -> dict:
    traded_symbols = set(current).intersection(references)
    overall = summarize_scope(traded_symbols, current, previous)
    coverage_pct = pct(overall['counted'], len(traded_symbols))
    exchange_breakdown = {}
    for exchange in EXCHANGES:
        exchange_symbols = {
            symbol for symbol in traded_symbols
            if references[symbol].primary_exchange == exchange
        }
        exchange_breakdown[exchange] = {
            'label': EXCHANGE_LABELS.get(exchange, exchange),
            'universe_count': len(exchange_symbols),
            **summarize_scope(exchange_symbols, current, previous),
        }

    return {
        'market_date': market_date,
        'previous_market_date': previous_market_date,
        'reference_count': len(references),
        'universe_count': len(traded_symbols),
        'missing_previous_count': len(traded_symbols) - overall['counted'],
        'coverage_pct': coverage_pct,
        **overall,
        'exchange_breakdown': exchange_breakdown,
        'source': PolygonMarketBreadthProvider.source,
    }


def validate_snapshot(snapshot: dict) -> None:
    if snapshot['counted'] < MIN_COUNT:
        raise RuntimeError(
            f'market breadth counted only {snapshot["counted"]} common stocks; '
            f'minimum is {MIN_COUNT}'
        )
    if snapshot['coverage_pct'] is None or snapshot['coverage_pct'] < MIN_COVERAGE_PCT:
        raise RuntimeError(
            f'market breadth prior-close coverage {snapshot["coverage_pct"]}% is below '
            f'{MIN_COVERAGE_PCT}%'
        )


def persist_snapshot(conn, snapshot: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO market_breadth_daily (
              market_date, previous_market_date, reference_count, universe_count,
              counted, missing_previous_count, coverage_pct,
              advances, declines, unchanged, advance_pct, decline_pct, unchanged_pct,
              net_advances, advance_decline_ratio,
              volume_counted, advancing_volume, declining_volume, unchanged_volume,
              advancing_volume_pct, declining_volume_pct,
              exchange_breakdown, source, collected_at, updated_at
            ) VALUES (
              %(market_date)s, %(previous_market_date)s, %(reference_count)s, %(universe_count)s,
              %(counted)s, %(missing_previous_count)s, %(coverage_pct)s,
              %(advances)s, %(declines)s, %(unchanged)s, %(advance_pct)s, %(decline_pct)s, %(unchanged_pct)s,
              %(net_advances)s, %(advance_decline_ratio)s,
              %(volume_counted)s, %(advancing_volume)s, %(declining_volume)s, %(unchanged_volume)s,
              %(advancing_volume_pct)s, %(declining_volume_pct)s,
              %(exchange_breakdown)s::jsonb, %(source)s, NOW(), NOW()
            )
            ON CONFLICT (market_date) DO UPDATE SET
              previous_market_date=EXCLUDED.previous_market_date,
              reference_count=EXCLUDED.reference_count,
              universe_count=EXCLUDED.universe_count,
              counted=EXCLUDED.counted,
              missing_previous_count=EXCLUDED.missing_previous_count,
              coverage_pct=EXCLUDED.coverage_pct,
              advances=EXCLUDED.advances,
              declines=EXCLUDED.declines,
              unchanged=EXCLUDED.unchanged,
              advance_pct=EXCLUDED.advance_pct,
              decline_pct=EXCLUDED.decline_pct,
              unchanged_pct=EXCLUDED.unchanged_pct,
              net_advances=EXCLUDED.net_advances,
              advance_decline_ratio=EXCLUDED.advance_decline_ratio,
              volume_counted=EXCLUDED.volume_counted,
              advancing_volume=EXCLUDED.advancing_volume,
              declining_volume=EXCLUDED.declining_volume,
              unchanged_volume=EXCLUDED.unchanged_volume,
              advancing_volume_pct=EXCLUDED.advancing_volume_pct,
              declining_volume_pct=EXCLUDED.declining_volume_pct,
              exchange_breakdown=EXCLUDED.exchange_breakdown,
              source=EXCLUDED.source,
              collected_at=NOW(),
              updated_at=NOW()
            """,
            {
                **snapshot,
                'exchange_breakdown': json.dumps(
                    snapshot['exchange_breakdown'],
                    separators=(',', ':'),
                ),
            },
        )
    conn.commit()


def run(
    provider: PolygonMarketBreadthProvider | None = None,
    target_date: date | None = None,
) -> dict:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    provider = provider or PolygonMarketBreadthProvider()
    now_et = datetime.now(timezone.utc).astimezone(MARKET_TIMEZONE)
    candidate = target_date or expected_market_date(now_et)
    market_date, current = latest_grouped_on_or_before(provider, candidate)
    previous_market_date, previous = latest_grouped_on_or_before(
        provider,
        market_date - timedelta(days=1),
    )
    references = provider.fetch_common_stocks(market_date, EXCHANGES)
    snapshot = build_snapshot(
        market_date,
        previous_market_date,
        current,
        previous,
        references,
    )
    validate_snapshot(snapshot)

    conn = psycopg2.connect(database_url)
    try:
        persist_snapshot(conn, snapshot)
    finally:
        conn.close()
    result = {
        'status': 'written',
        'market_date': market_date.isoformat(),
        'previous_market_date': previous_market_date.isoformat(),
        'universe_count': snapshot['universe_count'],
        'counted': snapshot['counted'],
        'coverage_pct': snapshot['coverage_pct'],
        'advances': snapshot['advances'],
        'declines': snapshot['declines'],
    }
    log.info('Full-market breadth complete: %s', result)
    return result


def parse_args():
    parser = argparse.ArgumentParser(description='Collect full-market EOD breadth')
    parser.add_argument('--date', help='Optional target market date (YYYY-MM-DD)')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    requested_date = date.fromisoformat(args.date) if args.date else None
    print(run(target_date=requested_date))
