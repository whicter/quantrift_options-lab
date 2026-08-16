import os
import unittest
from unittest.mock import patch

from providers.ib_option_chain_provider import IbOptionChainProvider, _MarketData


class FakeContract:
    def __init__(self, con_id, strike, right, expiry='20260918'):
        self.conId = con_id
        self.strike = strike
        self.right = right
        self.lastTradeDateOrContractMonth = expiry
        self.localSymbol = f'X{con_id}'


class FakeApp:
    """Records subscribe/cancel traffic and fills payloads on demand."""

    def __init__(self, *, connected=True, fill=True):
        self.market_data = {}
        self._next = 0
        self.subscribed = []
        self.cancelled = []
        self._connected = connected
        self._fill = fill

    def next_req_id(self):
        self._next += 1
        return self._next

    def isConnected(self):
        return self._connected

    def reqMktData(self, req_id, contract, ticks, snapshot, regulatory, opts):
        self.subscribed.append(req_id)
        if self._fill:
            data = self.market_data[req_id]
            data.bid, data.ask = 1.0, 1.1
            data.delta, data.gamma = 0.5, 0.01
            data.call_open_interest = 100
            data.put_open_interest = 100

    def cancelMktData(self, req_id):
        self.cancelled.append(req_id)


def provider(**env):
    with patch.dict(os.environ, {'IB_OPTION_CONTRACT_DELAY': '0', **env}, clear=False):
        return IbOptionChainProvider()


class BatchSubscriptionTests(unittest.TestCase):
    def test_a_batch_is_subscribed_before_any_of_it_is_awaited(self):
        """The whole point: parallel streams, not one round trip per contract.

        The serial path subscribed, waited out option_stream_timeout, cancelled,
        and repeated -- 180 contracts cost 180 round trips and a measured 164.6s
        median per symbol, while TWS renders the same chain instantly by
        subscribing all of it at once. If subscription and cancellation ever
        interleave again, this fails.
        """
        app = FakeApp()
        contracts = [FakeContract(i, 100 + i, 'C') for i in range(1, 6)]
        p = provider()
        p.fetch_contract_snapshots(app, contracts, 'TEST')

        self.assertEqual(len(app.subscribed), 5)
        self.assertEqual(len(app.cancelled), 5)
        # Every subscribe precedes every cancel.
        first_cancel = app.cancelled[0]
        self.assertNotIn(first_cancel, app.subscribed[1:])
        self.assertEqual(app.subscribed, sorted(app.subscribed))

    def test_every_subscription_is_cancelled(self):
        # A leaked subscription holds one of ~100 account-wide market-data lines
        # for the rest of the session, and the next batch silently gets fewer.
        app = FakeApp()
        contracts = [FakeContract(i, 100 + i, 'C') for i in range(1, 4)]
        provider().fetch_contract_snapshots(app, contracts, 'TEST')
        self.assertEqual(sorted(app.cancelled), sorted(app.subscribed))

    def test_subscriptions_are_cancelled_even_when_the_socket_dies(self):
        app = FakeApp(connected=False, fill=False)
        contracts = [FakeContract(1, 100, 'C')]
        with self.assertRaises(RuntimeError):
            provider().fetch_contract_snapshots(app, contracts, 'TEST')
        self.assertEqual(sorted(app.cancelled), sorted(app.subscribed))

    def test_a_contract_that_never_ticks_still_yields_a_snapshot(self):
        # Partial data is normal on illiquid strikes, and the caller counts
        # missing greeks/OI for the completeness report. Dropping the row would
        # silently narrow the chain instead of disclosing a gap.
        app = FakeApp(fill=False)
        contracts = [FakeContract(1, 100, 'C'), FakeContract(2, 105, 'P')]
        snaps = provider(IB_OPTION_BATCH_WAIT_SECONDS='0.1').fetch_contract_snapshots(
            app, contracts, 'TEST')
        self.assertEqual(len(snaps), 2)
        self.assertIsNone(snaps[0].bid)
        self.assertEqual([s.strike for s in snaps], [100.0, 105.0])

    def test_batch_wait_is_per_batch_not_per_contract(self):
        """A batch of 40 must not cost 40 x the wait.

        With nothing ever filling, one batch should spend roughly one wait
        window in total.
        """
        app = FakeApp(fill=False)
        contracts = [FakeContract(i, 100 + i, 'C') for i in range(1, 41)]
        p = provider(IB_OPTION_BATCH_WAIT_SECONDS='0.3')
        import time as _t
        started = _t.monotonic()
        p.fetch_contract_snapshots(app, contracts, 'TEST')
        elapsed = _t.monotonic() - started
        self.assertLess(elapsed, 1.5, 'batch wait appears to be per contract')

    def test_an_invalid_contract_is_rejected_before_anything_is_subscribed(self):
        app = FakeApp()
        bad = FakeContract(0, 100, 'C')  # con_id 0
        with self.assertRaises(ValueError):
            provider().fetch_contract_snapshots(app, [bad], 'TEST')
        self.assertEqual(app.subscribed, [])

    def test_batch_size_leaves_headroom_under_the_account_line_cap(self):
        # IB allows ~100 concurrent lines per ACCOUNT, shared with the news lane,
        # the price fallback and the intraday-spot call even though those run on
        # separate client ids. Filling the cap breaks whichever asks next.
        self.assertLessEqual(provider().quote_batch_size, 60)

    def test_single_contract_helper_still_works(self):
        app = FakeApp()
        snap = provider()._fetch_contract_snapshot(app, FakeContract(1, 100, 'C'), 'TEST')
        self.assertEqual(snap.strike, 100.0)
        self.assertEqual(snap.right, 'C')


if __name__ == '__main__':
    unittest.main()
