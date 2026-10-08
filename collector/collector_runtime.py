import logging
from pathlib import Path

from dotenv import load_dotenv


LOG_FORMAT = '%(asctime)s %(levelname)s %(message)s'
LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


def load_collector_env(module_file: str) -> None:
    load_dotenv(Path(module_file).with_name('.env'))


def configure_logging(*, datefmt: str | None = LOG_DATE_FORMAT) -> None:
    options = {'level': logging.INFO, 'format': LOG_FORMAT}
    if datefmt is not None:
        options['datefmt'] = datefmt
    logging.basicConfig(**options)


def configure_collector(module_file: str, *, datefmt: str | None = LOG_DATE_FORMAT) -> None:
    """Load the collector-local environment and install the shared log format."""
    load_collector_env(module_file)
    configure_logging(datefmt=datefmt)


def parse_symbols(raw_symbols: str | None) -> list[str]:
    """Normalize a comma-separated symbol override, preserving input order."""
    if not raw_symbols:
        return []
    symbols: list[str] = []
    seen: set[str] = set()
    for part in raw_symbols.split(','):
        symbol = part.strip().upper()
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def acquire_single_instance_lock(name: str, database_url: str | None = None):
    """Hold a PostgreSQL session lock for `name`, or return None if someone else has it.

    PM2 fires a cron app twice in the same second a few percent of the time
    (measured 2026-10-05 on quantrift-quote-refresh: 0-3 of 36 daily launches;
    seen again 2026-10-07 on quantrift-log-rotate and quantrift-news). The two
    copies are independent processes, so every in-process guard misses them and
    every check-then-act in SQL races:

      * the quote sweep's `NOT EXISTS` pre-check passed in both transactions and
        queued each symbol twice -- 8 jobs for 4 symbols, on a worker with
        concurrency 1;
      * log rotation sampled its own sibling's bytes over a ~0s interval and
        reported 170.8MB/h against a 60.6MB directory;
      * news re-fetched the whole universe from IB for nothing (idempotent on
        write, so merely wasteful).

    Fixing each symptom separately leaves the next one to be found in
    production. One process per script is the property actually wanted, and the
    database is the only thing both copies share. `pg_try_advisory_lock` is
    non-blocking, so the loser exits immediately rather than queueing up behind
    a run that is already doing its work.

    Returns the connection holding the lock -- the caller must keep it alive for
    the run, because a session lock dies with its session. Returns None when the
    lock is held elsewhere. Returns a sentinel-free None ALSO when no database
    is configured: a script that cannot reach PostgreSQL must still run, since
    refusing to work is worse than occasionally doing the work twice.
    """
    import os
    import psycopg2

    url = database_url or os.getenv('DATABASE_URL', '').strip()
    if not url:
        logging.getLogger(__name__).warning(
            'no DATABASE_URL; running %s without the single-instance lock', name)
        return False  # distinct from None: "not locked" rather than "lost the race"

    conn = psycopg2.connect(url)
    with conn.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(hashtext(%s))', (name,))
        acquired = cur.fetchone()[0]
    if not acquired:
        conn.close()
        return None
    return conn


def exit_if_already_running(name: str):
    """Guard for a cron script's entry point. Returns the lock holder to keep alive.

    Exits 0, not non-zero: a duplicate launch that declines to run is the
    correct outcome, and reporting it as a failure would train the operator to
    ignore this app's exit status.
    """
    import sys

    lock = acquire_single_instance_lock(name)
    if lock is None:
        logging.getLogger(__name__).info(
            '%s is already running (duplicate launch); exiting without doing the work', name)
        sys.exit(0)
    return lock
