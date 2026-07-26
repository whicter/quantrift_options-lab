import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collect_news import load_universe, persist_articles, run
from providers.ib_news_provider import NewsItem


class FakeCursor:
    def __init__(self, rows=None, returning_rows=None):
        self.rows = rows or []
        self.sql = ''
        self.returning_rows = returning_rows if returning_rows is not None else []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, sql, params=None):
        self.sql = sql

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows=None):
        self.cursor_instance = FakeCursor(rows)
        self.committed = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True


def item(symbol, article_id, provider_code='DJ-N', hours_ago=0):
    return NewsItem(
        symbol=symbol, published_at=datetime.now(timezone.utc), provider_code=provider_code,
        article_id=article_id, headline=f'{symbol} headline {article_id}', source='ib_internal',
    )


class LoadUniverseTest(unittest.TestCase):
    def test_query_uses_the_real_scan_enabled_schema_and_is_sorted(self):
        conn = FakeConnection([('aapl',), ('MSFT',)])
        self.assertEqual(load_universe(conn), ['AAPL', 'MSFT'])
        self.assertIn('scan_enabled=TRUE', conn.cursor_instance.sql)
        self.assertIn('active=TRUE', conn.cursor_instance.sql)


class PersistArticlesTest(unittest.TestCase):
    @patch('collect_news.execute_values')
    def test_dedups_via_on_conflict_and_returns_new_row_count(self, execute_values):
        execute_values.return_value = [(1,), (2,)]  # 2 of 3 were genuinely new
        conn = FakeConnection()
        items = [item('AAPL', 'a1'), item('AAPL', 'a1'), item('MSFT', 'm1')]
        written = persist_articles(conn, items)
        self.assertEqual(written, 2)
        self.assertTrue(conn.committed)
        sql = execute_values.call_args.args[1]
        self.assertIn('ON CONFLICT (symbol, provider_code, article_id) DO NOTHING', sql)
        self.assertIn('INSERT INTO news_articles', sql)

    def test_empty_items_is_a_cheap_no_op(self):
        conn = FakeConnection()
        self.assertEqual(persist_articles(conn, []), 0)
        self.assertFalse(conn.committed)


class RunGatingTest(unittest.TestCase):
    @patch.dict(os.environ, {'NEWS_INGESTION_ENABLED': 'false'}, clear=False)
    def test_disabled_by_default_is_a_no_op(self):
        self.assertEqual(run(), {'status': 'disabled', 'symbols': 0})

    @patch.dict(os.environ, {'NEWS_INGESTION_ENABLED': 'true', 'DATABASE_URL': ''}, clear=False)
    def test_enabled_without_database_url_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, 'DATABASE_URL'):
            run()


if __name__ == '__main__':
    unittest.main()
