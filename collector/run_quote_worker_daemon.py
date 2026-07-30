"""Dedicated IB quote-enrichment worker.

The primary collector never claims option_quote_snapshot jobs. Keeping this
lane in its own process means an IB timeout cannot consume a Polygon/GEX worker
slot or delay the next market-wide refresh cycle.
"""

from __future__ import annotations

import logging
import os
import time

import run_refresh_worker


POLL_SECONDS = max(int(os.getenv('QUOTE_WORKER_POLL_SECONDS', '5')), 1)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)
for logger_name in ('ibapi', 'ibapi.client', 'ibapi.wrapper', 'ibapi.decoder'):
    logging.getLogger(logger_name).setLevel(logging.WARNING)


def run() -> None:
    while True:
        started_at = time.monotonic()
        try:
            run_refresh_worker.run(
                queue_lane='quotes',
                batch_size=run_refresh_worker.QUOTE_WORKER_BATCH_SIZE,
                concurrency=run_refresh_worker.QUOTE_WORKER_CONCURRENCY,
            )
        except Exception:
            log.exception('quote enrichment worker cycle failed')
        elapsed = time.monotonic() - started_at
        time.sleep(max(POLL_SECONDS - elapsed, 1))


if __name__ == '__main__':
    run()
