"""Operator CLI for the quote watchlist.

`select_quote_watchlist.py` ranks symbols by option liquidity, which is objective.
Whether you would accept assignment on a name is not, and that judgement belongs
to a person. This is how that judgement is recorded so it survives every
subsequent auto-selection.

    manage_quote_watchlist.py list
    manage_quote_watchlist.py exclude SPCX ONDS
    manage_quote_watchlist.py pin AAPL MSFT
    manage_quote_watchlist.py reset SPCX

Excluding a symbol only stops it consuming IB quote time. It stays in
`symbol_universe`, still gets a Polygon positioning chain, GEX and scanner rows --
this list governs executable quotes, nothing else.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
from typing import Any

import psycopg2

from collector_runtime import configure_collector

configure_collector(__file__, datefmt=None)
log = logging.getLogger(__name__)

# Same shape the refresh worker enforces on provider_fetch_jobs.symbol.
SYMBOL_PATTERN = re.compile(r'^[A-Z][A-Z0-9.-]{0,9}$')


def normalize(symbol: str) -> str:
    return (symbol or '').strip().upper()


def validate(symbols: list[str]) -> tuple[list[str], list[str]]:
    good, bad = [], []
    for raw in symbols:
        symbol = normalize(raw)
        (good if SYMBOL_PATTERN.match(symbol) else bad).append(symbol or raw)
    return good, bad


def connect():
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    return psycopg2.connect(database_url)


def show(conn) -> list[tuple]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, origin, pinned, excluded, liquidity_rank, liquidity_score,
                   metadata->>'name' AS name
            FROM quote_watchlist
            ORDER BY excluded ASC, pinned DESC, liquidity_rank ASC NULLS LAST, symbol ASC
            """
        )
        return cur.fetchall()


def render(rows: list[tuple]) -> None:
    if not rows:
        print('quote_watchlist is empty. Run select_quote_watchlist.py to populate it.')
        return
    active = [r for r in rows if not r[3]]
    excluded = [r for r in rows if r[3]]
    print(f"{'':>4} {'symbol':<8}{'状态':<12}{'来源':<8}{'期权OI':>12}  名称")
    for symbol, origin, pinned, _, rank, score, name in active:
        state = '置顶' if pinned else '自动入选'
        # A manually pinned symbol has never been ranked, so it has no liquidity
        # figure. Printing 0 would assert it has no open interest, which is a
        # different and false claim -- missing stays missing.
        rank_cell = f'{rank:>4}' if rank is not None else '   —'
        score_cell = f'{int(score):>12,}' if score is not None else f'{"—":>12}'
        print(f'{rank_cell} {symbol:<8}{state:<12}{origin:<8}'
              f'{score_cell}  {(name or "（未采集到名称）")[:44]}')
    if excluded:
        print(f'\n已排除（不占用 IB 报价时间，仍在 symbol_universe 中正常扫描）：')
        for symbol, origin, _, _, _, _, name in excluded:
            print(f'     {symbol:<8}{"":<12}{origin:<8}{"":>12}  {(name or "")[:44]}')
    print(f'\n生效 {len(active)} 只，已排除 {len(excluded)} 只。')


def apply_flags(conn, symbols: list[str], *, pinned: bool | None, excluded: bool | None,
                origin: str | None, dry_run: bool) -> dict[str, Any]:
    """Upsert the override. A symbol not yet in the table is inserted.

    Inserting on `exclude` matters: it records the decision before the selector
    would ever have picked the symbol, so a name that becomes liquid later is
    still kept out without anyone having to notice and re-exclude it.
    """
    if dry_run:
        return {'dry_run': True, 'would_change': symbols}
    sets, values = [], []
    if pinned is not None:
        sets.append('pinned = %s')
        values.append(pinned)
    if excluded is not None:
        sets.append('excluded = %s')
        values.append(excluded)
    if origin is not None:
        sets.append('origin = %s')
        values.append(origin)
    sets.append('updated_at = NOW()')

    changed = 0
    with conn.cursor() as cur:
        for symbol in symbols:
            cur.execute(
                f"""
                INSERT INTO quote_watchlist (symbol, origin, pinned, excluded, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (symbol) DO UPDATE SET {', '.join(sets)}
                """,
                (
                    symbol,
                    origin or ('manual' if pinned else 'auto'),
                    bool(pinned),
                    bool(excluded),
                    *values,
                ),
            )
            changed += cur.rowcount
    conn.commit()
    return {'changed': changed, 'symbols': symbols}


CONSEQUENCE = {
    'exclude': '这些标的不再占用 IB 报价时间，且每周自动重选时永不重新加入。'
               '它们仍留在 symbol_universe，照常产出定位数据与 GEX。',
    'pin': '这些标的无论流动性排名如何都会保留在清单中，自动重选不会剔除它们。',
    'reset': '清除人工标记，交还给自动选取：够格则保留，不够格会在下次重选时移出。',
}


def main() -> None:
    parser = argparse.ArgumentParser(description='Manage the option quote watchlist')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list', help='show the current watchlist')
    for name, helptext in [
        ('exclude', 'never spend IB quote time on these symbols'),
        ('pin', 'always keep these symbols, whatever their rank'),
        ('reset', 'clear manual flags and return the symbol to auto-selection'),
    ]:
        p = sub.add_parser(name, help=helptext)
        p.add_argument('symbols', nargs='+')
        p.add_argument('--dry-run', action='store_true', help='show what would change, write nothing')
    args = parser.parse_args()

    conn = connect()
    try:
        if args.command == 'list':
            render(show(conn))
            return

        symbols, invalid = validate(args.symbols)
        if invalid:
            # Fail the whole call rather than silently applying the valid half:
            # a typo'd ticker in a multi-symbol exclude would otherwise look like
            # it worked while one name kept consuming quote time.
            raise SystemExit(f'不是合法的 ticker：{", ".join(invalid)}（未做任何改动）')

        flags = {
            'exclude': dict(pinned=False, excluded=True, origin='manual'),
            'pin': dict(pinned=True, excluded=False, origin='manual'),
            'reset': dict(pinned=False, excluded=False, origin='auto'),
        }[args.command]

        result = apply_flags(conn, symbols, dry_run=args.dry_run, **flags)
        if args.dry_run:
            print(f'[dry-run] 将 {args.command}：{", ".join(symbols)}')
            print(f'          {CONSEQUENCE[args.command]}')
            print('          未写入任何内容。')
            return
        print(f'已 {args.command}：{", ".join(symbols)}（{result["changed"]} 行）')
        print(CONSEQUENCE[args.command])
        if args.command != 'reset':
            print('下次 schedule_quote_refresh.py 运行时生效。')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
