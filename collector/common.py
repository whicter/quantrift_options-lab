from pathlib import Path


WATCHLIST_PATH = Path(__file__).with_name('watchlist.txt')


def load_watchlist(path: Path = WATCHLIST_PATH) -> list[str]:
    """Load symbols from watchlist.txt, preserving order and removing duplicates."""
    if not path.exists():
        raise FileNotFoundError(f'Watchlist file not found: {path}')

    symbols = []
    seen = set()

    for raw_line in path.read_text(encoding='utf-8').splitlines():
        symbol = raw_line.split('#', 1)[0].strip().upper()
        if not symbol or symbol in seen:
            continue
        symbols.append(symbol)
        seen.add(symbol)

    if not symbols:
        raise ValueError(f'Watchlist file is empty: {path}')

    return symbols
