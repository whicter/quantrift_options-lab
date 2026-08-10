"""Rotate this project's PM2 logs, and notice when one starts shouting.

Deliberately scoped to LOG_DIR rather than installed as `pm2-logrotate`. That
module becomes a PM2 process that rotates every log PM2 manages, with no way to
exclude an app -- installing it would silently change log behaviour for the
ib-bot and stock-alert workloads that live in other repositories. This stays
inside one directory, needs no sudo, and its settings travel with the code in
`ecosystem.config.cjs` like every other operational parameter here.

It also does something pm2-logrotate cannot: it watches the growth RATE and
raises an operator alert when a log starts producing far more than its own
history. The failure this exists to prevent was not a full disk -- it was
`quantrift-news-error.log` reaching 683MB and 5.3M lines of ibapi protocol
chatter over ten days while nobody looked, because the noise was buried in a
file whose name implied it only held errors. Rotation alone would have capped
the size and kept the silence.

## Why copy-then-truncate, and what it costs

PM2 holds an open descriptor on each log. Renaming or deleting the file leaves
the process writing to an inode nothing can read, so the log appears to freeze --
the standard logrotate `copytruncate` problem. Copying the contents out and then
truncating in place keeps that descriptor valid, because PM2 opens logs in
append mode and picks up from the new end.

The cost is a race: anything written between the copy finishing and the truncate
landing is lost. It is bounded by the copy duration and only affects diagnostic
output, which is why it is acceptable here and would not be for anything the
product reads.
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

LOG_DIR = Path(os.getenv(
    'QUANTRIFT_LOG_DIR',
    '/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/logs',
))
MAX_BYTES = int(os.getenv('LOG_ROTATE_MAX_BYTES', str(50 * 1024 * 1024)))
KEEP = max(int(os.getenv('LOG_ROTATE_KEEP', '7')), 1)
# Growth beyond this since the previous run is reported, not rotated away. Sized
# so ordinary operation never trips it: the collector's own error log ran ~8MB/day
# before any of this, and the runaway that motivated the check ran ~68MB/day.
ALERT_BYTES_PER_HOUR = int(os.getenv('LOG_ROTATE_ALERT_BYTES_PER_HOUR', str(20 * 1024 * 1024)))
STATE_FILE = LOG_DIR / '.rotate_state.json'


def read_state() -> dict[str, Any]:
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        # A missing or corrupt state file must not stop rotation: the size cap is
        # the safety property, growth detection is the nice-to-have.
        return {}


def write_state(state: dict[str, Any]) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True))
    except OSError as exc:
        log.warning('could not persist rotate state: %s', exc)


def growth_alerts(state: dict[str, Any], now: datetime, sizes: dict[str, int]) -> list[str]:
    """Report logs growing faster than ALERT_BYTES_PER_HOUR since the last run.

    Compares against the size recorded BEFORE the previous rotation, so a file
    that was rotated in between is skipped rather than reported as having shrunk.
    """
    alerts = []
    previous = state.get('sizes', {})
    last_run = state.get('run_at')
    if not last_run:
        return alerts
    try:
        elapsed_h = (now - datetime.fromisoformat(last_run)).total_seconds() / 3600
    except ValueError:
        return alerts
    if elapsed_h <= 0:
        return alerts
    for name, size in sizes.items():
        before = previous.get(name)
        if before is None or size < before:
            continue  # new file, or rotated since -- no comparable baseline
        rate = (size - before) / elapsed_h
        if rate > ALERT_BYTES_PER_HOUR:
            alerts.append(
                f'{name}: +{(size - before) / 1024 / 1024:.1f}MB in {elapsed_h:.1f}h '
                f'({rate / 1024 / 1024:.1f}MB/h)'
            )
    return alerts


def prune(path: Path, keep: int = KEEP) -> int:
    """Keep the newest `keep` archives for one log, drop the rest."""
    archives = sorted(
        path.parent.glob(f'{path.stem}-*.log.gz'),
        key=lambda p: p.name,
        reverse=True,
    )
    removed = 0
    for old in archives[keep:]:
        try:
            old.unlink()
            removed += 1
        except OSError as exc:
            log.warning('could not remove %s: %s', old.name, exc)
    return removed


def rotate_one(path: Path, stamp: str) -> dict[str, Any] | None:
    target = path.parent / f'{path.stem}-{stamp}.log.gz'
    size = path.stat().st_size
    try:
        with open(path, 'rb') as src, gzip.open(target, 'wb') as dst:
            shutil.copyfileobj(src, dst, length=1 << 20)
    except OSError as exc:
        log.error('failed to archive %s: %s', path.name, exc)
        return None
    try:
        # Truncate in place -- see the module docstring. os.truncate keeps the
        # inode, so PM2's open descriptor stays valid.
        os.truncate(path, 0)
    except OSError as exc:
        # The archive exists but the source was not cleared. Removing the archive
        # would lose nothing, but leaving it means the next run makes a second
        # copy of the same content; report loudly and let the operator decide.
        log.error('archived %s but could not truncate it: %s', path.name, exc)
        return {'log': path.name, 'archived': target.name, 'bytes': size, 'truncated': False}
    return {'log': path.name, 'archived': target.name, 'bytes': size, 'truncated': True}


def run(max_bytes: int = MAX_BYTES, keep: int = KEEP, dry_run: bool = False) -> dict[str, Any]:
    if not LOG_DIR.is_dir():
        # The external volume being unmounted is the expected cause. Do NOT create
        # the directory: macOS would happily make it on the boot disk under a
        # mountpoint that later shadows it, which is how data silently disappears.
        log.warning('log dir %s is not present (volume unmounted?); nothing rotated', LOG_DIR)
        return {'status': 'log_dir_missing', 'dir': str(LOG_DIR), 'rotated': 0}

    now = datetime.now(timezone.utc)
    stamp = now.strftime('%Y%m%dT%H%M%SZ')
    logs = sorted(p for p in LOG_DIR.glob('*.log') if p.is_file())
    sizes = {p.name: p.stat().st_size for p in logs}

    state = read_state()
    alerts = growth_alerts(state, now, sizes)

    rotated, pruned = [], 0
    for path in logs:
        if sizes[path.name] < max_bytes:
            continue
        if dry_run:
            rotated.append({'log': path.name, 'bytes': sizes[path.name], 'dry_run': True})
            continue
        result = rotate_one(path, stamp)
        if result:
            rotated.append(result)
            pruned += prune(path, keep)

    if not dry_run:
        write_state({'run_at': now.isoformat(), 'sizes': sizes})

    if alerts:
        # Growth is reported whether or not anything rotated: a log can double its
        # rate and still sit under the size cap for days.
        body = '\n'.join(alerts)
        log.warning('log growth above threshold:\n%s', body)
        if not dry_run and os.getenv('LOG_ROTATE_ALERTS_ENABLED', 'true').lower() in ('1', 'true', 'yes'):
            try:
                from operator_alerts import send_operator_alert
                send_operator_alert('Quantrift log growth', body, 'warning')
            except Exception as exc:  # noqa: BLE001 - alerting must never break rotation
                log.warning('could not send growth alert: %s', exc)

    result = {
        'status': 'ok',
        'scanned': len(logs),
        'rotated': len(rotated),
        'pruned': pruned,
        'growth_alerts': alerts,
        'total_mb': round(sum(sizes.values()) / 1024 / 1024, 1),
        'details': rotated,
    }
    log.info('Log rotation: %s', {k: v for k, v in result.items() if k != 'details'})
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rotate this project\'s PM2 logs')
    parser.add_argument('--max-bytes', type=int, default=MAX_BYTES)
    parser.add_argument('--keep', type=int, default=KEEP)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    print(run(max_bytes=args.max_bytes, keep=args.keep, dry_run=args.dry_run))
