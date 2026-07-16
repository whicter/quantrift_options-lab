from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

from common import load_watchlist
from operator_alerts import send_operator_alert


load_dotenv(Path(__file__).with_name('.env'))
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')


@dataclass(frozen=True)
class HealthThresholds:
    min_coverage_pct: float = 95.0
    max_failed_24h: int = 0
    max_snapshot_age_minutes: int = 180
    min_completeness_pct: float = 75.0
    alert_cooldown_minutes: int = 60


def thresholds_from_env() -> HealthThresholds:
    return HealthThresholds(
        min_coverage_pct=float(os.getenv('HEALTH_MIN_COVERAGE_PCT', '95')),
        max_failed_24h=int(os.getenv('HEALTH_MAX_FAILED_24H', '0')),
        max_snapshot_age_minutes=int(os.getenv('HEALTH_MAX_SNAPSHOT_AGE_MINUTES', '180')),
        min_completeness_pct=float(os.getenv('HEALTH_MIN_COMPLETENESS_PCT', '75')),
        alert_cooldown_minutes=int(os.getenv('HEALTH_ALERT_COOLDOWN_MINUTES', '60')),
    )


def evaluate_health(
    symbols: list[str],
    latest_by_symbol: dict[str, dict[str, Any]],
    failed_count_24h: int,
    now: datetime,
    thresholds: HealthThresholds,
) -> dict[str, Any]:
    usable = []
    stale = []
    incomplete = []
    missing = []
    for symbol in symbols:
        row = latest_by_symbol.get(symbol)
        if not row or int(row.get('contract_count') or 0) <= 0 or row.get('provider_status') in ('empty', 'metadata_only'):
            missing.append(symbol)
            continue
        usable.append(symbol)
        snapshot_ts = row.get('snapshot_ts')
        if snapshot_ts is None or now - _as_utc(snapshot_ts) > timedelta(minutes=thresholds.max_snapshot_age_minutes):
            stale.append(symbol)
        completeness = _to_float(row.get('completeness_pct'))
        if completeness is None or completeness < thresholds.min_completeness_pct:
            incomplete.append(symbol)

    expected_count = len(symbols)
    coverage_pct = 100.0 if expected_count == 0 else len(usable) / expected_count * 100
    issues = []
    if coverage_pct < thresholds.min_coverage_pct:
        issues.append({
            'code': 'coverage_below_threshold',
            'value': round(coverage_pct, 2),
            'threshold': thresholds.min_coverage_pct,
            'symbols': missing,
        })
    if failed_count_24h > thresholds.max_failed_24h:
        issues.append({
            'code': 'failed_jobs_above_threshold',
            'value': failed_count_24h,
            'threshold': thresholds.max_failed_24h,
            'symbols': [],
        })
    if stale:
        issues.append({
            'code': 'snapshot_age_above_threshold',
            'value': len(stale),
            'threshold': thresholds.max_snapshot_age_minutes,
            'symbols': stale,
        })
    if incomplete:
        issues.append({
            'code': 'completeness_below_threshold',
            'value': len(incomplete),
            'threshold': thresholds.min_completeness_pct,
            'symbols': incomplete,
        })

    return {
        'status': 'ok' if not issues else 'degraded',
        'generated_at': now.isoformat(),
        'expected_count': expected_count,
        'covered_count': len(usable),
        'coverage_pct': round(coverage_pct, 2),
        'missing_count': len(missing),
        'stale_count': len(stale),
        'incomplete_count': len(incomplete),
        'failed_count_24h': failed_count_24h,
        'issues': issues,
    }


def alert_fingerprint(report: dict[str, Any]) -> str:
    state = [
        {'code': issue['code'], 'symbols': sorted(issue.get('symbols') or [])}
        for issue in report['issues']
    ]
    encoded = json.dumps(state, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def should_notify(last_notified: datetime | None, now: datetime, cooldown_minutes: int) -> bool:
    return last_notified is None or now - _as_utc(last_notified) >= timedelta(minutes=cooldown_minutes)


def load_health_state(conn, symbols: list[str]) -> tuple[dict[str, dict[str, Any]], int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (symbol)
              symbol, snapshot_ts, provider_status, contract_count, completeness_pct,
              missing_greeks_ratio, missing_oi_ratio, source
            FROM option_chain_snapshots
            WHERE symbol = ANY(%s)
            ORDER BY symbol, snapshot_ts DESC
            """,
            (symbols,),
        )
        columns = [desc[0] for desc in cur.description]
        latest = {row[0]: dict(zip(columns, row)) for row in cur.fetchall()}
        cur.execute(
            """
            SELECT COUNT(*)::int
            FROM provider_fetch_jobs
            WHERE status = 'failed'
              AND created_at >= NOW() - INTERVAL '24 hours'
            """
        )
        failed_count = int(cur.fetchone()[0])
    return latest, failed_count


def record_report(conn, report: dict[str, Any], thresholds: HealthThresholds, now: datetime) -> tuple[str | None, bool]:
    if not report['issues']:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE collector_health_alerts
                SET status = 'resolved', resolved_at = %s, last_seen_at = %s
                WHERE status = 'active'
                """,
                (now, now),
            )
        conn.commit()
        return None, False

    fingerprint = alert_fingerprint(report)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, last_notified_at
            FROM collector_health_alerts
            WHERE fingerprint = %s
            """,
            (fingerprint,),
        )
        row = cur.fetchone()
        notify = (
            row is None
            or row[0] != 'active'
            or should_notify(row[1], now, thresholds.alert_cooldown_minutes)
        )
        cur.execute(
            """
            INSERT INTO collector_health_alerts (
              fingerprint, status, payload, first_seen_at, last_seen_at, last_notified_at
            )
            VALUES (%s, 'active', %s, %s, %s, %s)
            ON CONFLICT (fingerprint) DO UPDATE SET
              status = 'active', payload = EXCLUDED.payload, last_seen_at = EXCLUDED.last_seen_at,
              last_notified_at = CASE
                WHEN %s THEN EXCLUDED.last_notified_at
                ELSE collector_health_alerts.last_notified_at
              END,
              resolved_at = NULL
            """,
            (fingerprint, Json(report), now, now, now if notify else None, notify),
        )
    conn.commit()
    return fingerprint, notify


def run() -> dict[str, Any]:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    symbols = load_watchlist()
    thresholds = thresholds_from_env()
    now = datetime.now(timezone.utc)
    conn = psycopg2.connect(DB_URL)
    try:
        latest, failed_count = load_health_state(conn, symbols)
        report = evaluate_health(symbols, latest, failed_count, now, thresholds)
        fingerprint, notify = record_report(conn, report, thresholds, now)
    finally:
        conn.close()

    if notify:
        issue_codes = ', '.join(issue['code'] for issue in report['issues'])
        send_operator_alert(
            '[Quantrift] Collector health degraded',
            json.dumps({'fingerprint': fingerprint, **report}, indent=2, ensure_ascii=True),
            severity='critical' if report['failed_count_24h'] > 0 else 'warning',
        )
        log.warning('collector health alert sent: %s', issue_codes)
    else:
        log.info('collector health status=%s notify=%s', report['status'], notify)
    return report


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _to_float(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    run()
