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


class QueueFillTests(unittest.TestCase):
    """The scheduler fills to a target queue depth instead of a fixed 2 per
    cycle. Depth bounds provider load; the per-cycle cap only limits refill rate."""

    def test_fill_count_tops_up_to_the_target(self):
        self.assertEqual(schedule_option_refresh.fill_count(0, queue_target=20, max_per_cycle=20), 20)
        self.assertEqual(schedule_option_refresh.fill_count(15, queue_target=20, max_per_cycle=20), 5)

    def test_a_full_queue_enqueues_nothing(self):
        self.assertEqual(schedule_option_refresh.fill_count(20, queue_target=20, max_per_cycle=20), 0)

    def test_an_over_full_queue_never_returns_negative_capacity(self):
        # A burst of on-demand jobs can exceed the target. That must idle the
        # sweep, not wrap around into a negative limit.
        self.assertEqual(schedule_option_refresh.fill_count(50, queue_target=20, max_per_cycle=20), 0)

    def test_per_cycle_cap_bounds_a_drained_queue(self):
        self.assertEqual(schedule_option_refresh.fill_count(0, queue_target=100, max_per_cycle=20), 20)


class PriorityTierTests(unittest.TestCase):
    def test_core_symbols_outrank_universe_and_cold_backfill(self):
        tiers = schedule_option_refresh.assign_tiers(
            ['ZZZZ', 'SPY', 'NFLX'], scan_enabled={'NFLX', 'SPY'}, recent_active=set(),
        )
        self.assertEqual(tiers['SPY'], schedule_option_refresh.PRIORITY_CORE)
        self.assertEqual(tiers['NFLX'], schedule_option_refresh.PRIORITY_UNIVERSE_SCAN)
        self.assertEqual(tiers['ZZZZ'], schedule_option_refresh.PRIORITY_COLD_BACKFILL)

    def test_recently_analyzed_symbol_outranks_the_plain_universe(self):
        tiers = schedule_option_refresh.assign_tiers(
            ['NFLX', 'AMD'], scan_enabled={'NFLX', 'AMD'}, recent_active={'AMD'},
        )
        self.assertEqual(tiers['AMD'], schedule_option_refresh.PRIORITY_RECENT_ACTIVE)
        self.assertEqual(tiers['NFLX'], schedule_option_refresh.PRIORITY_UNIVERSE_SCAN)

    def test_background_tiers_never_outrank_an_on_demand_request(self):
        # The API enqueues user requests at 100 and the worker claims by
        # priority. A sweep that matched it would make a waiting user queue
        # behind cold backfill.
        for priority in (
            schedule_option_refresh.PRIORITY_CORE,
            schedule_option_refresh.PRIORITY_RECENT_ACTIVE,
            schedule_option_refresh.PRIORITY_UNIVERSE_SCAN,
            schedule_option_refresh.PRIORITY_COLD_BACKFILL,
        ):
            self.assertLess(priority, schedule_option_refresh.PRIORITY_USER_REQUESTED)

    def test_higher_tier_wins_over_older_data(self):
        # Staleness orders within a tier; it must not promote across tiers.
        now = datetime(2026, 7, 17, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['OLD1', 'SPY'],
            {
                'OLD1': now - timedelta(days=5),
                'SPY': now - timedelta(minutes=90),
            },
            set(), now, max_age_minutes=60, limit=1,
            tiers={'SPY': schedule_option_refresh.PRIORITY_CORE,
                   'OLD1': schedule_option_refresh.PRIORITY_COLD_BACKFILL},
        )
        self.assertEqual(selected, ['SPY'])

    def test_within_a_tier_missing_data_still_comes_first(self):
        now = datetime(2026, 7, 17, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['STALE1', 'MISSING1'],
            {'STALE1': now - timedelta(minutes=90)},
            set(), now, max_age_minutes=60, limit=2,
            tiers={'STALE1': schedule_option_refresh.PRIORITY_UNIVERSE_SCAN,
                   'MISSING1': schedule_option_refresh.PRIORITY_UNIVERSE_SCAN},
        )
        self.assertEqual(selected, ['MISSING1', 'STALE1'])

    def test_no_tiers_preserves_the_previous_ordering(self):
        now = datetime(2026, 7, 17, 18, 0, tzinfo=timezone.utc)
        selected = schedule_option_refresh.select_candidates(
            ['AAPL', 'SPY', 'QQQ'],
            {'AAPL': now - timedelta(minutes=90), 'SPY': now - timedelta(minutes=120)},
            set(), now, max_age_minutes=60, limit=2,
        )
        self.assertEqual(selected, ['QQQ', 'SPY'])


class EnqueuePriorityTests(unittest.TestCase):
    def test_enqueued_job_carries_its_tier_priority(self):
        conn = _RecordingConn()
        schedule_option_refresh.enqueue_candidates(
            conn, ['SPY'], {'SPY': schedule_option_refresh.PRIORITY_CORE},
        )

        params = conn.executed[0][1]
        payload = params[2].adapted
        self.assertEqual(payload['priority'], schedule_option_refresh.PRIORITY_CORE)
        self.assertEqual(payload['tier'], 'core')

    def test_untiered_symbol_defaults_to_universe_scan_not_user_priority(self):
        conn = _RecordingConn()
        schedule_option_refresh.enqueue_candidates(conn, ['NFLX'])

        payload = conn.executed[0][1][2].adapted
        self.assertEqual(payload['priority'], schedule_option_refresh.PRIORITY_UNIVERSE_SCAN)


class _RecordingCursor:
    def __init__(self, owner):
        self._owner = owner
        self.rowcount = 1

    def execute(self, sql, params=None):
        self._owner.executed.append((sql, params))

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class _RecordingConn:
    def __init__(self):
        self.executed = []

    def cursor(self):
        return _RecordingCursor(self)

    def commit(self):
        return None
