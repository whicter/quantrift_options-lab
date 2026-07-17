import unittest
from datetime import datetime, timedelta, timezone

import schedule_option_refresh


class OptionRefreshSchedulerTests(unittest.TestCase):
    def test_quote_missing_symbol_is_selected_as_missing_before_fresh_quoted_data(self):
        now = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['RKLB', 'SPY'],
            {'SPY': now - timedelta(minutes=10)},
            set(), now, max_age_minutes=60, limit=2,
        )
        self.assertEqual(selected, ['RKLB'])

    def test_missing_symbols_are_selected_before_stale_symbols(self):
        now = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['AAPL', 'SPY', 'QQQ'],
            {
                'AAPL': now - timedelta(minutes=90),
                'SPY': now - timedelta(minutes=120),
            },
            set(),
            now,
            max_age_minutes=60,
            limit=2,
        )
        self.assertEqual(selected, ['QQQ', 'SPY'])

    def test_fresh_and_recently_attempted_symbols_are_skipped(self):
        now = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['AAPL', 'SPY', 'QQQ'],
            {
                'AAPL': now - timedelta(minutes=10),
                'SPY': now - timedelta(minutes=90),
            },
            {'SPY'},
            now,
            max_age_minutes=60,
            limit=5,
        )
        self.assertEqual(selected, ['QQQ'])

    def test_oldest_stale_snapshot_is_selected_first(self):
        now = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['AAPL', 'SPY'],
            {
                'AAPL': now - timedelta(minutes=70),
                'SPY': now - timedelta(minutes=120),
            },
            set(),
            now,
            max_age_minutes=60,
            limit=1,
        )
        self.assertEqual(selected, ['SPY'])


if __name__ == '__main__':
    unittest.main()
