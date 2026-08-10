import unittest
from unittest.mock import MagicMock, patch

import manage_quote_watchlist as manage
import schedule_quote_refresh
import select_quote_watchlist as selector


def candidate(symbol, oi, dollar_volume=1e9, asset_type='stock', name=None):
    return (symbol, oi, dollar_volume, asset_type, name or f'{symbol} Inc')


class SelectionTests(unittest.TestCase):
    def test_ranks_by_option_open_interest_and_bounds_to_target(self):
        rows = [candidate(f'S{i}', 100_000 - i * 1000) for i in range(10)]
        picked, rejected = selector.rank_candidates(rows, target=3)
        self.assertEqual([p['symbol'] for p in picked], ['S0', 'S1', 'S2'])
        self.assertEqual([p['liquidity_rank'] for p in picked], [1, 2, 3])
        # A bounded list must say what it bounded away, or it reads as complete.
        self.assertEqual(rejected['over_target'], 7)

    def test_illiquid_options_and_illiquid_underlyings_are_separate_rejections(self):
        rows = [
            candidate('THIN', selector.MIN_TOTAL_OI - 1),
            candidate('QUIET', 500_000, dollar_volume=selector.MIN_DOLLAR_VOLUME - 1),
            candidate('GOOD', 500_000),
        ]
        picked, rejected = selector.rank_candidates(rows, target=10)
        self.assertEqual([p['symbol'] for p in picked], ['GOOD'])
        self.assertEqual(rejected['option_oi_below_floor'], 1)
        self.assertEqual(rejected['underlying_dollar_volume_below_floor'], 1)

    def test_thresholds_are_inclusive_at_the_boundary(self):
        rows = [candidate('EDGE', selector.MIN_TOTAL_OI, dollar_volume=selector.MIN_DOLLAR_VOLUME)]
        picked, _ = selector.rank_candidates(rows, target=10)
        self.assertEqual([p['symbol'] for p in picked], ['EDGE'])

    def test_leveraged_and_inverse_etfs_are_excluded(self):
        # A cash-secured put is a commitment to hold the underlying; a daily-reset
        # product is not something anyone intends to be assigned.
        rows = [
            candidate('SOXL', 900_000, asset_type='etf', name='Direxion Daily Semiconductor Bull 3X ETF'),
            candidate('SQQQ', 900_000, asset_type='etf', name='ProShares UltraPro Short QQQ'),
            candidate('SPXS', 900_000, asset_type='etf', name='Direxion Daily S&P 500 Bear 3x ETF'),
            candidate('SPY', 900_000, asset_type='etf', name='State Street SPDR S&P 500 ETF Trust'),
        ]
        picked, rejected = selector.rank_candidates(rows, target=10)
        self.assertEqual([p['symbol'] for p in picked], ['SPY'])
        self.assertEqual(rejected['leveraged_or_inverse'], 3)

    def test_leveraged_heuristic_does_not_fire_on_ordinary_company_names(self):
        # Observed live: 'Build-A-Bear Workshop' matches /bear/. Scoping the name
        # heuristic to ETFs is what keeps an ordinary stock out of the filter.
        rows = [candidate('BBW', 900_000, asset_type='stock', name='Build-A-Bear Workshop, Inc.')]
        picked, rejected = selector.rank_candidates(rows, target=10)
        self.assertEqual([p['symbol'] for p in picked], ['BBW'])
        self.assertNotIn('leveraged_or_inverse', rejected)


class SchedulerTests(unittest.TestCase):
    def test_never_quoted_symbols_sort_ahead_of_merely_stale_ones(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchall.return_value = [('NEW', None), ('OLD', 900.0), ('FRESH', 5.0)]
        stale = schedule_quote_refresh.stale_symbols(conn, ['NEW', 'OLD', 'FRESH'], max_age_minutes=360)
        self.assertEqual([s['symbol'] for s in stale], ['NEW', 'OLD'])
        self.assertIsNone(stale[0]['age_minutes'])

    def test_age_is_measured_only_against_snapshots_that_carried_quotes(self):
        # A Polygon positioning refresh writes a fresh chain with no bid/ask at
        # all. Measuring age against "latest snapshot" would count that as
        # recently quoted and permanently starve the symbol it just overwrote.
        self.assertIn('c.bid IS NOT NULL', schedule_quote_refresh.QUOTE_AGE_SQL)
        self.assertIn('c.bid > 0', schedule_quote_refresh.QUOTE_AGE_SQL)

    def test_background_priority_stays_below_on_demand(self):
        # analyze.js enqueues a user-visible symbol at 90; a 50-symbol sweep must
        # never queue ahead of the page somebody is looking at.
        self.assertLess(schedule_quote_refresh.BACKGROUND_PRIORITY, 90)

    def test_enqueue_is_capped_by_capacity_and_skips_active_duplicates(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.rowcount = 1
        candidates = [{'symbol': s, 'age_minutes': None} for s in ['A', 'B', 'C', 'D']]
        inserted = schedule_quote_refresh.enqueue(conn, candidates, capacity=2)
        self.assertEqual(inserted, 2)
        sql = cur.execute.call_args.args[0]
        self.assertIn('NOT EXISTS', sql)
        self.assertIn("status IN ('queued', 'running')", sql)

    def test_scheduler_refuses_to_enqueue_outside_the_regular_session(self):
        # Verified live on a Saturday: one symbol was still running at 197s and on
        # track for the full ~16 minute worst case, because with no quote stream
        # IB waits out its per-contract timeout instead of failing fast.
        with patch.object(schedule_quote_refresh, 'is_regular_us_session', return_value=False):
            result = schedule_quote_refresh.run()
        self.assertEqual(result['status'], 'market_closed')
        self.assertEqual(result['enqueued'], 0)


class ManageCliTests(unittest.TestCase):
    def test_symbols_are_normalised_and_validated(self):
        good, bad = manage.validate(['spcx', ' ONDS ', 'BRK.B'])
        self.assertEqual(good, ['SPCX', 'ONDS', 'BRK.B'])
        self.assertEqual(bad, [])

    def test_invalid_tickers_are_reported_rather_than_silently_dropped(self):
        good, bad = manage.validate(['AAPL', 'not a ticker', '123', ''])
        self.assertEqual(good, ['AAPL'])
        self.assertEqual(len(bad), 3)

    def test_dry_run_writes_nothing(self):
        conn = MagicMock()
        result = manage.apply_flags(
            conn, ['SPCX'], pinned=False, excluded=True, origin='manual', dry_run=True,
        )
        self.assertTrue(result['dry_run'])
        conn.cursor.assert_not_called()

    def test_override_upserts_so_a_symbol_can_be_excluded_before_it_ever_ranks(self):
        # Recording the decision early is the point: a name that becomes liquid
        # months later must stay out without anyone noticing and re-excluding it.
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.rowcount = 1
        manage.apply_flags(conn, ['NEWCO'], pinned=False, excluded=True, origin='manual', dry_run=False)
        sql = cur.execute.call_args.args[0]
        self.assertIn('INSERT INTO quote_watchlist', sql)
        self.assertIn('ON CONFLICT (symbol) DO UPDATE', sql)

    def test_every_command_states_its_consequence(self):
        # The table governs IB quote time only; a user must not have to guess
        # whether excluding a symbol also stops it being scanned.
        for command in ('exclude', 'pin', 'reset'):
            self.assertIn(command, manage.CONSEQUENCE)
            self.assertTrue(manage.CONSEQUENCE[command].strip())
        self.assertIn('symbol_universe', manage.CONSEQUENCE['exclude'])


if __name__ == '__main__':
    unittest.main()
