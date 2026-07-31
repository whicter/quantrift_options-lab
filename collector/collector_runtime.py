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
