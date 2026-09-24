from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import Json

from collector_runtime import configure_logging, load_collector_env
from common import load_watchlist
from operator_alerts import format_health_report, send_operator_alert


load_collector_env(__file__)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')

MARKET_TIMEZONE = ZoneInfo('America/New_York')
_SESSION_OPEN = time(9, 30)
_SESSION_CLOSE = time(16, 0)


def staleness_reference(now: datetime) -> datetime:
    """快照「过期」的计时终点：盘中 = 现在；盘外 = 最近一次常规时段收盘（16:00 ET）。

    2026-09-23：期权报价收盘后不再变化，而原来一律用 now 计龄，于是 16:00 之后
    每过一分钟就有更多标的"超过 180 分钟未更新"，告警整晚越滚越大。
    盘外用上一次收盘计龄，过期的含义回到"收盘前那段时间里没刷到"。
    节假日不建模（按工作日处理，最坏是节假日当天多算一段，和原来一样）。
    """
    now_et = _as_utc(now).astimezone(MARKET_TIMEZONE)
    day = now_et
    if day.weekday() < 5 and _SESSION_OPEN <= day.time() < _SESSION_CLOSE:
        return _as_utc(now)
    if day.weekday() < 5 and day.time() >= _SESSION_CLOSE:
        close_day = day.date()
    else:
        d = day.date() - timedelta(days=1)
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        close_day = d
    close = datetime.combine(close_day, _SESSION_CLOSE, tzinfo=MARKET_TIMEZONE)
    return close.astimezone(timezone.utc)


@dataclass(frozen=True)
class HealthThresholds:
    min_coverage_pct: float = 95.0
    max_failed_24h: int = 0
    max_snapshot_age_minutes: int = 180
    min_completeness_pct: float = 75.0
    # Share of usable symbols allowed below min_completeness_pct before it is an
    # issue. See the completeness block in evaluate_health for why this exists.
    max_incomplete_pct: float = 2.0
    alert_cooldown_minutes: int = 60


def thresholds_from_env() -> HealthThresholds:
    return HealthThresholds(
        min_coverage_pct=float(os.getenv('HEALTH_MIN_COVERAGE_PCT', '95')),
        max_failed_24h=int(os.getenv('HEALTH_MAX_FAILED_24H', '0')),
        max_snapshot_age_minutes=int(os.getenv('HEALTH_MAX_SNAPSHOT_AGE_MINUTES', '180')),
        min_completeness_pct=float(os.getenv('HEALTH_MIN_COMPLETENESS_PCT', '75')),
        max_incomplete_pct=float(os.getenv('HEALTH_MAX_INCOMPLETE_PCT', '2')),
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
    reference = staleness_reference(now)
    incomplete = []
    missing = []
    for symbol in symbols:
        row = latest_by_symbol.get(symbol)
        if not row or int(row.get('contract_count') or 0) <= 0 or row.get('provider_status') in ('empty', 'metadata_only'):
            missing.append(symbol)
            continue
        usable.append(symbol)
        snapshot_ts = row.get('snapshot_ts')
        if snapshot_ts is None or reference - _as_utc(snapshot_ts) > timedelta(minutes=thresholds.max_snapshot_age_minutes):
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
    # 完整度按**比例**触发，不再"有一个就报"（2026-09-24）。
    # FBND（平均 70.8%）和 SRVR（73.1%）是期权本来就薄的两个 ETF，每一次快照都
    # 低于 75%，永远达不到。按"任意一个"触发，这条告警会每小时准时响、永不消失，
    # 恰恰把真正的故障淹没掉。真出问题时是一批标的一起掉（全 universe 平均 98.3%），
    # 比例规则照样会报。名单与计数仍完整写进报告，只是不再单独升级成告警。
    incomplete_pct = 0.0 if not usable else len(incomplete) / len(usable) * 100
    if incomplete and incomplete_pct > thresholds.max_incomplete_pct:
        issues.append({
            'code': 'completeness_below_threshold',
            'value': len(incomplete),
            'pct': round(incomplete_pct, 2),
            'threshold': thresholds.min_completeness_pct,
            'max_incomplete_pct': thresholds.max_incomplete_pct,
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
        'incomplete_symbols': incomplete,
        'failed_count_24h': failed_count_24h,
        'issues': issues,
    }


def alert_fingerprint(report: dict[str, Any]) -> str:
    """告警去重键：**只看问题类型**，不看具体是哪些标的（2026-09-23）。

    原来把每类问题的完整标的名单也算进指纹。采集器是轮转刷新的，每 5 分钟
    过期名单都会变一点 ⇒ 指纹每次都是新的 ⇒ 60 分钟冷却从未生效，
    同一个"部分标的过期"的状况一天推送 50–100 条（09-14 至 09-23 实测）。
    名单仍完整写进 payload 与推送正文；变的只是"算不算同一件事"。
    """
    state = sorted(issue['code'] for issue in report['issues'])
    encoded = json.dumps(state, separators=(',', ':')).encode('utf-8')
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
        # 2026-08-28：日志留全量 JSON，推送只发人话。
        #
        # 原来两边都是 json.dumps(indent=2)：手机上收到的是半屏 fingerprint /
        # expected_count / 嵌套 issues 数组，要人自己解析才知道出了什么事。
        #
        # 一个中间版本的改法是干脆不推了，理由是「覆盖率 95.65%、两条薄链」属于
        # 趋势观察而非待处置事件，而 threshold=0 让它天天刷屏。前半句站得住，
        # 后半句已经从根上修掉了（HEALTH_MAX_FAILED_24H 0 → 25）。
        #
        # 但当天的真实事故说明不能不推：IB 报价 lane 连续 110 分钟零成功。
        # 它其实**推送过两次**（collector_health_alerts id 5735，10:41 与 11:43 ET），
        # 失效的不是投递，是内容——消息说的是 `failed_jobs_above_threshold: 59`，
        # 而不是「IB 报价 lane 已经 110 分钟没有一次成功」。
        #
        # 所以：**「记录下来」和「把人叫醒」确实是两件事，但答案是两件都做。**
        # 日志拿全量事实供查询，推送拿一句人读得懂的话。
        log.warning(
            'collector health degraded (%s): %s',
            issue_codes,
            json.dumps({'fingerprint': fingerprint, **report},
                       ensure_ascii=True, sort_keys=True),
        )
        send_operator_alert(
            f'采集器 {report["status"]}',
            format_health_report(report, fingerprint),
            severity='critical' if report['failed_count_24h'] > thresholds.max_failed_24h else 'warning',
        )
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
    configure_logging(datefmt=None)
    run()
