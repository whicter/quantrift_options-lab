"""News ingestion (R3.2): per-symbol recent headlines via IB Gateway.

Skeleton mirrors collect_reddit_trends.py (load universe -> fetch -> persist),
but the persistence shape differs deliberately: news articles are FACTS (a
specific headline published at a specific time), so they accumulate into one
deduped table (like price_history/iv_history), not a per-run snapshot batch
(like community_trend_snapshots, whose rows are recomputed aggregates that
legitimately differ every run).

Source selection (2026-07-26, see docs/validation/NEWS_SOURCE_SELECTION_2026-07-26.md):
IB Gateway only. GDELT was live-tested and rejected -- public rate limit
tighter than documented, and ticker association would need unreliable
string-matching. IB already has 8 subscribed providers (Dow Jones suite +
Briefing.com) and associates news to a symbol exactly, via conId.
"""

from __future__ import annotations

import logging
import os

import psycopg2
from psycopg2.extras import execute_values

from collector_runtime import configure_collector
from providers.ib_news_provider import IBNewsProvider

configure_collector(__file__, datefmt=None)
log = logging.getLogger(__name__)


def load_universe(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM symbol_universe WHERE active=TRUE AND scan_enabled=TRUE ORDER BY symbol")
        return [row[0].upper() for row in cur.fetchall()]


def persist_articles(conn, items) -> int:
    """Upsert articles, deduped by (symbol, provider_code, article_id). Returns
    the number of genuinely NEW rows written (via xmax trick), not the total
    fetched -- that is the meaningful count for an accumulating fact table
    scraped on an overlapping rolling window."""
    if not items:
        return 0
    with conn.cursor() as cur:
        rows = execute_values(
            cur,
            """
            INSERT INTO news_articles (symbol, published_at, provider_code, article_id, headline, source)
            VALUES %s
            ON CONFLICT (symbol, provider_code, article_id) DO NOTHING
            RETURNING id
            """,
            [(item.symbol, item.published_at, item.provider_code, item.article_id, item.headline, item.source)
             for item in items],
            fetch=True,
        )
    conn.commit()
    return len(rows)


def run() -> dict:
    if os.getenv('NEWS_INGESTION_ENABLED', 'false').strip().lower() != 'true':
        log.info('News ingestion disabled')
        return {'status': 'disabled', 'symbols': 0}
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    window_hours = max(int(os.getenv('NEWS_WINDOW_HOURS', '24')), 1)

    provider = IBNewsProvider()
    conn = psycopg2.connect(database_url)
    try:
        universe = load_universe(conn)
        items = provider.fetch_recent_news(universe, hours=window_hours)
        written = persist_articles(conn, items)
        symbols_with_news = len({item.symbol for item in items})
        result = {
            'status': 'written', 'universe': len(universe), 'fetched': len(items),
            'written': written, 'symbols_with_news': symbols_with_news,
        }
        log.info('News ingestion: %s', result)
        return result
    finally:
        conn.close()


if __name__ == '__main__':
    run()
