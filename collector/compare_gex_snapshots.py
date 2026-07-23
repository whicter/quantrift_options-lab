"""Read-only replay comparison for persisted ETF and single-stock GEX snapshots."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv

import compute_gex

load_dotenv(Path(__file__).with_name('.env'))


def load_snapshot(conn, symbol: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.*, g.global_gex AS stored_global_gex, g.local_gamma AS stored_local_gamma,
              g.gamma_flip AS stored_gamma_flip, g.call_wall AS stored_call_wall,
              g.put_wall AS stored_put_wall, g.max_pain AS stored_max_pain,
              g.raw_metrics AS stored_raw_metrics
            FROM gex_snapshots g
            JOIN option_chain_snapshots c ON c.id = g.snapshot_id
            WHERE g.symbol = %s AND g.raw_metrics->>'model_version' = %s
            ORDER BY g.snapshot_ts DESC
            LIMIT 1
            """,
            (symbol, compute_gex.GEX_MODEL_VERSION),
        )
        row = cur.fetchone()
        if not row:
            return None
        return dict(zip([column[0] for column in cur.description], row))


def compare_symbol(conn, symbol: str, tolerance: float) -> dict[str, Any]:
    snapshot = load_snapshot(conn, symbol)
    if not snapshot:
        return {'symbol': symbol, 'status': 'missing_snapshot'}
    contracts = compute_gex.load_contracts(conn, snapshot['id'])
    recomputed = compute_gex.compute_for_snapshot(snapshot, contracts)
    fields = ('global_gex', 'local_gamma', 'gamma_flip', 'call_wall', 'put_wall', 'max_pain')
    differences = {}
    for field in fields:
        stored = snapshot[f'stored_{field}']
        current = recomputed[field]
        if stored is None or current is None:
            matches = stored == current
        else:
            matches = abs(float(stored) - float(current)) <= tolerance
        differences[field] = {'stored': stored, 'recomputed': current, 'matches': matches}
    return {
        'symbol': symbol,
        'status': 'compared',
        'snapshot_id': snapshot['id'],
        'snapshot_ts': snapshot['snapshot_ts'].isoformat(),
        'contract_count_used': len(contracts),
        'missing_greeks_ratio': snapshot['missing_greeks_ratio'],
        'missing_oi_ratio': snapshot['missing_oi_ratio'],
        'model_version': recomputed['raw_metrics']['model_version'],
        'matches': all(item['matches'] for item in differences.values()),
        'fields': differences,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', default='SPY,AAPL', help='one ETF and one single-stock symbol')
    parser.add_argument('--tolerance', type=float, default=0.0001)
    parser.add_argument('--output', help='optional JSON report path')
    args = parser.parse_args()
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise SystemExit('DATABASE_URL is required')
    symbols = [symbol.strip().upper() for symbol in args.symbols.split(',') if symbol.strip()]
    if len(symbols) < 2:
        raise SystemExit('provide at least one ETF and one single-stock symbol')
    with psycopg2.connect(database_url) as conn:
        report = {
            'model_version': compute_gex.GEX_MODEL_VERSION,
            'comparison': [compare_symbol(conn, symbol, args.tolerance) for symbol in symbols],
        }
    rendered = json.dumps(report, indent=2, default=str)
    if args.output:
        Path(args.output).write_text(rendered + '\n', encoding='utf-8')
    print(rendered)


if __name__ == '__main__':
    main()
