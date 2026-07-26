from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True)
class NewsItem:
    symbol: str
    published_at: datetime
    provider_code: str
    article_id: str
    headline: str
    source: str


def _ib_contract_symbol(symbol: str) -> str:
    """Map display/DB ticker to IB's stock contract symbol where needed."""
    return symbol.upper().replace('.', ' ')


class IBNewsProvider:
    """Batch fetch of recent per-symbol news headlines via IB Gateway.

    Uses the live `reqMktData` + genericTick 292 (`tickNews`) subscription,
    NOT `reqHistoricalNews`. Live-tested 2026-07-26 (see
    docs/validation/NEWS_SOURCE_SELECTION_2026-07-26.md): reqHistoricalNews
    reads from a cache with no documented refresh SLA and was observed
    returning a "newest" article several days stale, inconsistently, across
    identical back-to-back queries. tickNews instead pushes whatever is in
    each provider's live feed at subscribe time (real-world observed lag: tens
    of minutes, not days) plus anything published during the listen window.

    reqMktData subscriptions are capped at IB's market-data-line limit
    (100/account by default), so symbols are subscribed in batches, each held
    open for `listen_seconds` to catch the initial burst, then cancelled
    before the next batch -- unlike IBPriceProvider (per-call connect) or the
    old historical-news draft (sequential per-symbol request/wait), this
    parallelizes within a batch instead of paying a round trip per symbol.
    """

    source = 'ib_internal'

    def __init__(self, host=None, port=None, client_id=None, timeout=None):
        self.host = host or os.getenv('IB_HOST', '127.0.0.1')
        self.port = int(port or os.getenv('IB_PORT', '4001'))
        self.client_id = int(client_id or os.getenv('IB_NEWS_CLIENT_ID', '55'))
        self.timeout = int(timeout or os.getenv('IB_TIMEOUT', '30'))
        # How long to hold each batch's subscriptions open to catch the
        # initial tickNews burst (observed: arrives within ~1-2s of
        # subscribing, but held longer to also catch live-breaking items).
        self.listen_seconds = float(os.getenv('IB_NEWS_LISTEN_SECONDS', '20'))
        # Default IB market-data-line cap is 100; batch below that with
        # headroom for other concurrent subscriptions on the same account.
        self.batch_size = int(os.getenv('IB_NEWS_BATCH_SIZE', '80'))

    def fetch_recent_news(self, symbols: list[str], hours: int = 24) -> list[NewsItem]:
        """Best-effort: a symbol that never ticks within the listen window
        (no recent news, or an unresolvable contract) simply contributes no
        items -- never aborts the batch."""
        try:
            from ibapi.client import EClient
            from ibapi.contract import Contract
            from ibapi.wrapper import EWrapper
        except ImportError as exc:
            raise RuntimeError('ibapi is not installed.') from exc

        provider = self

        class App(EWrapper, EClient):
            def __init__(self):
                EClient.__init__(self, self)
                self.ready = threading.Event()
                self.ticks: list[tuple] = []  # (reqId, timeStamp_ms, providerCode, articleId, headline)

            def nextValidId(self, orderId):  # noqa: N802
                self.ready.set()

            def tickNews(self, tickerId, timeStamp, providerCode, articleId, headline, extraData):  # noqa: N802
                self.ticks.append((tickerId, timeStamp, providerCode, articleId, headline))

            def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=''):  # noqa: N802
                if errorCode in (2104, 2106, 2158, 2107):
                    return
                # Other errors (e.g. no entitlement, bad symbol) are silently
                # tolerated here -- that reqId's contribution is just empty,
                # matching the best-effort-per-symbol contract above.

        app = App()
        app.connect(self.host, self.port, self.client_id)
        thread = threading.Thread(target=app.run, daemon=True)
        thread.start()

        if not app.ready.wait(self.timeout):
            app.disconnect()
            raise TimeoutError(f'IB connection timed out: {self.host}:{self.port}')

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        reqid_to_symbol: dict[int, str] = {}

        for batch_start in range(0, len(symbols), self.batch_size):
            batch = symbols[batch_start:batch_start + self.batch_size]
            batch_reqids = []
            for offset, symbol in enumerate(batch):
                reqid = batch_start + offset
                reqid_to_symbol[reqid] = symbol.upper()
                batch_reqids.append(reqid)

                contract = Contract()
                contract.symbol = _ib_contract_symbol(symbol)
                contract.secType = 'STK'
                contract.exchange = 'SMART'
                contract.currency = 'USD'
                app.reqMktData(reqid, contract, 'mdoff,292', False, False, [])

            time.sleep(self.listen_seconds)

            for reqid in batch_reqids:
                app.cancelMktData(reqid)

        items: list[NewsItem] = []
        for reqid, time_ms, provider_code, article_id, headline in app.ticks:
            symbol = reqid_to_symbol.get(reqid)
            if symbol is None or not time_ms:
                continue
            published_at = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc)
            if published_at < cutoff:
                continue
            items.append(NewsItem(
                symbol=symbol, published_at=published_at, provider_code=provider_code,
                article_id=article_id, headline=headline, source=provider.source,
            ))

        app.disconnect()
        return items
