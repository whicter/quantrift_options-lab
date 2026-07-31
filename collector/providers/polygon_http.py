from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .polygon_rate_limit import PolygonStockRequestPacer


class PolygonHttpClient:
    """Shared authenticated Polygon GET transport.

    Provider adapters own endpoint parameters and payload parsing. This client
    owns the cross-provider transport contract: credentials, timeout, bounded
    5xx retries, shared request pacing, and coordinated 429 backoff.
    """

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        required_for: str,
        backoff_env: str = 'POLYGON_PRICE_RATE_LIMIT_BACKOFF',
        retries_env: str = 'POLYGON_PRICE_RATE_LIMIT_RETRIES',
        default_backoff: float = 60,
        default_retries: int = 5,
        mount_retries: bool = False,
    ) -> None:
        self.api_key = os.getenv('POLYGON_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError(f'POLYGON_API_KEY is required for {required_for}')
        self.base_url = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io').rstrip('/')
        self.timeout = float(os.getenv('POLYGON_TIMEOUT', '30'))
        self.backoff = max(float(os.getenv(backoff_env, str(default_backoff))), 0)
        self.max_retries = max(int(os.getenv(retries_env, str(default_retries))), 0)
        self.pacer = PolygonStockRequestPacer()
        self.session = session or requests.Session()
        self.session.headers['Authorization'] = f'Bearer {self.api_key}'
        if session is None or mount_retries:
            retry = Retry(
                total=3,
                backoff_factor=0.5,
                status_forcelist=(500, 502, 503, 504),
                allowed_methods=frozenset({'GET'}),
                respect_retry_after_header=True,
            )
            if hasattr(self.session, 'mount'):
                self.session.mount('https://', HTTPAdapter(max_retries=retry))

    def get_json(
        self,
        path_or_url: str,
        *,
        params: dict[str, Any] | None = None,
        context: str = 'Polygon request',
        missing_http_statuses: Iterable[int] = (),
        missing_payload_statuses: Iterable[str] = (),
    ) -> dict[str, Any] | None:
        url = path_or_url if path_or_url.startswith(('http://', 'https://')) else f'{self.base_url}{path_or_url}'
        missing_http = set(missing_http_statuses)
        missing_payload = set(missing_payload_statuses)
        response = None

        for attempt in range(self.max_retries + 1):
            self.pacer.wait()
            request_kwargs: dict[str, Any] = {'timeout': self.timeout}
            if params is not None:
                request_kwargs['params'] = params
            response = self.session.get(url, **request_kwargs)
            status_code = getattr(response, 'status_code', 200)
            if status_code in missing_http:
                return None
            if status_code != 429:
                response.raise_for_status()
                break
            if attempt >= self.max_retries:
                response.raise_for_status()
            retry_after = retry_after_seconds(
                getattr(response, 'headers', {}).get('Retry-After'),
            )
            self.pacer.penalize(retry_after or self.backoff)

        if response is None:
            raise RuntimeError(f'{context} did not run')
        payload = response.json()
        provider_status = payload.get('status')
        if provider_status in missing_payload:
            return None
        if provider_status not in (None, 'OK', 'DELAYED'):
            raise RuntimeError(f'{context} failed: {provider_status}')
        return payload


def retry_after_seconds(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        return max(float(value), 0)
    except (TypeError, ValueError):
        return None
