"""Deterministic validation helpers for the GEX calculation contract."""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import compute_gex

DEFAULT_FIXTURE = Path(__file__).parent / 'tests' / 'fixtures' / 'gex_validation_v1.json'


def load_fixture(path: str | Path = DEFAULT_FIXTURE) -> dict[str, Any]:
    with Path(path).open(encoding='utf-8') as handle:
        return json.load(handle)


def _contracts(rows: list[dict[str, Any]]) -> list[compute_gex.Contract]:
    return [
        compute_gex.Contract(
            expiry=date.fromisoformat(row['expiry']),
            strike=float(row['strike']),
            right=row['right'],
            open_interest=int(row['open_interest']),
            volume=int(row['volume']),
            gamma=float(row['gamma']),
            iv=float(row['iv']) if row.get('iv') is not None else None,
        )
        for row in rows
    ]


def _snapshot(row: dict[str, Any]) -> dict[str, Any]:
    snapshot = dict(row)
    snapshot['snapshot_ts'] = datetime.fromisoformat(snapshot['snapshot_ts'])
    return snapshot


def _assert_close(actual: Any, expected: Any, tolerance: float, label: str) -> None:
    if isinstance(expected, (int, float)):
        if actual is None or abs(float(actual) - float(expected)) > tolerance:
            raise AssertionError(f'{label}: expected {expected}, got {actual}')
    elif actual != expected:
        raise AssertionError(f'{label}: expected {expected}, got {actual}')


def validate_fixture(path: str | Path = DEFAULT_FIXTURE) -> dict[str, Any]:
    fixture = load_fixture(path)
    tolerance = float(fixture.get('tolerance', 0.0001))
    if fixture['model_version'] != compute_gex.GEX_MODEL_VERSION:
        raise AssertionError('fixture model version does not match active GEX model')

    outcomes = []
    for chain in fixture['chains']:
        metrics = compute_gex.compute_for_snapshot(_snapshot(chain['snapshot']), _contracts(chain['contracts']))
        replay = compute_gex.compute_for_snapshot(_snapshot(chain['snapshot']), _contracts(chain['contracts']))
        if canonical_metrics(metrics) != canonical_metrics(replay):
            raise AssertionError(f"{chain['name']}: repeated computation is not deterministic")
        for field, expected in chain['expected'].items():
            if field == 'by_strike':
                for strike, values in expected.items():
                    actual_row = metrics['by_strike'][float(strike)]
                    for key, value in values.items():
                        _assert_close(actual_row[key], value, tolerance, f"{chain['name']}.by_strike.{strike}.{key}")
            else:
                _assert_close(metrics[field], expected, tolerance, f"{chain['name']}.{field}")
        raw = metrics['raw_metrics']
        if raw['unit'] != 'usd_delta_change_per_1pct_move' or raw['underlying_move_pct'] != 1.0:
            raise AssertionError(f"{chain['name']}: 1% move unit metadata mismatch")
        if raw['positioning_model'] != 'call_positive_put_negative_proxy':
            raise AssertionError(f"{chain['name']}: positioning assumption metadata mismatch")
        outcomes.append({'name': chain['name'], 'symbol': metrics['symbol'], 'global_gex': metrics['global_gex']})

    flip = compute_gex.find_gamma_flip(fixture['gamma_flip_curve'])
    _assert_close(flip, fixture['expected_gamma_flip'], tolerance, 'gamma_flip_curve')
    return {'fixture_version': fixture['fixture_version'], 'model_version': fixture['model_version'], 'validated': outcomes, 'gamma_flip': flip}


def canonical_metrics(metrics: dict[str, Any]) -> str:
    """Stable representation for replay tests; excludes database identity only."""
    relevant = {
        key: metrics[key]
        for key in ('global_gex', 'local_gamma', 'gamma_flip', 'gamma_regime', 'call_wall', 'put_wall', 'max_pain', 'pcr_oi', 'pcr_volume', 'gamma_curve', 'by_strike', 'raw_metrics')
    }
    return json.dumps(relevant, sort_keys=True, default=str, separators=(',', ':'))


if __name__ == '__main__':
    print(json.dumps(validate_fixture(), sort_keys=True))
