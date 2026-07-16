import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collect_reddit_trends import aggregate_posts, extract_symbols
from providers.reddit_trends_provider import RedditPost, RedditTrendsProvider


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f'HTTP {self.status_code}')


class FakeSession:
    def __init__(self, posts=None, gets=None):
        self.posts = list(posts or [])
        self.gets = list(gets or [])
        self.post_calls = []
        self.get_calls = []

    def post(self, url, **kwargs):
        self.post_calls.append((url, kwargs))
        return self.posts.pop(0)

    def get(self, url, **kwargs):
        self.get_calls.append((url, kwargs))
        return self.gets.pop(0)


def post(post_id, title, score=0, comments=0, hours_ago=1):
    return RedditPost(
        post_id=post_id, title=title, selftext='', subreddit='options', score=score,
        comments=comments, created_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
    )


class RedditTrendTests(unittest.TestCase):
    def test_symbol_extraction_intersects_universe_and_requires_cashtag_for_ambiguous_tokens(self):
        universe = {'AAPL', 'AI', 'IT', 'PLTR'}
        self.assertEqual(extract_symbols('AAPL and $ai beat it while PLTR rallies aapl', universe), {'AAPL', 'AI', 'PLTR'})

    def test_aggregation_counts_each_post_once_and_excludes_old_posts(self):
        rows = aggregate_posts([
            post('1', 'AAPL AAPL and PLTR', 99, 24),
            post('1', 'duplicate AAPL', 99, 24),
            post('2', '$AAPL update', 9, 3),
            post('3', 'old PLTR', 20, 2, hours_ago=30),
        ], {'AAPL', 'PLTR'}, 24)
        by_symbol = {row['symbol']: row for row in rows}
        self.assertEqual(by_symbol['AAPL']['mention_count'], 2)
        self.assertEqual(by_symbol['AAPL']['total_upvotes'], 108)
        self.assertEqual(by_symbol['PLTR']['mention_count'], 1)

    @patch.dict(os.environ, {
        'REDDIT_CLIENT_ID': 'client', 'REDDIT_CLIENT_SECRET': 'secret',
        'REDDIT_USER_AGENT': 'macos:quantrift:1.0 (by /u/test)', 'REDDIT_MAX_PAGES': '2',
    }, clear=False)
    def test_provider_uses_one_cached_token_and_bounded_pagination(self):
        session = FakeSession(
            posts=[FakeResponse({'access_token': 'token-1', 'expires_in': 3600})],
            gets=[
                FakeResponse({'data': {'children': [{'data': {'id': 'p1', 'title': 'AAPL', 'created_utc': 1}}], 'after': 'next'}}),
                FakeResponse({'data': {'children': [{'data': {'id': 'p2', 'title': 'PLTR', 'created_utc': 2}}], 'after': None}}),
            ],
        )
        provider = RedditTrendsProvider(session)
        posts = provider.fetch_new_posts(['options', 'stocks'])
        self.assertEqual([item.post_id for item in posts], ['p1', 'p2'])
        self.assertEqual(len(session.post_calls), 1)
        self.assertEqual(session.get_calls[0][1]['headers']['Authorization'], 'bearer token-1')
        self.assertEqual(session.get_calls[1][1]['params']['after'], 'next')

    @patch('providers.reddit_trends_provider.time.sleep')
    @patch.dict(os.environ, {
        'REDDIT_CLIENT_ID': 'client', 'REDDIT_CLIENT_SECRET': 'secret',
        'REDDIT_USER_AGENT': 'macos:quantrift:1.0 (by /u/test)', 'REDDIT_MAX_PAGES': '1',
    }, clear=False)
    def test_429_retries_once_with_retry_after(self, sleep):
        session = FakeSession(
            posts=[FakeResponse({'access_token': 'token-1', 'expires_in': 3600})],
            gets=[
                FakeResponse({}, 429, {'Retry-After': '2'}),
                FakeResponse({'data': {'children': [], 'after': None}}),
            ],
        )
        self.assertEqual(RedditTrendsProvider(session).fetch_new_posts(['options']), [])
        sleep.assert_called_once_with(2.0)

    @patch.dict(os.environ, {}, clear=True)
    def test_provider_fails_closed_without_credentials(self):
        with self.assertRaisesRegex(RuntimeError, 'REDDIT_CLIENT_ID'):
            RedditTrendsProvider(FakeSession())


if __name__ == '__main__':
    unittest.main()
