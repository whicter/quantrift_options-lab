import os
import unittest
from datetime import date
from unittest.mock import patch

from providers.ib_option_chain_provider import (
    IbOptionChainProvider,
    _MarketData,
    _connect_timeout_message,
)


class RecordingRegistry:
    """Stands in for the PostgreSQL-backed registry."""

    def __init__(self, ladder=None):
        self.ladder = ladder
        self.stored = []
        self.hits = 0
        self.misses = 0
        self.stale_reasons = []

    def reset_counters(self):
        self.hits = 0
        self.misses = 0
        self.stale_reasons = []

    def lookup(self, symbol, expiry, right, spot, window_pct, max_per_side, as_of=None):
        if self.ladder is None:
            self.misses += 1
            return None
        self.hits += 1
        return [
            {
                'con_id': con_id, 'strike': strike, 'trading_class': 'AAPL',
                'exchange': 'SMART', 'multiplier': '100', 'currency': 'USD',
                'right': right, 'expiry': expiry,
            }
            for con_id, strike in self.ladder
        ]

    def store(self, symbol, expiry, right, contracts, as_of=None):
        self.stored.append((symbol, expiry, right, list(contracts)))


class FakeIbContract:
    def __init__(self, con_id, strike, right='C', expiry='20260918'):
        self.conId = con_id
        self.strike = strike
        self.right = right
        self.lastTradeDateOrContractMonth = expiry


def provider(registry, **env):
    with patch.dict(os.environ, {'IB_OPTION_CONTRACT_DELAY': '0', **env}, clear=False):
        return IbOptionChainProvider(contract_registry=registry)


class DiscoveryCacheTests(unittest.TestCase):
    def test_a_hit_does_not_ask_ib_for_the_ladder(self):
        """The whole point.

        Discovery is ~24s of a ~46s job (measured over 439 jobs, 2026-08-25..27:
        `seconds = -3.5 + 7.94*expiries + 8.21*batches`, R2=0.95). If a hit still
        issues reqContractDetails the cache costs a query and saves nothing.
        """
        registry = RecordingRegistry(ladder=[(101, 95.0), (102, 100.0), (103, 105.0)])
        p = provider(registry)
        called = []
        with patch.object(p, '_fetch_actual_option_contracts', side_effect=lambda *a: called.append(a)):
            contracts = p._list_option_contracts(
                app=None, symbol='AAPL', expiry=date(2026, 9, 18), right='C',
                trading_class='AAPL', spot=100.0, window_pct=15, max_per_side=20,
            )
        self.assertEqual(called, [])
        self.assertEqual([c.conId for c in contracts], [101, 102, 103])

    def test_both_paths_are_timed_and_say_which_one_ran(self):
        """Discovery timing exists because the regression could not settle it.

        Expiry count, ladder size and kept-contract count all move together
        across symbols, so a fit on observational data cannot separate discovery
        from quoting -- an earlier one appeared to, and was reporting collinear
        proxies for the same variable. A clock on each half can.
        """
        registry = RecordingRegistry(ladder=[(101, 95.0), (102, 100.0)])
        p = provider(registry)
        p.last_discovery_timings = []
        p._list_option_contracts(
            app=None, symbol='AAPL', expiry=date(2026, 9, 18), right='C',
            trading_class='AAPL', spot=100.0, window_pct=15, max_per_side=20,
        )
        registry.ladder = None
        with patch.object(p, '_fetch_actual_option_contracts', return_value=[FakeIbContract(1, 100.0)]):
            p._list_option_contracts(
                app=None, symbol='AAPL', expiry=date(2026, 9, 18), right='P',
                trading_class='AAPL', spot=100.0, window_pct=15, max_per_side=20,
            )

        self.assertEqual([t['source'] for t in p.last_discovery_timings], ['cache', 'ib'])
        self.assertEqual([t['contracts'] for t in p.last_discovery_timings], [2, 1])
        for entry in p.last_discovery_timings:
            self.assertIn('seconds', entry)

    def test_a_miss_asks_ib_and_stores_what_came_back(self):
        registry = RecordingRegistry(ladder=None)
        p = provider(registry)
        fetched = [FakeIbContract(201, 95.0), FakeIbContract(202, 100.0)]
        with patch.object(p, '_fetch_actual_option_contracts', return_value=fetched):
            contracts = p._list_option_contracts(
                app=None, symbol='AAPL', expiry=date(2026, 9, 18), right='C',
                trading_class='AAPL', spot=100.0, window_pct=15, max_per_side=20,
            )
        self.assertEqual(contracts, fetched)
        self.assertEqual(len(registry.stored), 1)
        symbol, expiry, right, stored = registry.stored[0]
        self.assertEqual((symbol, expiry, right), ('AAPL', date(2026, 9, 18), 'C'))
        self.assertEqual([c.conId for c in stored], [201, 202])

    def test_a_cached_contract_still_satisfies_contract_identity(self):
        """A row read back must be indistinguishable from one IB just returned.

        `_contract_identity` rejects a contract missing conId, expiry, strike or
        right, and `fetch_contract_snapshots` calls it on every contract in the
        batch -- so a reconstruction that dropped any of the four would fail the
        whole batch rather than one row.
        """
        p = provider(RecordingRegistry())
        contract = p._contract_from_registry('AAPL', {
            'con_id': 555, 'strike': 187.5, 'right': 'P', 'expiry': date(2026, 9, 18),
            'trading_class': 'AAPL', 'exchange': 'SMART', 'multiplier': '100', 'currency': 'USD',
        })
        self.assertEqual(
            p._contract_identity(contract, 'AAPL'),
            (555, date(2026, 9, 18), 187.5, 'P'),
        )

    def test_a_dotted_ticker_is_translated_on_the_cached_path_too(self):
        """BRK.B reaches IB as 'BRK B' whether the contract came from IB or here.

        The cached path builds a Contract from scratch, so it is a second place
        the translation can be forgotten -- which is exactly how the original
        defect happened on reqSecDefOptParams.
        """
        p = provider(RecordingRegistry())
        contract = p._contract_from_registry('BRK.B', {
            'con_id': 556, 'strike': 500.0, 'right': 'C', 'expiry': date(2026, 9, 18),
            'trading_class': 'BRK B', 'exchange': 'SMART', 'multiplier': '100', 'currency': 'USD',
        })
        self.assertEqual(contract.symbol, 'BRK B')


class FillControlApp:
    """Fills quotes at once and open interest only when told to."""

    def __init__(self, *, fill_oi=True):
        self.market_data = {}
        self._next = 0
        self.subscribed = []
        self.cancelled = []
        self._fill_oi = fill_oi

    def next_req_id(self):
        self._next += 1
        return self._next

    def isConnected(self):
        return True

    def reqMktData(self, req_id, contract, ticks, snapshot, regulatory, opts):
        self.subscribed.append(req_id)
        data = self.market_data[req_id]
        data.bid, data.ask = 1.0, 1.1
        data.delta, data.gamma = 0.5, 0.01
        if self._fill_oi:
            data.call_open_interest = 100
            data.put_open_interest = 100

    def cancelMktData(self, req_id):
        self.cancelled.append(req_id)


class BatchTimingTests(unittest.TestCase):
    """The two marks that turn "drop open interest from the wait" into a number."""

    def test_open_interest_holding_the_window_open_is_recorded_not_hidden(self):
        """Quotes arrive, open interest never does.

        Today the batch waits out its whole window for a daily figure that cannot
        change intraday, and the snapshot is written partial anyway. Without a
        separate quote mark that cost is invisible: the only timestamp is the one
        the deadline produced.
        """
        p = provider(RecordingRegistry(), IB_OPTION_BATCH_WAIT_SECONDS='0.3')
        app = FillControlApp(fill_oi=False)
        p.fetch_contract_snapshots(app, [FakeIbContract(1, 100.0)], 'AAPL')

        timing = p.last_batch_timings[-1]
        self.assertIn('quote_ready_seconds', timing)
        self.assertNotIn('oi_ready_seconds', timing)
        self.assertGreaterEqual(timing['wait_seconds'], 0.3)
        self.assertLess(timing['quote_ready_seconds'], 0.3)

    def test_both_marks_are_recorded_when_open_interest_does_arrive(self):
        p = provider(RecordingRegistry(), IB_OPTION_BATCH_WAIT_SECONDS='0.3')
        app = FillControlApp(fill_oi=True)
        p.fetch_contract_snapshots(app, [FakeIbContract(1, 100.0)], 'AAPL')

        timing = p.last_batch_timings[-1]
        self.assertLessEqual(timing['quote_ready_seconds'], timing['oi_ready_seconds'])
        self.assertLess(timing['wait_seconds'], 0.3)

    def test_timing_records_the_batch_size_it_describes(self):
        p = provider(RecordingRegistry(), IB_OPTION_BATCH_WAIT_SECONDS='0.3')
        app = FillControlApp()
        p.fetch_contract_snapshots(app, [FakeIbContract(i, 100.0 + i) for i in range(1, 4)], 'AAPL')
        self.assertEqual(p.last_batch_timings[-1]['contracts'], 3)

    def test_measuring_does_not_change_what_is_collected(self):
        """The marks are timing only. A batch must return the same rows it did."""
        p = provider(RecordingRegistry(), IB_OPTION_BATCH_WAIT_SECONDS='0.3')
        app = FillControlApp(fill_oi=False)
        snapshots = p.fetch_contract_snapshots(app, [FakeIbContract(1, 100.0)], 'AAPL')
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0].bid, 1.0)
        self.assertEqual(len(app.cancelled), 1)


class QuotePayloadTests(unittest.TestCase):
    def test_the_quote_predicate_excludes_open_interest(self):
        data = _MarketData()
        data.bid, data.delta, data.gamma = 1.0, 0.5, 0.01
        self.assertTrue(data.has_quote_payload())
        self.assertFalse(data.has_analysis_payload('C'))

    def test_a_price_alone_is_not_a_quote_payload(self):
        data = _MarketData()
        data.bid = 1.0
        self.assertFalse(data.has_quote_payload())


if __name__ == '__main__':
    unittest.main()


class ConnectDiagnosticsTests(unittest.TestCase):
    """A handshake timeout must carry what IB already told us."""

    def test_ib_error_326_reaches_the_caller_instead_of_a_bare_timeout(self):
        """The defect this fixes.

        A duplicate client id is answered with error 326 on reqId -1. `error()`
        recorded it in error_msg and the connect path discarded it, so a wedged
        client id was reported as "IB connection timed out" -- a network-shaped
        message for a problem that is neither network nor timing. On 2026-08-28
        that cost the quote lane 110 minutes: id 42 never connected while 44, 47
        and 91 each connected in 0.00s, and nothing in the log said so.
        """
        message = _connect_timeout_message(
            '127.0.0.1', 4001, 42, 'IB error 326: client id is already in use',
        )
        self.assertIn('326', message)
        self.assertIn('client id is already in use', message)

    def test_the_client_id_is_named_because_the_failure_is_per_id(self):
        """Two ids against one gateway fail differently, so the id is the fact.

        Without it the message is identical whether the gateway is down or one
        id is wedged, and only the second is fixable in seconds.
        """
        self.assertIn('client_id=42', _connect_timeout_message('127.0.0.1', 4001, 42, None))

    def test_a_timeout_with_nothing_from_ib_still_reports_cleanly(self):
        message = _connect_timeout_message('127.0.0.1', 4001, 42, None)
        self.assertIn('IB connection timed out: 127.0.0.1:4001', message)
        self.assertNotIn('None', message)


if __name__ == '__main__':
    unittest.main()
