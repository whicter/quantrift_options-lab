"""
Compute GEX / Wall / Gamma Flip snapshots from persisted option-chain snapshots.

Phase 3D-3 path:
  option_chain_snapshots + option_contract_snapshots -> gex_snapshots

This job reads cached provider data only. It does not call IB, tastytrade, or
any market-data provider directly.
"""

from __future__ import annotations

import json
import logging
import math
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json, execute_values

load_dotenv(Path(__file__).with_name('.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
DEFAULT_SYMBOLS = 'AAPL,SPY,QQQ,PLTR'
CONTRACT_MULTIPLIER = int(os.getenv('OPTION_CONTRACT_MULTIPLIER', '100'))
LOCAL_GAMMA_WINDOW_PCT = float(os.getenv('GEX_LOCAL_GAMMA_WINDOW_PCT', '1'))
GAMMA_FLIP_GRID_PCT = float(os.getenv('GEX_GAMMA_FLIP_GRID_PCT', '10'))
GAMMA_FLIP_GRID_STEPS = int(os.getenv('GEX_GAMMA_FLIP_GRID_STEPS', '81'))
MAX_MISSING_RATIO = float(os.getenv('GEX_MAX_MISSING_RATIO', '0.25'))
RISK_FREE_RATE = float(os.getenv('GEX_RISK_FREE_RATE', '0.045'))
RECOMPUTE_ALL = os.getenv('GEX_RECOMPUTE_ALL', 'false').strip().lower() in ('1', 'true', 'yes')
GEX_MOVE_PCT = 0.01
GEX_UNIT = 'usd_delta_change_per_1pct_move'
GEX_POSITIONING_MODEL = 'call_positive_put_negative_proxy'
GEX_MODEL_VERSION = 'gex-v2-1pct-positioning-proxy'


@dataclass(frozen=True)
class Contract:
    expiry: date
    strike: float
    right: str
    open_interest: int
    volume: int
    gamma: float
    iv: float | None


def load_symbols() -> list[str]:
    raw_symbols = os.getenv('GEX_SYMBOLS') or os.getenv('OPTION_SYMBOLS') or os.getenv('SYMBOLS') or DEFAULT_SYMBOLS
    symbols = []
    seen = set()
    for part in raw_symbols.split(','):
        symbol = part.strip().upper()
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def latest_chain_snapshot(conn, symbol: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM option_chain_snapshots
            WHERE symbol = %s
            ORDER BY snapshot_ts DESC
            LIMIT 1
            """,
            (symbol,),
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))


def chain_snapshots(conn, symbol: str, recompute_all: bool = False) -> list[dict[str, Any]]:
    if not recompute_all:
        snapshot = latest_chain_snapshot(conn, symbol)
        return [snapshot] if snapshot else []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM option_chain_snapshots
            WHERE symbol = %s
            ORDER BY snapshot_ts ASC
            """,
            (symbol,),
        )
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def load_contracts(conn, snapshot_id: int) -> list[Contract]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT expiry, strike, option_right, open_interest, volume, gamma, iv
            FROM option_contract_snapshots
            WHERE snapshot_id = %s
              AND open_interest IS NOT NULL
              AND gamma IS NOT NULL
            ORDER BY expiry ASC, strike ASC, option_right ASC
            """,
            (snapshot_id,),
        )
        contracts = []
        for expiry, strike, right, open_interest, volume, gamma, iv in cur.fetchall():
            contracts.append(Contract(
                expiry=expiry,
                strike=float(strike),
                right=right,
                open_interest=int(open_interest or 0),
                volume=int(volume or 0),
                gamma=float(gamma),
                iv=float(iv) if iv is not None else None,
            ))
        return contracts


def compute_for_snapshot(snapshot: dict[str, Any], contracts: list[Contract]) -> dict[str, Any]:
    spot = _to_float(snapshot.get('underlying_price'))
    if spot is None or spot <= 0:
        raise ValueError('underlying_price missing; cannot compute GEX')
    if not contracts:
        raise ValueError('no contracts with gamma and open_interest; cannot compute GEX')

    missing_greeks_ratio = _to_float(snapshot.get('missing_greeks_ratio')) or 0
    missing_oi_ratio = _to_float(snapshot.get('missing_oi_ratio')) or 0
    if missing_greeks_ratio > MAX_MISSING_RATIO or missing_oi_ratio > MAX_MISSING_RATIO:
        raise ValueError(
            f'chain completeness below GEX threshold: missing_greeks_ratio={missing_greeks_ratio}, missing_oi_ratio={missing_oi_ratio}'
        )

    by_strike = aggregate_by_strike(contracts, spot)
    global_gex = sum(row['net_gex'] for row in by_strike.values())
    local_gamma = sum(
        row['net_gex']
        for strike, row in by_strike.items()
        if abs(strike / spot - 1) <= LOCAL_GAMMA_WINDOW_PCT / 100
    )
    call_wall = _max_strike_by(by_strike, 'call_gex', min_strike=spot)
    put_wall = _max_strike_by(by_strike, 'put_abs_gex', max_strike=spot)
    pcr_oi = _safe_ratio(sum(row['put_oi'] for row in by_strike.values()), sum(row['call_oi'] for row in by_strike.values()))
    pcr_volume = _safe_ratio(sum(row['put_volume'] for row in by_strike.values()), sum(row['call_volume'] for row in by_strike.values()))
    max_pain = compute_max_pain(contracts)
    valuation_date = _valuation_date(snapshot['snapshot_ts'])
    gamma_curve = compute_gamma_curve(contracts, spot, valuation_date)
    gamma_flip = find_gamma_flip(gamma_curve)
    spot_vs_flip_distance_pct = None if gamma_flip is None else ((spot - gamma_flip) / gamma_flip) * 100
    gamma_regime = classify_gamma_regime(global_gex)
    confidence = confidence_for(snapshot, contracts)

    return {
        'snapshot_id': snapshot['id'],
        'symbol': snapshot['symbol'],
        'snapshot_ts': snapshot['snapshot_ts'],
        'source': snapshot['source'],
        'global_gex': global_gex,
        'local_gamma': local_gamma,
        'gamma_flip': gamma_flip,
        'gamma_regime': gamma_regime,
        'spot_vs_flip_distance_pct': spot_vs_flip_distance_pct,
        'call_wall': call_wall,
        'put_wall': put_wall,
        'wall_method': 'gex',
        'max_pain': max_pain,
        'pcr_oi': pcr_oi,
        'pcr_volume': pcr_volume,
        'confidence': confidence,
        'gamma_curve': gamma_curve,
        'by_strike': by_strike,
        'raw_metrics': {
            'formula': 'call_gex=gamma*oi*contract_multiplier*spot^2*0.01; put_gex=-gamma*oi*contract_multiplier*spot^2*0.01',
            'formula_id': 'gamma_oi_spot_squared_1pct',
            'unit': GEX_UNIT,
            'model_version': GEX_MODEL_VERSION,
            'underlying_move_pct': GEX_MOVE_PCT * 100,
            'positioning_model': GEX_POSITIONING_MODEL,
            'positioning_assumption': 'Call and Put OI are assigned opposite dealer-side signs as a proxy; public OI does not identify actual dealer positions.',
            'contract_multiplier': CONTRACT_MULTIPLIER,
            'contract_count_used': len(contracts),
            'contract_count_available': _to_float(snapshot.get('contract_count')),
            'spot': spot,
            'underlying_price_as_of': snapshot['snapshot_ts'].isoformat(),
            'valuation_date': valuation_date.isoformat(),
            'expiry_start': min(contract.expiry for contract in contracts).isoformat(),
            'expiry_end': max(contract.expiry for contract in contracts).isoformat(),
            'dte_min': min((contract.expiry - valuation_date).days for contract in contracts),
            'dte_max': max((contract.expiry - valuation_date).days for contract in contracts),
            'local_gamma_window_pct': LOCAL_GAMMA_WINDOW_PCT,
            'gamma_flip_grid_pct': GAMMA_FLIP_GRID_PCT,
            'gamma_flip_grid_steps': GAMMA_FLIP_GRID_STEPS,
            'max_missing_ratio': MAX_MISSING_RATIO,
            'risk_free_rate': RISK_FREE_RATE,
            'missing_greeks_ratio': missing_greeks_ratio,
            'missing_oi_ratio': missing_oi_ratio,
        },
    }


def aggregate_by_strike(contracts: list[Contract], spot: float) -> dict[float, dict[str, Any]]:
    by_strike: dict[float, dict[str, Any]] = defaultdict(lambda: {
        'call_gex': 0.0,
        'put_gex': 0.0,
        'net_gex': 0.0,
        'call_oi': 0,
        'put_oi': 0,
        'call_volume': 0,
        'put_volume': 0,
        'put_abs_gex': 0.0,
    })
    for contract in contracts:
        exposure = gex_exposure(contract.gamma, contract.open_interest, spot)
        row = by_strike[contract.strike]
        if contract.right == 'C':
            row['call_gex'] += exposure
            row['call_oi'] += contract.open_interest
            row['call_volume'] += contract.volume
        else:
            put_gex = -exposure
            row['put_gex'] += put_gex
            row['put_abs_gex'] += abs(put_gex)
            row['put_oi'] += contract.open_interest
            row['put_volume'] += contract.volume
        row['net_gex'] = row['call_gex'] + row['put_gex']
    return dict(sorted(by_strike.items()))


def compute_gamma_curve(contracts: list[Contract], spot: float, valuation_date: date | None = None) -> list[dict[str, float]]:
    steps = max(GAMMA_FLIP_GRID_STEPS, 3)
    low = spot * (1 - GAMMA_FLIP_GRID_PCT / 100)
    high = spot * (1 + GAMMA_FLIP_GRID_PCT / 100)
    today = valuation_date or date.today()
    curve = []
    for idx in range(steps):
        price = low + (high - low) * idx / (steps - 1)
        net_gex = 0.0
        for contract in contracts:
            gamma = projected_gamma(contract, price, today)
            if gamma is None:
                gamma = contract.gamma
            exposure = gex_exposure(gamma, contract.open_interest, price)
            net_gex += exposure if contract.right == 'C' else -exposure
        curve.append({'price': round(price, 4), 'net_gex': round(net_gex, 4)})
    return curve


def gex_exposure(gamma: float, open_interest: int, spot: float) -> float:
    """Estimate dollar Delta change for a 1% underlying move."""
    return gamma * open_interest * CONTRACT_MULTIPLIER * spot * spot * GEX_MOVE_PCT


def projected_gamma(contract: Contract, price: float, today: date) -> float | None:
    if contract.iv is None or contract.iv <= 0 or price <= 0:
        return None
    dte = max((contract.expiry - today).days, 1)
    time_to_expiry = dte / 365
    sigma_sqrt_t = contract.iv * math.sqrt(time_to_expiry)
    if sigma_sqrt_t <= 0:
        return None
    d1 = (math.log(price / contract.strike) + (RISK_FREE_RATE + 0.5 * contract.iv * contract.iv) * time_to_expiry) / sigma_sqrt_t
    return _normal_pdf(d1) / (price * sigma_sqrt_t)


def find_gamma_flip(curve: list[dict[str, float]]) -> float | None:
    if not curve:
        return None
    for left, right in zip(curve, curve[1:]):
        left_gex = left['net_gex']
        right_gex = right['net_gex']
        if left_gex == 0:
            return left['price']
        if (left_gex < 0 < right_gex) or (left_gex > 0 > right_gex):
            pct = abs(left_gex) / (abs(left_gex) + abs(right_gex))
            return round(left['price'] + (right['price'] - left['price']) * pct, 4)
    nearest = min(curve, key=lambda point: abs(point['net_gex']))
    return nearest['price']


def compute_max_pain(contracts: list[Contract]) -> float | None:
    strikes = sorted({contract.strike for contract in contracts})
    if not strikes:
        return None
    best_strike = None
    best_pain = None
    for candidate in strikes:
        pain = 0.0
        for contract in contracts:
            if contract.right == 'C':
                pain += max(candidate - contract.strike, 0) * contract.open_interest * CONTRACT_MULTIPLIER
            else:
                pain += max(contract.strike - candidate, 0) * contract.open_interest * CONTRACT_MULTIPLIER
        if best_pain is None or pain < best_pain:
            best_pain = pain
            best_strike = candidate
    return best_strike


def confidence_for(snapshot: dict[str, Any], contracts: list[Contract]) -> str:
    completeness = _to_float(snapshot.get('completeness_pct'))
    missing_greeks_ratio = _to_float(snapshot.get('missing_greeks_ratio'))
    missing_oi_ratio = _to_float(snapshot.get('missing_oi_ratio'))
    completeness = completeness if completeness is not None else 0
    missing_greeks_ratio = missing_greeks_ratio if missing_greeks_ratio is not None else 1
    missing_oi_ratio = missing_oi_ratio if missing_oi_ratio is not None else 1
    if completeness >= 95 and missing_greeks_ratio <= 0.05 and missing_oi_ratio <= 0.05 and len(contracts) >= 10:
        return 'high'
    if completeness >= 75 and missing_greeks_ratio <= 0.15 and missing_oi_ratio <= 0.15:
        return 'medium'
    return 'low'


def persist_gex(conn, metrics: dict[str, Any]) -> int:
    with conn.cursor() as cur:
        cur.execute('DELETE FROM gex_by_strike_snapshots WHERE snapshot_id = %s', (metrics['snapshot_id'],))
        cur.execute(
            """
            INSERT INTO gex_snapshots (
              snapshot_id, symbol, snapshot_ts, source, global_gex, local_gamma,
              gamma_flip, gamma_regime, spot_vs_flip_distance_pct, call_wall,
              put_wall, wall_method, max_pain, pcr_oi, pcr_volume, confidence,
              gamma_curve, raw_metrics
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_id) DO UPDATE SET
              global_gex = EXCLUDED.global_gex,
              local_gamma = EXCLUDED.local_gamma,
              gamma_flip = EXCLUDED.gamma_flip,
              gamma_regime = EXCLUDED.gamma_regime,
              spot_vs_flip_distance_pct = EXCLUDED.spot_vs_flip_distance_pct,
              call_wall = EXCLUDED.call_wall,
              put_wall = EXCLUDED.put_wall,
              wall_method = EXCLUDED.wall_method,
              max_pain = EXCLUDED.max_pain,
              pcr_oi = EXCLUDED.pcr_oi,
              pcr_volume = EXCLUDED.pcr_volume,
              confidence = EXCLUDED.confidence,
              gamma_curve = EXCLUDED.gamma_curve,
              raw_metrics = EXCLUDED.raw_metrics,
              created_at = NOW()
            RETURNING id
            """,
            (
                metrics['snapshot_id'],
                metrics['symbol'],
                metrics['snapshot_ts'],
                metrics['source'],
                metrics['global_gex'],
                metrics['local_gamma'],
                metrics['gamma_flip'],
                metrics['gamma_regime'],
                metrics['spot_vs_flip_distance_pct'],
                metrics['call_wall'],
                metrics['put_wall'],
                metrics['wall_method'],
                metrics['max_pain'],
                metrics['pcr_oi'],
                metrics['pcr_volume'],
                metrics['confidence'],
                Json(metrics['gamma_curve']),
                Json(metrics['raw_metrics']),
            ),
        )
        gex_id = cur.fetchone()[0]

    strike_values = [
        (
            metrics['snapshot_id'],
            metrics['symbol'],
            strike,
            row['call_gex'],
            row['put_gex'],
            row['net_gex'],
            row['call_oi'],
            row['put_oi'],
            row['call_volume'],
            row['put_volume'],
        )
        for strike, row in metrics['by_strike'].items()
    ]
    if strike_values:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO gex_by_strike_snapshots (
                  snapshot_id, symbol, strike, call_gex, put_gex, net_gex,
                  call_oi, put_oi, call_volume, put_volume
                )
                VALUES %s
                ON CONFLICT (snapshot_id, strike) DO UPDATE SET
                  call_gex = EXCLUDED.call_gex,
                  put_gex = EXCLUDED.put_gex,
                  net_gex = EXCLUDED.net_gex,
                  call_oi = EXCLUDED.call_oi,
                  put_oi = EXCLUDED.put_oi,
                  call_volume = EXCLUDED.call_volume,
                  put_volume = EXCLUDED.put_volume
                """,
                strike_values,
            )
    conn.commit()
    return gex_id


def run() -> None:
    log.info('=== GEX Compute starting ===')
    if not DB_URL:
        raise ValueError('DATABASE_URL is required')
    symbols = load_symbols()
    conn = psycopg2.connect(DB_URL)
    log.info(f'Loaded {len(symbols)} symbols; symbols={symbols}')
    written = 0
    skipped = []
    for symbol in symbols:
        try:
            snapshots = chain_snapshots(conn, symbol, RECOMPUTE_ALL)
            if not snapshots:
                skipped.append((symbol, 'missing_chain_snapshot'))
                log.warning(f'{symbol}: skipped; missing chain snapshot')
                continue
            for snapshot in snapshots:
                contracts = load_contracts(conn, snapshot['id'])
                metrics = compute_for_snapshot(snapshot, contracts)
                gex_id = persist_gex(conn, metrics)
                written += 1
                log.info(
                    f"{symbol}: gex_id={gex_id}; snapshot_id={snapshot['id']}; "
                    f"global_gex={metrics['global_gex']:.2f}; confidence={metrics['confidence']}"
                )
        except Exception as exc:
            conn.rollback()
            skipped.append((symbol, str(exc)))
            log.error(f'{symbol}: GEX compute skipped: {exc}')
    conn.close()
    log.info(f'=== Done: {written} GEX snapshots written, {len(skipped)} skipped ===')
    if skipped:
        log.warning(f'Skipped symbols: {json.dumps(skipped)}')


def _max_strike_by(
    by_strike: dict[float, dict[str, Any]],
    key: str,
    *,
    min_strike: float | None = None,
    max_strike: float | None = None,
) -> float | None:
    positive_rows = [
        (strike, row.get(key) or 0)
        for strike, row in by_strike.items()
        if (min_strike is None or strike >= min_strike)
        and (max_strike is None or strike <= max_strike)
    ]
    if not positive_rows:
        return None
    strike, value = max(positive_rows, key=lambda item: item[1])
    return strike if value > 0 else None


def classify_gamma_regime(global_gex: float) -> str:
    if global_gex > 0:
        return 'positive'
    if global_gex < 0:
        return 'negative'
    return 'near_zero'


def _safe_ratio(numerator: int | float, denominator: int | float) -> float | None:
    if not denominator:
        return None
    return numerator / denominator


def _normal_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2 * math.pi)


def _to_float(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _valuation_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace('Z', '+00:00')).date()
    raise ValueError('snapshot_ts is required to derive valuation date')


if __name__ == '__main__':
    run()
