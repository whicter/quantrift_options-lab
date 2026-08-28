import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import schedule_option_refresh as sched  # noqa: E402

ET = ZoneInfo('America/New_York')


def at(day, hour, minute=0):
    """A 2026-08 weekday unless `day` lands on a weekend."""
    return datetime(2026, 8, day, hour, minute, tzinfo=ET)


class WindowBoundaryTests(unittest.TestCase):
    """The refresh cadence must know the market is shut.

    Measured 2026-08-28 over 48 hours: chain refreshes were FLAT across all 24
    hours -- 2812 inside 09:00-15:59 ET against 6875 outside, so 71% of the
    pipeline's entire workload ran while greeks, IV and open interest could not
    change.

    That was not merely wasteful. The pipeline was saturated: 73.4h of serial
    work per day, 24.5h of wall clock at concurrency 3, inside a 24-hour day.
    The wasted 71% was the reason there was no headroom.
    """

    def test_the_regular_session_keeps_the_normal_staleness_bar(self):
        for hour, minute in ((9, 30), (13, 0), (15, 59)):
            with self.subTest(hour=hour):
                window, max_age = sched.refresh_window(at(27, hour, minute))
                self.assertEqual(window, 'regular')
                self.assertEqual(max_age, sched.MAX_AGE_MINUTES)

    def test_the_open_and_close_are_half_open_boundaries(self):
        # 09:29 is not the session; 16:00 is not either. Off-by-one here either
        # drops the first minutes of trading or bills a whole extra pass.
        self.assertEqual(sched.refresh_window(at(27, 9, 29))[0], 'idle')
        self.assertEqual(sched.refresh_window(at(27, 9, 30))[0], 'regular')
        self.assertEqual(sched.refresh_window(at(27, 15, 59))[0], 'regular')
        self.assertEqual(sched.refresh_window(at(27, 16, 0))[0], 'idle')

    def test_overnight_and_weekends_are_idle(self):
        for label, when in (
            ('after settlement', at(27, 18, 0)),
            ('deep overnight', at(27, 2, 0)),
            ('Saturday midday', at(29, 11, 0)),
            ('Sunday midday', at(30, 11, 0)),
        ):
            with self.subTest(label):
                self.assertEqual(sched.refresh_window(when)[0], 'idle')

    def test_settlement_and_preopen_windows_exist(self):
        self.assertEqual(sched.refresh_window(at(27, 16, 30))[0], 'settlement')
        self.assertEqual(sched.refresh_window(at(27, 8, 30))[0], 'preopen')


class OnePassPerWindowTests(unittest.TestCase):
    """Outside the session the staleness bar is anchored, not fixed.

    A fixed max-age inside a one-hour window would let a symbol refreshed at
    16:20 qualify again at 17:00, turning a settlement pass into a small
    continuous sweep. Anchoring the bar to the close means "not refreshed since
    the close", which admits each symbol exactly once.
    """

    def test_the_settlement_bar_grows_with_time_since_the_close(self):
        self.assertEqual(sched.refresh_window(at(27, 16, 30))[1], 30)
        self.assertEqual(sched.refresh_window(at(27, 17, 10))[1], 70)

    def test_the_preopen_bar_is_anchored_to_the_window_start(self):
        self.assertEqual(sched.refresh_window(at(27, 8, 30))[1], 30)
        self.assertEqual(sched.refresh_window(at(27, 9, 0))[1], 60)

    def test_a_symbol_refreshed_after_the_close_is_not_selected_again(self):
        now_et = at(27, 17, 0)
        _, max_age = sched.refresh_window(now_et)
        now = now_et.astimezone(timezone.utc)
        picked = sched.select_candidates(
            symbols=['DONE', 'PENDING'],
            latest_snapshots={
                # refreshed at 16:20, i.e. after the close
                'DONE': now.replace(hour=20, minute=20),
                # last seen mid-session
                'PENDING': now.replace(hour=17, minute=0),
            },
            recent_jobs=set(),
            now=now,
            max_age_minutes=max_age,
            limit=10,
        )
        self.assertEqual(picked, ['PENDING'])


class SchedulerGateTests(unittest.TestCase):
    def test_an_idle_window_does_not_even_open_a_connection(self):
        # The early return is before psycopg2.connect on purpose: there is
        # nothing to decide, and a scheduler that connects every 300s all night
        # to conclude "nothing to do" is just a quieter version of the problem.
        with patch.object(sched, 'refresh_window', return_value=('idle', None)), \
             patch.object(sched, 'MARKET_HOURS_GATE_ENABLED', True), \
             patch('schedule_option_refresh.psycopg2.connect') as connect:
            result = sched.run()
        connect.assert_not_called()
        self.assertEqual(result['inserted'], 0)
        self.assertEqual(result['selected'], [])
        self.assertEqual(result['window'], 'idle')

    def test_the_gate_can_be_switched_off_without_a_code_change(self):
        # Kept as an escape hatch: if the window boundaries turn out to be wrong
        # in production, reverting behaviour must not require a deploy.
        with patch.object(sched, 'refresh_window', return_value=('idle', None)), \
             patch.object(sched, 'MARKET_HOURS_GATE_ENABLED', False), \
             patch('schedule_option_refresh.psycopg2.connect') as connect:
            connect.side_effect = RuntimeError('reached the database')
            with self.assertRaisesRegex(RuntimeError, 'reached the database'):
                sched.run()


class PerTierCadenceTests(unittest.TestCase):
    """Tiers must set cadence, not only queue order.

    The ladder existed but decided nothing. Every symbol shared one 60-minute
    staleness bar, so the whole universe became eligible inside the hour and the
    queue served all of it; priority only chose who went first inside a batch.
    Measured 2026-08-28 across 330 symbols: 13-23 refreshes a day for SPY and
    for the coldest ETF alike, mean 14.4. A ladder whose rungs all arrive at the
    same time is decoration.
    """

    def _pick(self, tier_max_age, ages_minutes):
        now = datetime(2026, 8, 28, 14, 0, tzinfo=timezone.utc)
        symbols = list(ages_minutes)
        snapshots = {
            sym: now - timedelta(minutes=age)
            for sym, age in ages_minutes.items()
        }
        tiers = {
            'SPY': sched.PRIORITY_CORE,
            'COLD': sched.PRIORITY_UNIVERSE_SCAN,
        }
        return sched.select_candidates(
            symbols=symbols, latest_snapshots=snapshots, recent_jobs=set(),
            now=now, max_age_minutes=60, limit=10,
            tiers=tiers, tier_max_age=tier_max_age,
        )

    def test_a_core_symbol_refreshes_while_a_scan_symbol_waits(self):
        # 40 minutes old: past core's 15-minute bar, far inside the scan tier's.
        picked = self._pick(sched.TIER_MAX_AGE_MINUTES, {'SPY': 40, 'COLD': 40})
        self.assertEqual(picked, ['SPY'])

    def test_a_scan_symbol_still_refreshes_once_it_passes_its_own_bar(self):
        picked = self._pick(sched.TIER_MAX_AGE_MINUTES, {'SPY': 200, 'COLD': 200})
        self.assertEqual(sorted(picked), ['COLD', 'SPY'])

    def test_without_tier_ages_every_symbol_shares_one_bar(self):
        # The pre-gate behaviour, and the semantic the settlement and pre-open
        # passes still need: one refresh for everyone, no fast lane.
        picked = self._pick(None, {'SPY': 90, 'COLD': 90})
        self.assertEqual(sorted(picked), ['COLD', 'SPY'])

    def test_the_core_tier_is_strictly_faster_than_the_scan_tier(self):
        # Guards the ordering of the constants themselves; swapping two numbers
        # in the table would otherwise silently starve the symbols people watch.
        self.assertLess(sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_CORE],
                        sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_RECENT_ACTIVE])
        self.assertLess(sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_RECENT_ACTIVE],
                        sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_UNIVERSE_SCAN])
        self.assertLess(sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_UNIVERSE_SCAN],
                        sched.TIER_MAX_AGE_MINUTES[sched.PRIORITY_COLD_BACKFILL])

if __name__ == '__main__':
    unittest.main()
