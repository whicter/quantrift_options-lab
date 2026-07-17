"""One-shot Railway cron entrypoint for option refresh scheduling and queue work."""

from __future__ import annotations

import logging

import materialize_scan
import run_refresh_worker
import schedule_option_refresh


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)


def run() -> None:
    log.info('=== Railway option refresh cycle starting ===')
    scheduled = schedule_option_refresh.run()
    log.info('Scheduled refresh work: %s', scheduled)
    run_refresh_worker.run()
    materialize_scan.run()
    log.info('=== Railway option refresh cycle complete ===')


if __name__ == '__main__':
    run()
