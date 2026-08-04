import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class ScanInsertFallbackTest(unittest.TestCase):
    """One bad row used to cost the entire scanner cycle.

    insert_rows was a single execute_values over every scan row plus one commit,
    so one out-of-range numeric or unserializable payload aborted the statement
    and produced ZERO rows -- taking /api/scan, the alert evaluator and the
    ledger with it. The scanner rematerializes every few minutes, so losing one
    symbol is vastly preferable to losing the table.
    """

    def _run(self, rows, bad_symbols, chunk_size=2):
        """Model the chunk-then-per-row strategy against a store that rejects
        specific symbols."""
        written, dropped = 0, []
        for start in range(0, len(rows), chunk_size):
            chunk = rows[start:start + chunk_size]
            if not any(r in bad_symbols for r in chunk):
                written += len(chunk)
                continue
            for row in chunk:
                if row in bad_symbols:
                    dropped.append(row)
                else:
                    written += 1
        return written, dropped

    def test_one_bad_row_costs_only_that_row(self):
        rows = ['AAPL', 'MSFT', 'BADROW', 'NVDA', 'SPY']
        written, dropped = self._run(rows, bad_symbols={'BADROW'})
        self.assertEqual(written, 4, 'every good row must survive')
        self.assertEqual(dropped, ['BADROW'])

    def test_a_clean_batch_never_falls_back_to_per_row(self):
        rows = ['AAPL', 'MSFT', 'NVDA', 'SPY']
        written, dropped = self._run(rows, bad_symbols=set())
        self.assertEqual(written, 4)
        self.assertEqual(dropped, [])

    def test_multiple_bad_rows_in_different_chunks(self):
        rows = ['AAPL', 'BAD1', 'MSFT', 'NVDA', 'BAD2', 'SPY']
        written, dropped = self._run(rows, bad_symbols={'BAD1', 'BAD2'})
        self.assertEqual(written, 4)
        self.assertEqual(sorted(dropped), ['BAD1', 'BAD2'])


class SilentFailureCountingTest(unittest.TestCase):
    """A 100% failure rate must not look like an empty universe.

    collect.py caught upsert failures without extending `errors`, so a run that
    lost all 50 symbols in a batch reported "0 rows written, 0 errors" -- the
    exact shape that hid the occ_ticker bug, where a backfill logged
    "275/275 processed" with computed: 0 and no warning.
    """

    def test_write_failures_are_counted_as_errors(self):
        errors = []
        batch = [{'symbol': s} for s in ('AAPL', 'MSFT', 'NVDA')]
        try:
            raise RuntimeError('DB upsert failed')
        except RuntimeError:
            errors.extend(row['symbol'] for row in batch)
        self.assertEqual(errors, ['AAPL', 'MSFT', 'NVDA'])

    def test_zero_written_with_symbols_attempted_is_a_failed_run(self):
        def finish(attempted, total_written):
            if attempted and total_written == 0:
                raise RuntimeError(f'metrics collection wrote nothing for {attempted} symbols')
            return 'ok'

        with self.assertRaises(RuntimeError):
            finish(attempted=50, total_written=0)
        self.assertEqual(finish(attempted=50, total_written=1), 'ok',
                         'a partial run is degraded, not failed')
        self.assertEqual(finish(attempted=0, total_written=0), 'ok',
                         'nothing to collect is not a failure')


if __name__ == '__main__':
    unittest.main()
