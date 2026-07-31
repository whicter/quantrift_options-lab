"""One-shot Railway cron entrypoint for option refresh scheduling and queue work."""

from __future__ import annotations

import logging

from collector_runtime import configure_logging
import materialize_scan
import materialize_scanner_candidates
import run_refresh_worker
import schedule_option_refresh


configure_logging()
log = logging.getLogger(__name__)


def run() -> None:
    log.info('=== Railway option refresh cycle starting ===')
    scheduled = schedule_option_refresh.run()
    log.info('Scheduled refresh work: %s', scheduled)
    run_refresh_worker.run()
    materialize_scan.run()
    try:
        materialize_scanner_candidates.run()
    except Exception:
        log.exception('scanner candidate materialization failed')
    log.info('=== Railway option refresh cycle complete ===')


if __name__ == '__main__':
    run()
