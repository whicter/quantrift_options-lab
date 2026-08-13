"""Borrow fee rate from IBKR's public securities-lending file.

This is the one input a short-squeeze read needs that nothing else here
carries. Ortex and S3 sell it for four figures a year; IBKR publishes it for
free, refreshed intraday, to an anonymous FTP account.

Two things cost a day to find and are worth writing down:

* The host is ftp2, not ftp3. Every reference (including IBKR's own older
  docs) points at ftp3.interactivebrokers.com, which no longer accepts
  connections at all -- port 21 times out rather than refusing, so it reads
  like a firewall block. ftp2 answers immediately with the same anonymous
  `shortstock` login. "FTP is blocked here" was the wrong conclusion.
* usa.txt is one of 52 country files on that server; the rest are other
  markets and their .md5 companions.

Format (pipe-delimited, one header row prefixed with #):

    #BOF|2026.08.13|18:16:01
    #SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE|FIGI|
    GME|USD|GAMESTOP CORP-CLASS A|123456|US36467W1099|3.3800|0.2500|6100000|BBG...

FEERATE is the annualised borrow cost in percent; AVAILABLE is lendable
shares. Both carry the literal string `NA` when IBKR has no figure, which must
stay distinguishable from zero -- a name with no quote is not a name that is
free to borrow.
"""

from __future__ import annotations

import ftplib
import io
import logging
import os
from dataclasses import dataclass
from datetime import datetime

log = logging.getLogger(__name__)

FTP_HOST = os.getenv('IBKR_BORROW_FTP_HOST', 'ftp2.interactivebrokers.com')
FTP_USER = os.getenv('IBKR_BORROW_FTP_USER', 'shortstock')
FTP_FILE = os.getenv('IBKR_BORROW_FTP_FILE', 'usa.txt')
FTP_TIMEOUT = float(os.getenv('IBKR_BORROW_FTP_TIMEOUT', '45'))


@dataclass
class BorrowFee:
    symbol: str
    fee_rate: float | None
    rebate_rate: float | None
    available_shares: int | None
    name: str | None


def _num(raw: str) -> float | None:
    # IBKR writes the literal 'NA' rather than an empty field. Returning 0.0
    # here would turn "no quote" into "free to borrow", which is the opposite
    # reading on exactly the names this file exists to flag.
    raw = (raw or '').strip()
    if not raw or raw.upper() == 'NA':
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _int(raw: str) -> int | None:
    value = _num(raw)
    return int(value) if value is not None else None


def fetch_raw(host: str = FTP_HOST, filename: str = FTP_FILE) -> str:
    client = ftplib.FTP()
    client.connect(host, 21, timeout=FTP_TIMEOUT)
    client.login(FTP_USER, '')
    # Passive explicitly: an active-mode data channel needs an inbound
    # connection back to this host, which is what a NAT or laptop firewall
    # silently drops.
    client.set_pasv(True)
    buffer = io.BytesIO()
    try:
        client.retrbinary(f'RETR {filename}', buffer.write, blocksize=32768)
    finally:
        try:
            client.quit()
        except Exception:  # noqa: BLE001 - closing is best effort
            client.close()
    # latin-1: the file carries occasional non-UTF8 bytes in company names, and
    # a decode error must not cost the whole market's fee data.
    return buffer.getvalue().decode('latin-1')


def parse(payload: str) -> tuple[list[BorrowFee], datetime | None]:
    rows: list[BorrowFee] = []
    as_of: datetime | None = None
    for line in payload.splitlines():
        if not line.strip():
            continue
        if line.startswith('#BOF'):
            parts = line.split('|')
            if len(parts) >= 3:
                try:
                    as_of = datetime.strptime(f'{parts[1]} {parts[2]}', '%Y.%m.%d %H:%M:%S')
                except ValueError:
                    as_of = None
            continue
        if line.startswith('#'):
            continue
        parts = line.split('|')
        if len(parts) < 8:
            continue
        rows.append(BorrowFee(
            symbol=parts[0].strip().upper(),
            rebate_rate=_num(parts[5]),
            fee_rate=_num(parts[6]),
            available_shares=_int(parts[7]),
            name=(parts[2] or '').strip() or None,
        ))
    return rows, as_of


def fetch(host: str = FTP_HOST, filename: str = FTP_FILE) -> tuple[list[BorrowFee], datetime | None]:
    return parse(fetch_raw(host, filename))
