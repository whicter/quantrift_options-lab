from __future__ import annotations

import logging
import os
import time

import materialize_scan
import reconcile_gex_models
import run_refresh_worker
import schedule_option_refresh
import check_collector_health
import derive_volatility
import evaluate_scanner_alerts
import send_heartbeat


POLL_SECONDS = max(int(os.getenv('COLLECTOR_POLL_SECONDS', '60')), 5)
SCAN_SECONDS = max(int(os.getenv('SCAN_MATERIALIZE_SECONDS', '300')), POLL_SECONDS)
OPTION_REFRESH_SECONDS = max(int(os.getenv('OPTION_REFRESH_SCHEDULE_SECONDS', '300')), POLL_SECONDS)
AUTO_OPTION_REFRESH = os.getenv('OPTION_AUTO_REFRESH', 'false').strip().lower() in ('1', 'true', 'yes')
HEALTH_CHECK_ENABLED = os.getenv('COLLECTOR_HEALTH_CHECK_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')
HEALTH_CHECK_SECONDS = max(int(os.getenv('COLLECTOR_HEALTH_CHECK_SECONDS', '300')), POLL_SECONDS)
DERIVED_VOLATILITY_ENABLED = os.getenv('DERIVED_VOLATILITY_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')
DERIVED_VOLATILITY_SECONDS = max(int(os.getenv('DERIVED_VOLATILITY_SECONDS', '3600')), POLL_SECONDS)
HEARTBEAT_SECONDS = max(int(os.getenv('HEARTBEAT_SECONDS', '60')), POLL_SECONDS)
GEX_MODEL_RECONCILE_ENABLED = os.getenv('GEX_MODEL_RECONCILE_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')
GEX_MODEL_RECONCILE_SECONDS = max(int(os.getenv('GEX_MODEL_RECONCILE_SECONDS', '3600')), POLL_SECONDS)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)
for logger_name in ('ibapi', 'ibapi.client', 'ibapi.wrapper', 'ibapi.decoder'):
    logging.getLogger(logger_name).setLevel(logging.WARNING)


def run() -> None:
    next_scan_at = 0.0
    next_option_refresh_at = 0.0
    next_health_check_at = 0.0
    next_derived_volatility_at = 0.0
    next_heartbeat_at = 0.0
    next_gex_reconcile_at = 0.0
    while True:
        started_at = time.monotonic()
        if GEX_MODEL_RECONCILE_ENABLED and started_at >= next_gex_reconcile_at:
            try:
                reconcile_gex_models.run()
            except Exception:
                log.exception('GEX model reconciliation cycle failed')
            next_gex_reconcile_at = started_at + GEX_MODEL_RECONCILE_SECONDS

        if AUTO_OPTION_REFRESH and started_at >= next_option_refresh_at:
            try:
                schedule_option_refresh.run()
            except Exception:
                log.exception('option refresh scheduling cycle failed')
            next_option_refresh_at = started_at + OPTION_REFRESH_SECONDS

        try:
            run_refresh_worker.run()
        except Exception:
            log.exception('refresh worker cycle failed')

        if started_at >= next_scan_at:
            try:
                materialize_scan.run()
                evaluate_scanner_alerts.run()
            except Exception:
                log.exception('scanner materialization cycle failed')
            next_scan_at = started_at + SCAN_SECONDS

        if HEALTH_CHECK_ENABLED and started_at >= next_health_check_at:
            try:
                check_collector_health.run()
            except Exception:
                log.exception('collector health check cycle failed')
            next_health_check_at = started_at + HEALTH_CHECK_SECONDS

        if DERIVED_VOLATILITY_ENABLED and started_at >= next_derived_volatility_at:
            try:
                derive_volatility.run(backfill=False)
            except Exception:
                log.exception('derived volatility cycle failed')
            next_derived_volatility_at = started_at + DERIVED_VOLATILITY_SECONDS

        if started_at >= next_heartbeat_at:
            try:
                send_heartbeat.run()
            except Exception:
                log.exception('collector heartbeat failed')
            next_heartbeat_at = started_at + HEARTBEAT_SECONDS

        elapsed = time.monotonic() - started_at
        time.sleep(max(POLL_SECONDS - elapsed, 1))


if __name__ == '__main__':
    run()
