"""Squeeze capture: the parts that would silently corrupt the future sample."""
import unittest
from datetime import date, datetime, timezone

import capture_squeeze_watch as cap


class SummarizeUpsideTest(unittest.TestCase):
    def _map(self, points, window=20.0, max_pain=None):
        return {'points': points, 'window_pct': window, 'max_pain': max_pain}

    def test_only_strikes_above_spot_count_as_runway(self):
        m = self._map([
            {'strike': 90.0, 'call_oi': 9999, 'put_oi': 10},   # below spot: not fuel
            {'strike': 105.0, 'call_oi': 100, 'put_oi': 50},
            {'strike': 108.0, 'call_oi': 300, 'put_oi': 20},
        ])
        s = cap.summarize_upside(m, spot=100.0, window_pct=10)
        self.assertEqual(s['call_oi_above'], 400)
        self.assertEqual(s['strikes_above'], 2)
        self.assertEqual(s['top_strike'], 108.0)

    def test_window_excludes_far_tail(self):
        """Far OTM strikes carry stale OI and would dominate a raw sum."""
        m = self._map([
            {'strike': 105.0, 'call_oi': 100, 'put_oi': 10},
            {'strike': 150.0, 'call_oi': 99999, 'put_oi': 10},  # +50%, outside
        ])
        s = cap.summarize_upside(m, spot=100.0, window_pct=10)
        self.assertEqual(s['call_oi_above'], 100)
        self.assertEqual(s['top_strike'], 105.0)

    def test_spot_itself_is_not_above_spot(self):
        m = self._map([{'strike': 100.0, 'call_oi': 500, 'put_oi': 10}])
        s = cap.summarize_upside(m, spot=100.0, window_pct=10)
        self.assertEqual(s['call_oi_above'], 0)

    def test_undefined_ratios_are_null_not_zero(self):
        """A real zero and 'not computable' must stay distinguishable.

        These become calibration inputs; collapsing both to 0 would quietly
        teach the model that a chain with no puts is the same as one with
        balanced puts.
        """
        m = self._map([{'strike': 105.0, 'call_oi': 100, 'put_oi': 0}])
        s = cap.summarize_upside(m, spot=100.0, window_pct=10)
        self.assertIsNone(s['call_put_ratio_above'])
        self.assertIsNotNone(s['concentration'])

        empty = cap.summarize_upside(self._map([]), spot=100.0, window_pct=10)
        self.assertIsNone(empty['concentration'])
        self.assertIsNone(empty['distance_to_top_strike_pct'])

    def test_concentration_is_top_strike_share(self):
        m = self._map([
            {'strike': 105.0, 'call_oi': 250, 'put_oi': 10},
            {'strike': 106.0, 'call_oi': 750, 'put_oi': 10},
        ])
        s = cap.summarize_upside(m, spot=100.0, window_pct=10)
        self.assertAlmostEqual(s['concentration'], 0.75)
        self.assertAlmostEqual(s['distance_to_top_strike_pct'], 6.0)

    def test_missing_map_does_not_raise(self):
        s = cap.summarize_upside(None, spot=100.0)
        self.assertEqual(s['call_oi_above'], 0)


class CaptureRowTest(unittest.TestCase):
    def _record(self, **over):
        base = {
            'symbol': 'TEST',
            'snapshot_ts': datetime(2026, 8, 11, 20, 0, tzinfo=timezone.utc),
            'spot': 100.0,
            'oi_by_strike': {'points': [{'strike': 105.0, 'call_oi': 5000, 'put_oi': 500}],
                             'window_pct': 20.0, 'max_pain': 102.0},
            'gamma_regime': 'negative', 'gamma_flip': 99.0, 'call_wall': 105.0,
            'max_pain': None, 'gex_confidence': 'high',
            'unusual_oi_count': 7, 'oi_added': 1234,
        }
        base.update(over)
        return base

    def test_thin_chains_are_dropped(self):
        thin = self._record(oi_by_strike={'points': [{'strike': 105.0, 'call_oi': 5, 'put_oi': 1}],
                                          'window_pct': 20.0})
        self.assertEqual(cap.build_rows([thin]), [])

    def test_max_pain_falls_back_to_the_oi_map(self):
        """gex_history may have no max_pain; the wide OI map computes its own."""
        rows = cap.build_rows([self._record()])
        self.assertEqual(len(rows), 1)
        self.assertIn(102.0, rows[0])

    def test_row_carries_no_market_date(self):
        """persist() supplies the date, so a row cannot disagree with the run."""
        rows = cap.build_rows([self._record()])
        self.assertNotIn(date(2026, 8, 11), rows[0])
        self.assertEqual(rows[0][0], 'TEST')

    def test_model_version_is_recorded(self):
        rows = cap.build_rows([self._record()])
        self.assertIn(cap.MODEL_VERSION, rows[0])

    def test_gamma_regime_is_captured_but_never_filters(self):
        """The dealer sign in compute_gex may be inverted for this purpose, so
        a squeeze row must be captured regardless of regime."""
        for regime in ('negative', 'positive', 'near_zero', None):
            rows = cap.build_rows([self._record(gamma_regime=regime)])
            self.assertEqual(len(rows), 1, f'regime {regime} was filtered out')


if __name__ == '__main__':
    unittest.main()
