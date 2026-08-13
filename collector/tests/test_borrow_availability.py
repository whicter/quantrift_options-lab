"""Borrow availability: the classification rules and the warning trap.

The first real run marked all 12 symbols as errors while holding good values,
because IB emits notices alongside usable ticks. These tests pin the two rules
that fix stayed on.
"""
import threading
import unittest

from providers.ib_borrow_provider import (
    BorrowAvailability, IbBorrowProvider, _App, _is_warning,
)


class WarningClassificationTest(unittest.TestCase):
    def test_ib_reserves_2100_2199_for_warnings(self):
        for code in (2100, 2104, 2106, 2158, 2176, 2199):
            self.assertTrue(_is_warning(code), f'{code} should be a warning')

    def test_real_errors_are_not_warnings(self):
        # 200 no security definition, 354 not subscribed, 1100 connection lost
        for code in (200, 354, 1100, 2200, 10197):
            self.assertFalse(_is_warning(code), f'{code} should not be a warning')

    def test_the_fractional_share_notice_is_not_fatal(self):
        """2176 arrives with a perfectly good tick.

        Treating it as fatal is what marked every symbol in the first run as an
        error while the values were already in hand.
        """
        app = _App()
        app.done[1] = threading.Event()
        app.error(1, 2176, 'Warning: ... Trimmed value 5349354.640999 to 5349354')
        self.assertNotIn(1, app.errors)
        self.assertFalse(app.done[1].is_set())


class StatusClassificationTest(unittest.TestCase):
    def setUp(self):
        self.provider = IbBorrowProvider(client_id=999)
        # The no-data cases otherwise sit out the real 4s per-symbol timeout,
        # which turned this file into a 20-second run on its own.
        self.provider.per_symbol_timeout = 0.01

    def _fetch(self, level=None, shares=None, error=None):
        app = _App()
        req = 1
        if level is not None:
            app.level[req] = level
        if shares is not None:
            app.shares[req] = shares
        if error is not None:
            app.errors[req] = error
        app.reqMktData = lambda *a, **k: None
        app.cancelMktData = lambda *a, **k: None
        return self.provider._fetch_one.__wrapped__(self.provider, app, 'TEST', req) \
            if hasattr(self.provider._fetch_one, '__wrapped__') \
            else self.provider._fetch_one(app, 'TEST', req)

    def test_available_name_is_ok(self):
        result = self._fetch(level=3.0, shares=6_134_175)
        self.assertEqual(result.status, 'ok')
        self.assertEqual(result.shortable_shares, 6_134_175)

    def test_unlendable_name_is_an_observation_not_a_gap(self):
        """A name IB will not lend is the extreme of the same scale, not a null."""
        result = self._fetch(level=1.0, shares=0)
        self.assertEqual(result.status, 'not_shortable')
        self.assertEqual(result.shortable_level, 1.0)

    def test_silence_is_no_data(self):
        self.assertEqual(self._fetch().status, 'no_data')

    def test_data_outranks_a_reported_error(self):
        """IB can send a notice and a usable tick for the same request."""
        result = self._fetch(level=3.0, shares=500, error=(2176, 'trimmed'))
        self.assertEqual(result.status, 'ok')
        self.assertEqual(result.shortable_shares, 500)

    def test_error_with_no_data_stays_an_error(self):
        result = self._fetch(error=(354, 'not subscribed'))
        self.assertEqual(result.status, 'error')
        self.assertIsNone(result.shortable_shares)


class WaitReleaseTest(unittest.TestCase):
    def test_both_halves_release_the_wait(self):
        """Releasing early is what keeps a serial 200-symbol sweep to minutes."""
        app = _App()
        app.done[7] = threading.Event()
        app.tickGeneric(7, 46, 3.0)
        self.assertFalse(app.done[7].is_set(), 'level alone should not release')
        app.tickSize(7, 89, 1000)
        self.assertTrue(app.done[7].is_set())

    def test_unrelated_ticks_are_ignored(self):
        app = _App()
        app.done[7] = threading.Event()
        app.tickSize(7, 8, 12345)      # volume, not shortable shares
        app.tickGeneric(7, 24, 0.31)   # halted/other
        self.assertFalse(app.done[7].is_set())
        self.assertEqual(app.shares, {})


if __name__ == '__main__':
    unittest.main()
