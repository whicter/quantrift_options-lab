"""Choose the bounded set of symbols that get executable option quotes.

The positioning plane covers the whole `symbol_universe` from Polygon, but that
tier serves no NBBO, so bid/ask exists only where an `ib_internal`
`option_quote_snapshot` has run. IB is serial by construction (one fixed client
id, one open `reqMktData` at a time), which puts a hard ceiling on how many
symbols can be quoted per sweep. This picks which ones.

Selection is deliberately a filter plus a single sort key, not a weighted score.
The repo already carries one set of hand-tuned, never-backtested scoring weights;
adding a second here -- to decide which symbols even become visible -- would put
an unvalidated judgement upstream of every downstream measurement. Thresholds
are inspectable and arguable; a composite score is neither.

Operator overrides always win: `pinned` rows survive any rank, `excluded` rows
are never re-added, and `origin='manual'` rows are never rewritten.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
from typing import Any

import psycopg2
from psycopg2.extras import Json

from collector_runtime import configure_collector

configure_collector(__file__)
log = logging.getLogger(__name__)

TARGET = max(int(os.getenv('QUOTE_WATCHLIST_TARGET', '50')), 1)
# Option open interest is the direct measure of whether a contract can be traded
# at all, and it is the best-populated liquidity field we have (299/327 rows).
MIN_TOTAL_OI = int(os.getenv('QUOTE_WATCHLIST_MIN_TOTAL_OI', '5000'))
# Underlying dollar volume is a separate requirement, not a tiebreaker: a
# cash-secured put is a commitment to own the shares, so a liquid option on an
# illiquid underlying is a trap rather than an opportunity.
MIN_DOLLAR_VOLUME = int(os.getenv('QUOTE_WATCHLIST_MIN_DOLLAR_VOLUME', '50000000'))

# Leveraged and inverse products are structurally unsuitable for a strategy whose
# premise is willingness to hold the underlying: they reset daily and decay, so
# assignment hands you something nobody intends to keep. Matched on name because
# no provider field marks them, and scoped to ETFs because the same words appear
# innocently in company names -- 'Build-A-Bear Workshop' matches /bear/ and is an
# ordinary stock. Names that slip through can be excluded by hand; that override
# is permanent.
LEVERAGED_NAME_PATTERN = re.compile(
    r'\b(?:[23](?:\.\d+)?x|ultra|ultrashort|ultrapro|inverse|bear|bull\s+[23]x|leveraged|-1x)\b',
    re.IGNORECASE,
)

CANDIDATE_SQL = """
    SELECT r.symbol,
           r.total_oi,
           r.underlying_dollar_volume,
           r.asset_type,
           u.name
    FROM scanner_results_snapshots r
    JOIN symbol_universe u ON u.symbol = r.symbol
    WHERE r.snapshot_ts = (SELECT MAX(snapshot_ts) FROM scanner_results_snapshots)
      AND u.active AND u.scan_enabled
      AND r.optionable
      AND r.total_oi IS NOT NULL
      AND r.underlying_dollar_volume IS NOT NULL
"""
# Deliberately no ORDER BY. rank_candidates sorts, because the ranking key is a
# decision this module owns and a caller reading the SQL should not be able to
# change it by accident. It was `ORDER BY underlying_dollar_volume DESC` while
# rank_candidates recorded total_oi as the score and trusted the incoming order:
# the list was therefore chosen by share turnover and labelled by option open
# interest. SNDK led the selection on $34B of stock volume against 4,805 option
# contracts outstanding -- the least relevant available measure picking who gets
# scarce IB quote time.


def is_leveraged(asset_type: str | None, name: str | None) -> bool:
    if (asset_type or '').lower() != 'etf':
        return False
    return bool(LEVERAGED_NAME_PATTERN.search(name or ''))


def rank_candidates(rows: list[tuple], target: int = TARGET) -> tuple[list[dict], dict[str, int]]:
    """Filter and rank. Returns (selected, rejection counts by reason)."""
    rejected: dict[str, int] = {}

    def reject(reason: str) -> None:
        rejected[reason] = rejected.get(reason, 0) + 1

    selected: list[dict] = []
    for symbol, total_oi, dollar_volume, asset_type, name in rows:
        if total_oi is None or int(total_oi) < MIN_TOTAL_OI:
            reject('option_oi_below_floor')
            continue
        if dollar_volume is None or float(dollar_volume) < MIN_DOLLAR_VOLUME:
            reject('underlying_dollar_volume_below_floor')
            continue
        if is_leveraged(asset_type, name):
            reject('leveraged_or_inverse')
            continue
        selected.append({
            'symbol': symbol,
            # Scored on underlying dollar volume, NOT total_oi. total_oi is
            # summed over the stored chain, which OPTION_MAX_CONTRACTS=120 and
            # OPTION_MAX_STRIKES_PER_SIDE=6 cap at roughly +-5% of spot -- so it
            # measures our storage window, not the market. The distortion is
            # systematic rather than noisy: a high-priced name spreads its OI
            # across wide strike spacing and lands mostly outside that window,
            # while a low-priced dense-strike ETF packs its OI inside it.
            # Measured 2026-08-13 against the wide oi_by_strike map, which is
            # not capped: META 41,482 stored against 847,623 real (20.4x), AMD
            # 52,453 against 749,994 (14.3x), TSLA 110,815 against 1,281,359.
            # Ranking on that put TSLA 54th, AMD 91st and META 107th -- three of
            # the most actively traded option names in the market, excluded in
            # favour of symbols with a tenth of their turnover. Dollar volume
            # comes from price data and no storage cap can distort it.
            # MIN_TOTAL_OI still gates option liquidity; this only orders.
            'liquidity_score': int(dollar_volume),
            'asset_type': asset_type,
            'name': name,
        })

    # Sort here rather than relying on the query's ORDER BY. The ranking key is a
    # decision this module owns and documents immediately above; leaving it in
    # SQL meant the key and the recorded score could drift apart silently, which
    # is exactly what happened once already.
    selected.sort(key=lambda item: item['liquidity_score'], reverse=True)

    overflow = max(len(selected) - target, 0)
    if overflow:
        # Never drop silently: a bounded list that does not say what it bounded
        # away reads as "this is everything that qualified".
        reject('over_target')
        rejected['over_target'] = overflow
    selected = selected[:target]
    for index, item in enumerate(selected, start=1):
        item['liquidity_rank'] = index
    return selected, rejected


def apply_selection(conn, selected: list[dict]) -> dict[str, int]:
    symbols = [item['symbol'] for item in selected]
    with conn.cursor() as cur:
        # Excluded symbols are never re-added, whatever their rank.
        cur.execute('SELECT symbol FROM quote_watchlist WHERE excluded')
        excluded = {row[0] for row in cur.fetchall()}
        keep = [item for item in selected if item['symbol'] not in excluded]

        for item in keep:
            cur.execute(
                """
                INSERT INTO quote_watchlist
                  (symbol, origin, liquidity_rank, liquidity_score, selected_at, metadata, updated_at)
                VALUES (%s, 'auto', %s, %s, NOW(), %s::jsonb, NOW())
                ON CONFLICT (symbol) DO UPDATE SET
                  liquidity_rank  = EXCLUDED.liquidity_rank,
                  liquidity_score = EXCLUDED.liquidity_score,
                  selected_at     = EXCLUDED.selected_at,
                  metadata        = EXCLUDED.metadata,
                  updated_at      = NOW()
                -- A manual row keeps its origin and is never demoted to 'auto';
                -- only its freshness metadata is refreshed.
                """,
                (
                    item['symbol'],
                    item['liquidity_rank'],
                    item['liquidity_score'],
                    Json({'asset_type': item['asset_type'], 'name': item['name']}),
                ),
            )

        # Auto rows that fell out of the target are removed. Manual, pinned and
        # excluded rows survive -- those encode a human decision.
        cur.execute(
            """
            DELETE FROM quote_watchlist
            WHERE origin = 'auto' AND NOT pinned AND NOT excluded
              AND NOT (symbol = ANY(%s))
            """,
            (symbols,),
        )
        dropped = cur.rowcount
    conn.commit()
    return {'upserted': len(keep), 'dropped': dropped, 'skipped_excluded': len(selected) - len(keep)}


def effective_watchlist(conn) -> list[str]:
    """The list the sweep actually quotes: pinned first, then by liquidity rank."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol FROM quote_watchlist
            WHERE NOT excluded
            ORDER BY pinned DESC, liquidity_rank ASC NULLS LAST, symbol ASC
            """
        )
        return [row[0] for row in cur.fetchall()]


def run(target: int = TARGET) -> dict[str, Any]:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(CANDIDATE_SQL)
            rows = cur.fetchall()
        selected, rejected = rank_candidates(rows, target=target)
        applied = apply_selection(conn, selected)
        effective = effective_watchlist(conn)
    finally:
        conn.close()

    result = {
        'considered': len(rows),
        'selected': len(selected),
        'effective': len(effective),
        'rejected': rejected,
        **applied,
    }
    log.info('Quote watchlist selection: %s', result)
    if rejected.get('over_target'):
        log.info(
            '%s symbols qualified beyond the target of %s and were not selected',
            rejected['over_target'], target,
        )
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Select the option quote watchlist')
    parser.add_argument('--target', type=int, default=TARGET)
    parser.add_argument('--dry-run', action='store_true', help='rank and report without writing')
    args = parser.parse_args()

    if args.dry_run:
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        try:
            with conn.cursor() as cur:
                cur.execute(CANDIDATE_SQL)
                rows = cur.fetchall()
        finally:
            conn.close()
        picked, why = rank_candidates(rows, target=args.target)
        print(f'considered={len(rows)} selected={len(picked)} rejected={why}')
        for item in picked:
            print(f"  {item['liquidity_rank']:>3}. {item['symbol']:<7}"
                  f" $vol={item['liquidity_score']:>15,}  {item['asset_type'] or '-':<6}"
                  f" {(item['name'] or '')[:48]}")
    else:
        print(run(target=args.target))
