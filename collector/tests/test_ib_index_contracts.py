"""Index underlyings (SPX, NDX...) need IND/CBOE, not STK/SMART.

The provider hardcoded secType='STK' and exchange='SMART' in three places, so
index options could not be collected at all -- qualifying SPX as a stock on
SMART returns nothing. That is why the GEX archive covers SPY/QQQ/TQQQ/IWM but
no index, even though SPX is where the 0DTE volume actually is.

The regression risk runs the other way: 301 equity/ETF symbols are collected
daily through these same three call sites, so the index branch must be strictly
additive. Every test below pins the equity path as well as the index path.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from providers.ib_option_chain_provider import (  # noqa: E402
    INDEX_SYMBOLS, IbOptionChainProvider, _is_index_symbol,
)


class IndexSymbolClassificationTest(unittest.TestCase):
    def test_known_indices(self):
        for s in ("SPX", "NDX", "RUT", "VIX", "XSP"):
            self.assertTrue(_is_index_symbol(s), f"{s} 应被识别为指数")

    def test_case_insensitive(self):
        self.assertTrue(_is_index_symbol("spx"))

    def test_equities_are_not_indices(self):
        """最关键的一条：现有 301 个标的一个都不能被误判成指数。"""
        for s in ("SPY", "QQQ", "TQQQ", "IWM", "AAPL", "PLTR", "NVDA",
                  "SPXS", "SPXL", "VIXY", "NDAQ", "RUTH"):
            self.assertFalse(_is_index_symbol(s), f"{s} 被误判为指数会破坏现有采集")

    def test_index_set_is_explicit(self):
        """白名单必须是显式集合，不能靠模式匹配——'SPXL' 之类会被误伤。"""
        self.assertIsInstance(INDEX_SYMBOLS, (set, frozenset))
        self.assertIn("SPX", INDEX_SYMBOLS)


class ContractShapeTest(unittest.TestCase):
    def _provider(self):
        return IbOptionChainProvider.__new__(IbOptionChainProvider)

    def test_equity_underlying_unchanged(self):
        c = self._provider()._stock_contract("AAPL")
        self.assertEqual(c.secType, "STK")
        self.assertEqual(c.exchange, "SMART")
        self.assertEqual(c.symbol, "AAPL")

    def test_index_underlying(self):
        c = self._provider()._stock_contract("SPX")
        self.assertEqual(c.secType, "IND")
        self.assertEqual(c.exchange, "CBOE")
        self.assertEqual(c.symbol, "SPX")

    def test_equity_option_query_unchanged(self):
        c = self._provider()._option_contract_query("AAPL", date(2026, 9, 18), "C", "AAPL")
        self.assertEqual(c.secType, "OPT")
        self.assertEqual(c.exchange, "SMART")
        self.assertEqual(c.multiplier, "100")
        self.assertEqual(c.tradingClass, "AAPL")

    def test_index_option_query(self):
        c = self._provider()._option_contract_query("SPX", date(2026, 9, 18), "P", "SPXW")
        self.assertEqual(c.secType, "OPT")
        self.assertEqual(c.exchange, "CBOE")
        self.assertEqual(c.tradingClass, "SPXW",
                         "0DTE 在 SPXW 里，tradingClass 必须能透传")


class SecDefParamsTest(unittest.TestCase):
    """reqSecDefOptParams 的 secType 参数也必须跟着分支走。"""

    class _App:
        def __init__(self):
            self.calls = []
            self.option_params_done = {}
            self.option_params = {}

        def next_req_id(self):
            return 1

        def reqSecDefOptParams(self, req_id, symbol, exch, sec_type, con_id):
            self.calls.append(sec_type)
            import threading
            self.option_params_done[req_id].set()
            self.option_params[req_id] = {
                "expirations": {"20260918"}, "strikes": {100.0},
                "trading_classes": {symbol}, "multipliers": {"100"},
            }

    def _provider(self):
        p = IbOptionChainProvider.__new__(IbOptionChainProvider)
        p.timeout = 1
        return p

    def test_equity_uses_stk(self):
        app = self._App()
        self._provider()._fetch_option_params(app, "AAPL", 123)
        self.assertEqual(app.calls, ["STK"])

    def test_index_uses_ind(self):
        app = self._App()
        self._provider()._fetch_option_params(app, "SPX", 123)
        self.assertEqual(app.calls, ["IND"],
                         "指数用 STK 请求参数会返回空，链发现直接失败")


if __name__ == "__main__":
    unittest.main()
