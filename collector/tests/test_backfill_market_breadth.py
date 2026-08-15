import unittest
from datetime import date
from unittest.mock import patch

import backfill_market_breadth as bf


class WeekdayRangeTests(unittest.TestCase):
    def test_weekends_are_excluded(self):
        # 2026-08-15 is a Saturday, 16th a Sunday.
        days = bf.weekday_range(date(2026, 8, 13), date(2026, 8, 17))
        self.assertEqual(days, [date(2026, 8, 17), date(2026, 8, 14), date(2026, 8, 13)])

    def test_newest_first(self):
        """An interrupted run must leave a stretch adjacent to existing data.

        The table is appended forward daily, so filling oldest-first would strand
        whatever completes as an island with a hole between it and the live rows.
        Newest-first keeps every partial result contiguous and usable.
        """
        days = bf.weekday_range(date(2026, 8, 10), date(2026, 8, 14))
        self.assertEqual(days[0], date(2026, 8, 14))
        self.assertEqual(days[-1], date(2026, 8, 10))

    def test_single_day_range_is_inclusive(self):
        self.assertEqual(bf.weekday_range(date(2026, 8, 14), date(2026, 8, 14)),
                         [date(2026, 8, 14)])

    def test_inverted_range_is_empty_rather_than_looping(self):
        self.assertEqual(bf.weekday_range(date(2026, 8, 14), date(2026, 8, 10)), [])


class ResumeTests(unittest.TestCase):
    """Stored sessions are skipped, which is what makes re-invocation a resume."""

    def _run(self, stored, calls, **kwargs):
        with patch.object(bf, 'psycopg2'), \
             patch.object(bf, 'existing_dates', return_value=stored), \
             patch.object(bf.breadth, 'run', side_effect=calls) as run_mock:
            result = bf.run(date(2026, 8, 10), date(2026, 8, 14), **kwargs)
        return result, run_mock

    def test_already_stored_sessions_are_not_refetched(self):
        stored = {date(2026, 8, 14), date(2026, 8, 13), date(2026, 8, 12)}
        result, run_mock = self._run(
            stored,
            [{'status': 'written', 'market_date': '2026-08-11'},
             {'status': 'written', 'market_date': '2026-08-10'}],
        )
        self.assertEqual(result['requested'], 2)
        self.assertEqual(result['written'], 2)
        asked = [c.kwargs['target_date'] for c in run_mock.call_args_list]
        self.assertEqual(asked, [date(2026, 8, 11), date(2026, 8, 10)])

    def test_a_walked_back_holiday_counts_as_skipped_not_written(self):
        """The collector resolves a closed session to the prior trading day.

        That write is correct but is not the date requested, so counting it as
        written would report progress the range never made and hide a holiday as
        a filled slot.
        """
        result, _ = self._run(
            {date(2026, 8, 14), date(2026, 8, 13), date(2026, 8, 12), date(2026, 8, 11)},
            [{'status': 'written', 'market_date': '2026-08-07'}],
        )
        self.assertEqual(result['written'], 0)
        self.assertEqual(result['skipped'], 1)

    def test_one_failed_session_does_not_end_the_run(self):
        result, run_mock = self._run(
            {date(2026, 8, 14), date(2026, 8, 13), date(2026, 8, 12)},
            [RuntimeError('provider blew up'), {'status': 'written', 'market_date': '2026-08-10'}],
        )
        self.assertEqual(result['failed'], 1)
        self.assertEqual(result['written'], 1)
        self.assertEqual(run_mock.call_count, 2)

    def test_limit_caps_one_invocation_without_changing_the_range(self):
        result, run_mock = self._run(
            set(),
            [{'status': 'written', 'market_date': '2026-08-14'}],
            limit=1,
        )
        self.assertEqual(result['requested'], 1)
        self.assertEqual(run_mock.call_count, 1)

    def test_dry_run_touches_no_provider(self):
        with patch.object(bf, 'psycopg2'), \
             patch.object(bf, 'existing_dates', return_value=set()), \
             patch.object(bf.breadth, 'run') as run_mock:
            result = bf.run(date(2026, 8, 10), date(2026, 8, 14), dry_run=True)
        self.assertEqual(result['status'], 'dry_run')
        run_mock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
