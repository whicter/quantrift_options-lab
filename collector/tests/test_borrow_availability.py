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



class FeeFileParseTest(unittest.TestCase):
    """The IBKR securities-lending file: the fee the API never sends."""

    SAMPLE = (
        '#BOF|2026.08.13|18:16:01\n'
        '#SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE|FIGI|\n'
        'GME|USD|GAMESTOP CORP-CLASS A|123|US36467W1099|3.3800|0.2500|6100000|BBG1|\n'
        'SLS|USD|SELLAS LIFE SCIENCES|456|US81639W1027|-7.5000|11.4400|20000|BBG2|\n'
        'DEAD|USD|NO QUOTE INC|789|US0000000000|NA|NA|2000||\n'
        '\n'
        'BAD|USD|TOO FEW FIELDS\n'
    )

    def setUp(self):
        from providers import ib_borrow_fee_provider
        self.mod = ib_borrow_fee_provider
        self.rows, self.as_of = ib_borrow_fee_provider.parse(self.SAMPLE)

    def test_parses_fee_and_availability(self):
        by_symbol = {r.symbol: r for r in self.rows}
        self.assertAlmostEqual(by_symbol['SLS'].fee_rate, 11.44)
        self.assertEqual(by_symbol['SLS'].available_shares, 20000)
        self.assertAlmostEqual(by_symbol['GME'].fee_rate, 0.25)

    def test_na_becomes_none_not_zero(self):
        """'NA' means no quote. Zero would read as 'free to borrow' -- the
        opposite conclusion on exactly the names this file exists to flag."""
        dead = next(r for r in self.rows if r.symbol == 'DEAD')
        self.assertIsNone(dead.fee_rate)
        self.assertIsNone(dead.rebate_rate)
        self.assertEqual(dead.available_shares, 2000)

    def test_negative_rebate_is_preserved(self):
        # A negative rebate is the hard-to-borrow signature; clamping it at zero
        # would erase the distinction this column exists for.
        sls = next(r for r in self.rows if r.symbol == 'SLS')
        self.assertAlmostEqual(sls.rebate_rate, -7.5)

    def test_header_and_short_lines_are_skipped(self):
        symbols = {r.symbol for r in self.rows}
        self.assertEqual(symbols, {'GME', 'SLS', 'DEAD'})

    def test_file_timestamp_is_read(self):
        self.assertEqual(self.as_of.year, 2026)
        self.assertEqual(self.as_of.hour, 18)

    def test_empty_payload_does_not_raise(self):
        rows, as_of = self.mod.parse('')
        self.assertEqual(rows, [])
        self.assertIsNone(as_of)

if __name__ == '__main__':
    unittest.main()
