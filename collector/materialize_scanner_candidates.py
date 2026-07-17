"""Materialize scanner candidate batches by invoking the JS candidate engine.

The candidate enumeration/scoring/economics is a single source of truth in
``server/src/domain/scanner/candidateEngine.cjs`` (and the batch writer in
``server/src/jobs/materializeScannerCandidates.js``). This wrapper shells out to
node rather than re-implementing that logic in Python, which would silently drift
from the API's own candidate output.

Runs after ``materialize_scan`` in the collector cycle: candidates read the just
materialized ``scanner_results_snapshots`` plus each symbol's latest usable option
chain, and write ``scanner_candidate_batches`` / ``scanner_candidate_snapshots``.

Degrades safely: if node is unavailable (e.g. the Railway python-slim cron image),
the script is missing, or ``DATABASE_URL`` is unset, it logs a warning and returns
without failing the surrounding cycle. The Mac Studio daemon has node and is the
active runtime that produces batches.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

log = logging.getLogger(__name__)

NODE_SCRIPT = (
    Path(__file__).resolve().parent.parent
    / 'server' / 'src' / 'jobs' / 'materializeScannerCandidates.js'
)


def _enabled() -> bool:
    return os.getenv('SCANNER_CANDIDATE_MATERIALIZE_ENABLED', 'true').strip().lower() in ('1', 'true', 'yes')


def _timeout_seconds() -> int:
    return max(int(os.getenv('SCANNER_CANDIDATE_MATERIALIZE_TIMEOUT', '180')), 30)


def run(scan_key: str | None = None) -> None:
    if not _enabled():
        log.info('Scanner candidate materialization disabled; skipping')
        return

    key = scan_key or os.getenv('SCAN_KEY', 'watchlist_v1')

    node = shutil.which('node')
    if not node:
        log.warning('node not found on PATH; skipping scanner candidate materialization')
        return
    if not NODE_SCRIPT.exists():
        log.warning('Candidate materializer missing at %s; skipping', NODE_SCRIPT)
        return
    if not os.getenv('DATABASE_URL'):
        log.warning('DATABASE_URL not set; skipping scanner candidate materialization')
        return

    try:
        result = subprocess.run(
            [node, str(NODE_SCRIPT), key],
            cwd=str(NODE_SCRIPT.parents[2]),  # server/
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            timeout=_timeout_seconds(),
            check=False,
        )
    except subprocess.TimeoutExpired:
        log.warning('Scanner candidate materialization timed out after %ss', _timeout_seconds())
        return

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip()
        log.warning('Scanner candidate materialization failed (rc=%s): %s', result.returncode, detail[:500])
        return

    stdout = (result.stdout or '').strip()
    last_line = stdout.splitlines()[-1] if stdout else ''
    log.info('Scanner candidate materialization: %s', last_line)


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )
    run()
