"""Run the PM2 drift check and route its findings to the operator alert path.

`check_pm2_env_drift.cjs` has existed since 2026-08-20 and has never alerted
anybody, because nothing ran it. Both PM2 incidents since were found by hand:

  * 2026-09-23, trigger drift -- the daemon restarted and 13 of 14 quantrift
    cron apps never fired again while `pm2 list` showed them healthy. That day's
    price collection never started and a session of daily bars was lost.
  * 2026-09-23, instance drift -- the same restart orphaned three long-running
    collectors (PPID 1), which `pm2 delete` cannot reach, so re-registering
    started a second copy of each. Two collectors and two quote workers ran
    against one database for about five hours.

Neither is visible in anything the collector already watches: both failure modes
look *correct* from inside PM2. A checker nobody runs is not coverage, so this
wrapper gives it a schedule and a delivery channel.

Deliberately a thin wrapper rather than a port. The checks belong next to the
ecosystem file they compare against, and duplicating cron parsing in Python
would give two implementations to keep honest.

CLI: python check_pm2_drift_alert.py [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import subprocess
from pathlib import Path

from collector_runtime import configure_logging, load_collector_env, exit_if_already_running
from operator_alerts import send_operator_alert

load_collector_env(__file__)

log = logging.getLogger(__name__)

CHECKER = Path(__file__).with_name('check_pm2_env_drift.cjs')
# Long enough for `pm2 jlist` plus a full `ps` on a busy host, short enough that
# a wedged check does not silently become the thing that fails to report.
TIMEOUT_SECONDS = 120


def run_checker() -> tuple[int, str]:
    result = subprocess.run(
        ['node', str(CHECKER)],
        capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
    )
    return result.returncode, (result.stdout or '') + (result.stderr or '')


def run(dry_run: bool = False) -> dict:
    try:
        code, output = run_checker()
    except Exception as exc:  # noqa: BLE001 - the watchdog must not be the thing that dies quietly
        log.error('pm2 drift check could not run: %s', exc)
        if not dry_run:
            send_operator_alert(
                'PM2 漂移检查无法运行',
                f'{CHECKER.name} 执行失败：{exc}\n\n'
                '这不是"没有漂移"，是**没有检查**——两次 PM2 事故都发生在无人观察的时候。',
                severity='warning',
            )
        return {'status': 'check_failed', 'error': str(exc)}

    # Exit 2 is "cannot read pm2/ps" -- also a failure to observe, not a clean bill.
    if code == 0:
        log.info('pm2 drift: none')
        return {'status': 'ok', 'output': output}

    log.warning('pm2 drift detected:\n%s', output)
    if not dry_run:
        send_operator_alert(
            'PM2 配置/触发漂移',
            output.strip() + '\n\n'
            '注意：孤儿进程不在 PM2 进程表里，`pm2 delete` 碰不到它，\n'
            '重新注册会在它旁边再起一份。必须按 pid 杀掉后再复查。',
            severity='critical',
        )
    return {'status': 'drift', 'exit_code': code, 'output': output}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='report without alerting')
    args = parser.parse_args()
    configure_logging()
    summary = run(dry_run=args.dry_run)
    log.info('pm2 drift alert: %s', summary['status'])


if __name__ == '__main__':
    _lock = exit_if_already_running('pm2-drift')
    main()
