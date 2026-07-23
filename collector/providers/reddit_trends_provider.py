from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests


@dataclass(frozen=True)
class RedditPost:
    post_id: str
    title: str
    selftext: str
    subreddit: str
    score: int
    comments: int
    created_at: datetime


class RedditTrendsProvider:
    source = 'reddit_oauth'

    def __init__(self, session: requests.Session | None = None) -> None:
        self.client_id = os.getenv('REDDIT_CLIENT_ID', '').strip()
        self.client_secret = os.getenv('REDDIT_CLIENT_SECRET', '').strip()
        self.user_agent = os.getenv('REDDIT_USER_AGENT', '').strip()
        if not self.client_id or not self.client_secret or not self.user_agent:
            raise RuntimeError('REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT are required')
        self.auth_url = os.getenv('REDDIT_AUTH_URL', 'https://www.reddit.com/api/v1/access_token')
        self.api_url = os.getenv('REDDIT_API_URL', 'https://oauth.reddit.com').rstrip('/')
        self.timeout = float(os.getenv('REDDIT_TIMEOUT', '20'))
        self.max_pages = min(max(int(os.getenv('REDDIT_MAX_PAGES', '3')), 1), 10)
        self.page_limit = min(max(int(os.getenv('REDDIT_PAGE_LIMIT', '100')), 1), 100)
        self._session = session or requests.Session()
        self._access_token = None
        self._expires_at = 0.0

    def fetch_new_posts(self, subreddits: list[str]) -> list[RedditPost]:
        joined = '+'.join(item.strip() for item in subreddits if item.strip())
        if not joined:
            raise ValueError('at least one subreddit is required')
        posts = []
        after = None
        for _ in range(self.max_pages):
            payload = self._get_listing(joined, after)
            children = payload.get('data', {}).get('children') or []
            posts.extend(self._parse_post(item.get('data') or {}) for item in children)
            after = payload.get('data', {}).get('after')
            if not after or not children:
                break
        return [post for post in posts if post.post_id]

    def _get_listing(self, joined: str, after: str | None) -> dict:
        url = f'{self.api_url}/r/{joined}/new'
        params = {'limit': self.page_limit, 'raw_json': 1}
        if after:
            params['after'] = after
        auth_refreshed = False
        for attempt in range(3):
            response = self._session.get(
                url,
                params=params,
                headers={'Authorization': f'bearer {self._token()}', 'User-Agent': self.user_agent},
                timeout=self.timeout,
            )
            if response.status_code == 401 and not auth_refreshed:
                self._access_token = None
                auth_refreshed = True
                continue
            if response.status_code == 429 and attempt < 2:
                retry_after = min(_retry_after(response.headers.get('Retry-After')), 60)
                if retry_after > 0:
                    time.sleep(retry_after)
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError('Reddit listing request exhausted bounded retries')

    def _token(self) -> str:
        if self._access_token and time.monotonic() < self._expires_at:
            return self._access_token
        response = self._session.post(
            self.auth_url,
            auth=(self.client_id, self.client_secret),
            data={'grant_type': 'client_credentials'},
            headers={'User-Agent': self.user_agent},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        token = str(payload.get('access_token') or '').strip()
        if not token:
            raise RuntimeError('Reddit OAuth response did not include access_token')
        self._access_token = token
        self._expires_at = time.monotonic() + max(int(payload.get('expires_in') or 3600) - 60, 1)
        return token

    @staticmethod
    def _parse_post(item: dict) -> RedditPost:
        created = float(item.get('created_utc') or 0)
        return RedditPost(
            post_id=str(item.get('id') or ''),
            title=str(item.get('title') or ''),
            selftext=str(item.get('selftext') or ''),
            subreddit=str(item.get('subreddit') or ''),
            score=max(int(item.get('score') or 0), 0),
            comments=max(int(item.get('num_comments') or 0), 0),
            created_at=datetime.fromtimestamp(created, tz=timezone.utc),
        )


def _retry_after(value) -> float:
    try:
        return max(float(value or 0), 0)
    except (TypeError, ValueError):
        return 0
