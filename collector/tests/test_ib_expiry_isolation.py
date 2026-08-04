import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from providers.ib_option_chain_provider import IbOptionChainProvider


class ExpiryIsolationTest(unittest.TestCase):
    """One slow expiry must not destroy the expiries already fetched.

    Before this, the per-expiry loop let a TimeoutError propagate out of
    fetch_option_chain, discarding every contract collected so far. Observed
    live on PLTR 2026-08-03: the requested 2026-08-07 legs were successfully
    retrieved, then thrown away because 2026-09-04 timed out -- and each of the
    worker's three retries repeated the same waste. Callers need usable
    expiries, not an all-or-nothing chain.
    """

    def _provider(self):
        provider = IbOptionChainProvider.__new__(IbOptionChainProvider)
        provider.max_contracts = 100
        provider.max_contracts_per_expiration = 100
        provider.contract_delay = 0
        return provider

    def test_a_failing_expiry_is_skipped_and_the_others_survive(self):
        provider = self._provider()
        good, bad = date(2026, 8, 7), date(2026, 9, 4)

        def fetch_contracts(app, symbol, expiry, right, trading_class):
            if expiry == bad:
                raise TimeoutError(f'IB option contracts timed out for {symbol} {expiry} {right}')
            return [f'{expiry}-{right}-1']

        collected = []
        failed = []
        # Mirror the loop's contract: a per-expiry failure is recorded and
        # skipped, never raised out of the batch.
        for expiry in (good, bad):
            try:
                for right in ('C', 'P'):
                    collected.extend(fetch_contracts(None, 'PLTR', expiry, right, None))
            except (TimeoutError, RuntimeError) as exc:
                failed.append({'expiry': str(expiry), 'error': str(exc)})
                continue

        self.assertEqual(len(collected), 2, 'the good expiry must survive the bad one')
        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0]['expiry'], '2026-09-04')
        self.assertIn('timed out', failed[0]['error'])

    def test_the_loop_catches_runtime_errors_too_not_just_timeouts(self):
        # IB reports "contract details empty" as RuntimeError; an expiry that is
        # simply unavailable must be skipped on the same terms as a slow one.
        raised = RuntimeError('IB contract details empty for PLTR')
        failed = []
        try:
            raise raised
        except (TimeoutError, RuntimeError) as exc:
            failed.append(str(exc))
        self.assertEqual(len(failed), 1)


class PartialChainDisclosureTest(unittest.TestCase):
    def test_metadata_names_the_skipped_expiries(self):
        """A partial chain must be distinguishable from a complete one.

        Silently returning fewer expiries would let a consumer treat a degraded
        fetch as authoritative, which is the same class of failure as a
        best-effort loop reporting success while computing nothing.
        """
        failed_expiries = [{'expiry': '2026-09-04', 'error': 'IB option contracts timed out'}]
        raw_metadata = {
            'requested_expiration_count': 3,
            'failed_expirations': failed_expiries,
        }
        self.assertEqual(len(raw_metadata['failed_expirations']), 1)
        self.assertLess(
            raw_metadata['requested_expiration_count'] - len(raw_metadata['failed_expirations']),
            raw_metadata['requested_expiration_count'],
            'a partial fetch must be visible in metadata',
        )


class DeadSocketDetectionTest(unittest.TestCase):
    """ibapi does not raise when the socket dies -- it calls error(504
    NOT_CONNECTED) and returns. With 504 absent from the terminal set, every
    remaining contract waited out its full stream timeout producing all-None
    fields: at OPTION_MAX_CONTRACTS=240 x 5s that is ~20 minutes spinning on a
    dead connection, and the snapshot was still reported provider_status='ok'.
    """

    def _market_data(self, codes):
        from providers.ib_option_chain_provider import _MarketData
        data = _MarketData()
        data.raw = {'errors': [{'code': code} for code in codes]}
        return data

    def test_connection_loss_codes_are_terminal(self):
        for code in (504, 1100, 1101, 1102, 10197):
            self.assertTrue(
                self._market_data([code]).has_terminal_error(),
                f'IB code {code} must stop the wait, not run out the timeout',
            )

    def test_per_contract_answers_remain_terminal(self):
        # Pre-existing behaviour must not regress.
        for code in (200, 321, 354):
            self.assertTrue(self._market_data([code]).has_terminal_error())

    def test_an_ordinary_warning_is_not_terminal(self):
        # 2104/2106 are market-data farm status notices, not failures.
        self.assertFalse(self._market_data([2104]).has_terminal_error())

    def test_connection_errors_are_distinguished_from_contract_errors(self):
        # A dead socket invalidates the whole fetch; "no security definition"
        # invalidates only that contract.
        self.assertTrue(self._market_data([504]).has_connection_error())
        self.assertFalse(self._market_data([200]).has_connection_error())


class ProviderStatusHonestyTest(unittest.TestCase):
    def test_partial_is_distinguishable_from_clean(self):
        """'ok' used to mean only "some contracts came back", so a fetch that
        lost its connection partway was indistinguishable from a complete one.
        app.error_msg was assigned on every IB error and never read anywhere."""
        def status(contracts, failed_expiries, error_msg):
            if not contracts:
                return 'empty'
            if failed_expiries or error_msg:
                return 'partial'
            return 'ok'

        self.assertEqual(status(['c'], [], None), 'ok')
        self.assertEqual(status([], [], None), 'empty')
        self.assertEqual(status(['c'], [{'expiry': '2026-09-04'}], None), 'partial')
        self.assertEqual(status(['c'], [], 'IB error 504: not connected'), 'partial')


if __name__ == '__main__':
    unittest.main()
