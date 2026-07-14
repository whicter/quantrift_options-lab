import csv
from datetime import date, timedelta
from io import StringIO

import requests

from .base import PriceBar


class StooqPriceProvider:
    source = 'stooq'

    def __init__(self, timeout: int = 30):
        self.timeout = timeout

    def fetch_daily_bars(self, symbol: str, limit: int = 60) -> list[PriceBar]:
        end = date.today()
        start = end - timedelta(days=max(120, limit * 3))
        stooq_symbol = f'{symbol.lower()}.us'
        url = 'https://stooq.com/q/d/l/'
        params = {
            's': stooq_symbol,
            'i': 'd',
            'd1': start.strftime('%Y%m%d'),
            'd2': end.strftime('%Y%m%d'),
        }
        resp = requests.get(url, params=params, timeout=self.timeout)
        resp.raise_for_status()

        rows = []
        for row in csv.DictReader(StringIO(resp.text)):
            if not row.get('Date') or row.get('Close') in (None, '', 'N/D'):
                continue
            rows.append(PriceBar(
                symbol=symbol.upper(),
                date=date.fromisoformat(row['Date']),
                open=_float_or_none(row.get('Open')),
                high=_float_or_none(row.get('High')),
                low=_float_or_none(row.get('Low')),
                close=float(row['Close']),
                volume=_int_or_none(row.get('Volume')),
                source=self.source,
            ))

        return rows[-limit:]


def _float_or_none(value):
    if value in (None, '', 'N/D'):
        return None
    return float(value)


def _int_or_none(value):
    if value in (None, '', 'N/D'):
        return None
    return int(float(value))
