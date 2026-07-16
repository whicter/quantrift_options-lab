from __future__ import annotations

import json
import logging
import math
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

from providers.reddit_trends_provider import RedditPost, RedditTrendsProvider


load_dotenv(Path(__file__).with_name('.env'))
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

TOKEN_PATTERN = re.compile(r'(?<![A-Za-z0-9.])(\$?)([A-Za-z]{1,5}(?:\.[A-Za-z])?)(?![A-Za-z0-9.])')
AMBIGUOUS_TICKERS = {
    'A', 'ALL', 'AI', 'ARE', 'BE', 'BIG', 'CAN', 'CEO', 'DD', 'EV', 'FOR', 'GO', 'IT',
    'LOVE', 'NOW', 'ON', 'ONE', 'OR', 'OUT', 'SO', 'T', 'TV', 'US', 'WE', 'YOU',
}


def extract_symbols(text: str, universe: set[str]) -> set[str]:
    mentions = set()
    for match in TOKEN_PATTERN.finditer(text):
        explicit = match.group(1) == '$'
        raw_symbol = match.group(2)
        if not explicit and raw_symbol != raw_symbol.upper():
            continue
        symbol = raw_symbol.upper()
        if symbol in universe and (explicit or symbol not in AMBIGUOUS_TICKERS):
            mentions.add(symbol)
    return mentions


def aggregate_posts(posts: list[RedditPost], universe: set[str], window_hours: int, now=None) -> list[dict]:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=window_hours)
    aggregates = {}
    seen_posts = set()
    for post in posts:
        if post.post_id in seen_posts or post.created_at < cutoff:
            continue
        seen_posts.add(post.post_id)
        symbols = extract_symbols(f'{post.title}\n{post.selftext}', universe)
        weight = 1 + math.log1p(post.score) + 0.5 * math.log1p(post.comments)
        for symbol in symbols:
            item = aggregates.setdefault(symbol, {
                'symbol': symbol, 'mention_count': 0, 'weighted_score': 0.0,
                'total_upvotes': 0, 'total_comments': 0, 'sample_titles': [],
            })
            item['mention_count'] += 1
            item['weighted_score'] += weight
            item['total_upvotes'] += post.score
            item['total_comments'] += post.comments
            if len(item['sample_titles']) < 3:
                item['sample_titles'].append(post.title[:240])
    return sorted(aggregates.values(), key=lambda item: (-item['weighted_score'], item['symbol']))


def load_universe(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM symbol_universe WHERE active=TRUE AND scannable=TRUE")
        return {row[0].upper() for row in cur.fetchall()}


def persist_snapshot(conn, rows: list[dict], source: str, window_hours: int, post_count: int, metadata: dict) -> int:
    snapshot_ts = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO community_trend_snapshots (snapshot_ts,source,window_hours,post_count,raw_metadata)
            VALUES (%s,%s,%s,%s,%s::jsonb) RETURNING id
            """,
            (snapshot_ts, source, window_hours, post_count, json.dumps(metadata)),
        )
        snapshot_id = cur.fetchone()[0]
        if rows:
            execute_values(
                cur,
                """
                INSERT INTO community_symbol_trends (
                  snapshot_id,symbol,mention_count,weighted_score,total_upvotes,total_comments,sample_titles
                ) VALUES %s
                """,
                [(
                    snapshot_id, row['symbol'], row['mention_count'], row['weighted_score'],
                    row['total_upvotes'], row['total_comments'], json.dumps(row['sample_titles']),
                ) for row in rows],
                template='(%s,%s,%s,%s,%s,%s,%s::jsonb)',
            )
    conn.commit()
    return snapshot_id


def run() -> dict:
    if os.getenv('REDDIT_TRENDS_ENABLED', 'false').strip().lower() != 'true':
        log.info('Reddit trends disabled')
        return {'status': 'disabled', 'symbols': 0}
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    window_hours = max(int(os.getenv('REDDIT_WINDOW_HOURS', '24')), 1)
    subreddits = [item.strip() for item in os.getenv(
        'REDDIT_SUBREDDITS', 'wallstreetbets,stocks,options,investing'
    ).split(',') if item.strip()]
    provider = RedditTrendsProvider()
    conn = psycopg2.connect(database_url)
    try:
        universe = load_universe(conn)
        posts = provider.fetch_new_posts(subreddits)
        rows = aggregate_posts(posts, universe, window_hours)
        snapshot_id = persist_snapshot(
            conn, rows, provider.source, window_hours, len(posts),
            {'subreddits': subreddits, 'universe_size': len(universe)},
        )
        result = {'status': 'written', 'snapshot_id': snapshot_id, 'posts': len(posts), 'symbols': len(rows)}
        log.info('Reddit trends written: %s', result)
        return result
    finally:
        conn.close()


if __name__ == '__main__':
    run()
