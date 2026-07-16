from __future__ import annotations

import json
import logging
import os
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json, RealDictCursor

from operator_alerts import send_email, send_web_push


load_dotenv()
log = logging.getLogger(__name__)
DB_URL = os.getenv('DATABASE_URL')


def matches_rules(row: dict[str, Any], rules: dict[str, Any]) -> bool:
    symbols = rules.get('symbols') or []
    if symbols and row['symbol'] not in symbols:
        return False
    minimum = rules.get('min_iv_rank')
    if minimum is not None and (row.get('iv_rank') is None or float(row['iv_rank']) < float(minimum)):
        return False
    regime = rules.get('gamma_regime')
    if regime and row.get('gamma_regime') != regime:
        return False
    if rules.get('unusual_only') and int(row.get('unusual_oi_count') or 0) <= 0:
        return False
    return True


def build_payload(row: dict[str, Any]) -> dict[str, Any]:
    iv_rank = None if row.get('iv_rank') is None else round(float(row['iv_rank']), 1)
    return {
        'title': f"Quantrift scanner: {row['symbol']}",
        'body': f"IV Rank {iv_rank if iv_rank is not None else '--'} | {row.get('gamma_regime') or 'Gamma --'} | signal {row.get('signal_score') or '--'}",
        'url': f"{os.getenv('PUBLIC_APP_URL', 'https://www.quantrift.io')}/analyze?symbol={row['symbol']}&tab=0",
        'symbol': row['symbol'],
        'iv_rank': iv_rank,
        'gamma_regime': row.get('gamma_regime'),
        'signal_score': row.get('signal_score'),
    }


def deliver(channel: str, destination: dict[str, Any], payload: dict[str, Any]) -> tuple[str, str | None]:
    if channel == 'email':
        return send_email(destination['email'], payload['title'], f"{payload['body']}\n\n{payload['url']}")
    if channel == 'web_push':
        return send_web_push(destination, payload)
    return 'failed', f'unsupported channel: {channel}'


def run() -> dict[str, int]:
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    conn = psycopg2.connect(DB_URL)
    counts = {'matched': 0, 'sent': 0, 'blocked': 0, 'failed': 0}
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT MAX(snapshot_ts) snapshot_ts FROM scanner_results_snapshots WHERE scan_key = 'watchlist_v1'")
            latest = cur.fetchone()['snapshot_ts']
            if latest is None:
                return counts
            cur.execute("SELECT * FROM scanner_results_snapshots WHERE scan_key = 'watchlist_v1' AND snapshot_ts = %s", (latest,))
            rows = cur.fetchall()
            cur.execute("SELECT id, channel, destination, rules FROM scanner_alert_subscriptions WHERE active = TRUE")
            subscriptions = cur.fetchall()
            for subscription in subscriptions:
                for row in rows:
                    if not matches_rules(row, subscription['rules'] or {}):
                        continue
                    counts['matched'] += 1
                    payload = build_payload(row)
                    candidate_key = row['symbol']
                    cur.execute(
                        """
                        INSERT INTO scanner_alert_deliveries (
                          subscription_id, scan_key, scan_snapshot_ts, candidate_key, payload, status, channel
                        ) VALUES (%s, 'watchlist_v1', %s, %s, %s, 'pending', %s)
                        ON CONFLICT (subscription_id, scan_snapshot_ts, candidate_key) DO NOTHING
                        RETURNING id
                        """,
                        (subscription['id'], latest, candidate_key, Json(payload), subscription['channel']),
                    )
                    inserted = cur.fetchone()
                    if not inserted:
                        continue
                    status, error = deliver(subscription['channel'], subscription['destination'], payload)
                    cur.execute(
                        "UPDATE scanner_alert_deliveries SET status=%s, error=%s, attempted_at=NOW() WHERE id=%s",
                        (status, error, inserted['id']),
                    )
                    counts[status] += 1
            conn.commit()
    finally:
        conn.close()
    log.info('scanner alerts evaluated: %s', counts)
    return counts


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    run()
