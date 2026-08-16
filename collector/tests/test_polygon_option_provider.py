import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from providers.polygon_option_chain_provider import PolygonOptionChainProvider, build_term_structure
from providers.base import OptionContractSnapshot


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def _spans_full_dte_window(params):
    """True when a request covers the whole min_dte..max_dte range.

    Bucket requests each cover a slice; the term-structure and OI-by-strike
    fetches cover the entire window. Comparing the requested span against the
    provider default (0..90 days) separates them without depending on call order.
    """
    if not params:
        return False
    lo, hi = params.get('expiration_date.gte'), params.get('expiration_date.lte')
    if not lo or not hi:
        return False
    from datetime import date as _date
    span = (_date.fromisoformat(hi) - _date.fromisoformat(lo)).days
    return span >= 80


class FakeSession:
    """Queue-driven fake, with chain requests routed by their expiry window.

    The main chain is now fetched once per DTE bucket instead of as one
    paginated sweep, so a fixture that hands out responses purely in call order
    breaks: the term-structure and OI-by-strike calls start receiving payloads
    queued for a bucket. Both enrichment fetches ask for the FULL min_dte..max_dte
    window while every bucket asks for a narrow slice of it, so `full_window`
    routes them explicitly and the queue stays for chain requests only.

    Tests that do not care keep passing a plain list and are unaffected.
    """

    def __init__(self, responses, intraday=None, raise_on_exhaust=False, full_window=None,
                 full_window_error=None):
        self.headers = {}
        self.responses = list(responses)
        self.raise_on_exhaust = raise_on_exhaust
        # Responses for requests spanning the whole DTE window (term structure,
        # OI-by-strike), served in order, independent of the chain queue.
        self.full_window = list(full_window or [])
        # Raised for any full-window request, to exercise enrichment-failure
        # fallbacks without depending on the queue running dry at the right call.
        self.full_window_error = full_window_error
        # fetch_underlying now always probes a delayed intraday minute bar first.
        # Route that call separately (default: empty -> caller falls back to the
        # daily-close hint or /prev) so existing per-endpoint response lists stay
        # valid. Tests exercising the intraday path pass an explicit payload.
        self.intraday = intraday if intraday is not None else {'status': 'OK', 'results': []}
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if '/range/1/minute/' in url:
            return FakeResponse(self.intraday)
        if _spans_full_dte_window(params):
            if self.full_window_error is not None:
                raise self.full_window_error
        if self.full_window and _spans_full_dte_window(params):
            return FakeResponse(self.full_window.pop(0))
        if not self.responses:
            if self.raise_on_exhaust:
                raise IndexError('FakeSession exhausted')
            return FakeResponse({'status': 'OK', 'results': []})
        return FakeResponse(self.responses.pop(0))


def option_item(expiry, right, strike=100):
    contract_type = 'call' if right == 'C' else 'put'
    return {
        'details': {
            'expiration_date': expiry.isoformat(),
            'strike_price': strike,
            'contract_type': contract_type,
            'ticker': f'O:TEST{expiry.strftime("%y%m%d")}{right}00100000',
        },
        'implied_volatility': 0.3,
        'greeks': {'delta': 0.2 if right == 'C' else -0.2, 'gamma': 0.02, 'theta': -0.01, 'vega': 0.1},
        'last_quote': {'bid': 1.0, 'ask': 1.2},
        'open_interest': 100,
        'day': {'volume': 10, 'close': 1.1},
    }


class PolygonOptionProviderTests(unittest.TestCase):
    def test_each_dte_bucket_is_requested_with_its_own_expiry_window(self):
        """Replaces the 30-45 supplement, which patched one case of this bug.

        Polygon returns contracts in expiry order, so one count-bounded sweep
        over the whole window never reaches the far months on a weekly-dense
        symbol -- measured on QQQ, 750 results across 3 pages covered 4 expiries
        all inside four days. The old fix re-requested a hard-coded 30-45 window
        when that band came back empty; every bucket now gets its own query, so
        the special case is gone and 91-120 or 121-150 work for the same reason
        30-45 did.
        """
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        session = FakeSession(
            [
                {'status': 'OK', 'results': [{'c': 100}]},
                # 0-14 bucket
                {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
                # 15-29 bucket: nothing listed there
                {'status': 'OK', 'results': []},
                # 30-45 bucket -- reached by its own request, not by a supplement
                {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            ],
            full_window=[
                {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
                {'status': 'OK', 'results': []},
            ],
        )
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        dtes = {(contract.expiry - today).days for contract in snapshot.contracts}
        self.assertEqual(dtes, {2, 35})

        # Every configured bucket is asked for by its own window, and no request
        # spans the whole range except the enrichment fetches.
        chain_calls = [
            c for c in session.calls
            if '/v3/snapshot/options/' in c[0] and not _spans_full_dte_window(c[1])
        ]
        windows = {
            ((date.fromisoformat(c[1]['expiration_date.gte']) - today).days,
             (date.fromisoformat(c[1]['expiration_date.lte']) - today).days)
            for c in chain_calls
        }
        self.assertIn((0, 14), windows)
        self.assertIn((30, 45), windows)

    def test_a_bucket_cut_mid_expiry_drops_the_partial_expiry(self):
        """The page backstop must never emit a one-sided strike set.

        Polygon returns an expiry as all calls ascending by strike, then all puts
        ascending, so a cut inside an expiry removes one right's high strikes
        entirely. In production the 250-row cap landed inside the FIRST expiry of
        every dense bucket -- SPY 2026-11-30 came back with 137 complete calls and
        19 puts stopping 94 points below spot -- which is what pushed upside wall
        coverage under its floor. One fewer expiry is the honest outcome; a
        half-fetched one biases coverage silently.
        """
        today = date.today()
        near = today + timedelta(days=2)
        far = today + timedelta(days=9)
        session = FakeSession(
            [
                {'status': 'OK', 'results': [{'c': 100}]},
                {
                    'status': 'OK',
                    'results': [
                        option_item(near, 'C', 95), option_item(near, 'P', 105),
                        # `far` has only begun -- its puts are on the next page.
                        option_item(far, 'C', 90), option_item(far, 'C', 91),
                    ],
                    'next_url': 'https://api.polygon.io/v3/snapshot/options/TEST?cursor=x',
                },
            ],
            full_window=[{'status': 'OK', 'results': []}, {'status': 'OK', 'results': []}],
        )
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_DTE_BUCKETS': '0-14',
            'OPTION_MAX_DTE': '14',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '2',
            'OPTION_MAX_CONTRACTS_PER_BUCKET': '4',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        expiries = {c.expiry for c in snapshot.contracts}
        self.assertEqual(expiries, {near}, 'the partial expiry was kept')
        rights = {c.right for c in snapshot.contracts}
        self.assertEqual(rights, {'C', 'P'}, 'surviving expiry must stay two-sided')

    def test_term_structure_uses_a_narrow_dedicated_fetch(self):
        # The dedicated ATM fetch uses a narrow strike window and spans every
        # expiry it returns, independent of the bucket-trimmed stored chain.
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        far_expiry = today + timedelta(days=60)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ], full_window=[
            # dedicated term-structure fetch returns THREE expiries at the ATM
            # strike; routed by its full-window span, not by call position.
            {'status': 'OK', 'results': [
                option_item(short_expiry, 'C'), option_item(short_expiry, 'P'),
                option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P'),
                option_item(far_expiry, 'C'), option_item(far_expiry, 'P'),
            ]},
        ])
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'OPTION_TERM_STRUCTURE_STRIKE_PCT': '4',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        ts_dtes = {row['dte'] for row in snapshot.term_structure}
        self.assertEqual(ts_dtes, {2, 35, 60})
        # the dedicated term-structure fetch used the narrow ±4% window; identify
        # it by that window (a later OI-by-strike fetch uses a wider window).
        ts_calls = [c for c in session.calls
                    if '/v3/snapshot/options/' in c[0] and c[1] and c[1].get('strike_price.gte') == round(100 * 0.96, 4)]
        self.assertTrue(ts_calls)

    def test_term_structure_falls_back_to_main_chain_on_fetch_error(self):
        # If the dedicated fetch fails, the snapshot still ships with a term
        # structure derived from the main chain rather than failing.
        today = date.today()
        short_expiry = today + timedelta(days=2)
        atm_expiry = today + timedelta(days=35)
        # Fail the full-window fetch explicitly rather than by exhausting the
        # queue. Exhaustion used to coincide with the term-structure call, but
        # bucket requests now consume the queue first, so the raise landed on the
        # main chain and the test stopped exercising the fallback at all.
        session = FakeSession(
            [
                {'status': 'OK', 'results': [{'c': 100}]},
                {'status': 'OK', 'results': [option_item(short_expiry, 'C'), option_item(short_expiry, 'P')]},
                {'status': 'OK', 'results': []},
                {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            ],
            full_window_error=RuntimeError('term structure fetch failed'),
        )
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            provider = PolygonOptionChainProvider()
            snapshot = provider.fetch_option_chain('TEST')

        # fallback derives from the main-chain parsed contracts (2 and 35 DTE)
        self.assertEqual({row['dte'] for row in snapshot.term_structure}, {2, 35})


class BuildTermStructureTests(unittest.TestCase):
    def _c(self, expiry, right, strike, iv):
        return OptionContractSnapshot(
            symbol='T', expiry=expiry, strike=strike, right=right,
            bid=1.0, ask=1.1, last=1.0, mark=1.05, volume=1, open_interest=1, iv=iv,
            delta=None, gamma=None, theta=None, vega=None, rho=None,
        )

    def test_picks_nearest_strike_and_averages_call_put(self):
        today = date.today()
        e = today + timedelta(days=30)
        contracts = [
            self._c(e, 'C', 100, 0.30), self._c(e, 'P', 100, 0.34),
            self._c(e, 'C', 120, 0.50),  # farther strike ignored for ATM
        ]
        rows = build_term_structure(contracts, spot=101, today=today)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['atm_strike'], 100)
        self.assertAlmostEqual(rows[0]['atm_iv'], 0.32)
        self.assertEqual(rows[0]['dte'], 30)

    def test_skips_expiries_without_positive_iv_and_sorts(self):
        today = date.today()
        e1 = today + timedelta(days=10)
        e2 = today + timedelta(days=40)
        contracts = [
            self._c(e2, 'C', 100, 0.40),
            self._c(e1, 'C', 100, 0.0),  # no positive IV -> skipped
        ]
        rows = build_term_structure(contracts, spot=100, today=today)
        self.assertEqual([r['dte'] for r in rows], [40])

    def test_empty_inputs(self):
        self.assertEqual(build_term_structure([], 100), [])
        self.assertEqual(build_term_structure([self._c(date.today(), 'C', 100, 0.3)], 0), [])


if __name__ == '__main__':
    unittest.main()


class SpotHintTests(unittest.TestCase):
    """A fresh daily close from the database is an equally good previous-day
    spot, so passing it must remove the /prev request entirely."""

    def _provider(self, session, **extra_env):
        env = {
            'POLYGON_API_KEY': 'test-key',
            'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0',
            'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
            'PROVIDER_RATE_LIMIT_BACKEND': 'file',
            **extra_env,
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            return PolygonOptionChainProvider()

    def test_spot_hint_skips_the_prev_aggregate_request(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        # No /prev payload queued: if the provider asked for it, .pop(0) would
        # hand back the option page and the test would fail on the DTE window.
        session = FakeSession([
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        snapshot = provider.fetch_option_chain('TEST', spot_hint=100.0)

        prev_calls = [call for call in session.calls if '/prev' in call[0]]
        self.assertEqual(prev_calls, [])
        self.assertEqual(float(snapshot.underlying.price), 100.0)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'db_spot_hint')

    def test_no_hint_still_fetches_prev(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        provider.fetch_option_chain('TEST')

        prev_calls = [call for call in session.calls if '/prev' in call[0]]
        self.assertEqual(len(prev_calls), 1)

    def test_intraday_delayed_price_beats_a_daily_close_hint_when_enabled(self):
        # With the entitlement flag on, the delayed intraday bar is fresher than
        # any daily close and must win even when a spot_hint is supplied.
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession(
            [{'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
             {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]}],
            intraday={'status': 'DELAYED', 'results': [{'c': 381.82, 't': 1_800_000_000_000}]},
        )
        provider = self._provider(session, OPTION_INTRADAY_SPOT_ENABLED='true')
        snapshot = provider.fetch_option_chain('TEST', spot_hint=391.06)

        self.assertEqual(float(snapshot.underlying.price), 381.82)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'intraday_1m_delayed')
        self.assertIn('as_of', snapshot.underlying.raw)
        self.assertEqual([c for c in session.calls if '/prev' in c[0]], [])

    def test_intraday_is_not_requested_when_disabled(self):
        # Default (unentitled) plan: the minute endpoint must not even be called,
        # so there is no wasted NOT_AUTHORIZED request per symbol per refresh.
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession(
            [{'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
             {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]}],
            intraday={'status': 'DELAYED', 'results': [{'c': 381.82, 't': 1_800_000_000_000}]},
        )
        provider = self._provider(session)  # flag defaults to off
        snapshot = provider.fetch_option_chain('TEST', spot_hint=391.06)

        self.assertEqual(float(snapshot.underlying.price), 391.06)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'db_spot_hint')
        self.assertEqual([c for c in session.calls if '/range/1/minute/' in c[0]], [])

    def test_unauthorized_intraday_falls_back_to_hint_without_raising(self):
        # Even with the flag on, a NOT_AUTHORIZED status must degrade to the
        # daily-close hint, not raise.
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession(
            [{'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
             {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]}],
            intraday={'status': 'NOT_AUTHORIZED', 'results': []},
        )
        provider = self._provider(session, OPTION_INTRADAY_SPOT_ENABLED='true')
        snapshot = provider.fetch_option_chain('TEST', spot_hint=391.06)

        self.assertEqual(float(snapshot.underlying.price), 391.06)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'db_spot_hint')

    def test_off_hours_no_intraday_and_no_hint_falls_to_prev(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession(
            [{'status': 'OK', 'results': [{'c': 380.84}]},  # /prev prior close
             {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
             {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]}],
            intraday={'status': 'OK', 'results': []},  # no bars today (off-hours)
        )
        provider = self._provider(session)
        snapshot = provider.fetch_option_chain('TEST')

        self.assertEqual(float(snapshot.underlying.price), 380.84)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'prev_agg')

    def test_ib_intraday_spot_beats_hint_and_prev_and_records_provenance(self):
        # P2.1: a caller-supplied in-session IB spot wins over a daily-close hint,
        # and its origin is recorded in raw_metadata even though the snapshot
        # source stays polygon_licensed.
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        snapshot = provider.fetch_option_chain(
            'TEST', spot_hint=100.0,
            intraday_spot={'price': 374.43, 'source': 'ib_internal', 'as_of': '2026-07-20T14:22:00+00:00'},
        )

        # IB price won, not the 100.0 hint; no /prev requested.
        self.assertEqual(float(snapshot.underlying.price), 374.43)
        self.assertEqual([c for c in session.calls if '/prev' in c[0]], [])
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'ib_intraday_last')
        self.assertEqual(snapshot.source, 'polygon_licensed')  # options are still Polygon
        self.assertEqual(snapshot.raw_metadata['underlying_source'], 'ib_internal')
        self.assertEqual(snapshot.raw_metadata['underlying_endpoint'], 'ib_intraday_last')

    def test_invalid_ib_intraday_spot_falls_back_to_hint(self):
        today = date.today()
        atm_expiry = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
            {'status': 'OK', 'results': [option_item(atm_expiry, 'C'), option_item(atm_expiry, 'P')]},
        ])
        provider = self._provider(session)
        snapshot = provider.fetch_option_chain(
            'TEST', spot_hint=100.0, intraday_spot={'price': 0, 'source': 'ib_internal'},
        )
        self.assertEqual(float(snapshot.underlying.price), 100.0)
        self.assertEqual(snapshot.underlying.raw.get('endpoint'), 'db_spot_hint')


class AdaptiveOiWindowTests(unittest.TestCase):
    def test_window_scales_with_iv_and_clamps(self):
        from providers.polygon_option_chain_provider import adaptive_oi_window_pct
        # low IV -> clamped up to the floor; high IV -> clamped to the cap
        spy = adaptive_oi_window_pct(742, 0.15, 90, min_pct=8, max_pct=60)
        tsla = adaptive_oi_window_pct(370, 0.48, 90, min_pct=8, max_pct=60)
        soxl = adaptive_oi_window_pct(137, 1.89, 90, min_pct=8, max_pct=60)
        self.assertLess(spy, tsla)          # SPY narrower than TSLA
        self.assertLess(tsla, soxl)
        self.assertGreaterEqual(spy, 8)     # floor
        self.assertLessEqual(soxl, 60)      # cap
        # missing IV uses the default, not a crash
        self.assertGreater(adaptive_oi_window_pct(100, None, 30, default_iv=0.4), 0)

    def test_build_oi_by_strike_aggregates_calls_and_puts(self):
        from providers.polygon_option_chain_provider import build_oi_by_strike
        from providers.base import OptionContractSnapshot
        def c(strike, right, oi):
            return OptionContractSnapshot(symbol='T', expiry=date.today(), strike=strike, right=right,
                bid=None, ask=None, last=None, mark=None, volume=None, open_interest=oi,
                iv=None, delta=None, gamma=None, theta=None, vega=None, rho=None)
        rows = build_oi_by_strike([c(100,'C',5), c(100,'P',7), c(105,'C',3), c(95,'P',9)], spot=100)
        self.assertEqual([r['strike'] for r in rows], [95, 100, 105])   # sorted
        atm = next(r for r in rows if r['strike'] == 100)
        self.assertEqual((atm['call_oi'], atm['put_oi'], atm['total_oi']), (5, 7, 12))

    def test_max_pain_from_full_oi_beats_a_near_money_slice(self):
        from providers.polygon_option_chain_provider import max_pain_from_oi
        # Heavy put OI far below spot pulls max pain down; a near-money-only view
        # would miss it. Max pain = strike minimizing total intrinsic payout.
        wide = [
            {'strike': 350, 'call_oi': 100, 'put_oi': 40000},
            {'strike': 375, 'call_oi': 5000, 'put_oi': 5000},
            {'strike': 400, 'call_oi': 20000, 'put_oi': 100},
        ]
        self.assertEqual(max_pain_from_oi(wide), 375)
        self.assertIsNone(max_pain_from_oi([]))


class OiByStrikeSnapshotTests(unittest.TestCase):
    def _provider(self, session, **extra_env):
        env = {
            'POLYGON_API_KEY': 'test-key', 'OPTION_MAX_EXPIRATIONS_PER_BUCKET': '1',
            'POLYGON_REQUEST_DELAY': '0', 'POLYGON_STOCK_REQUEST_DELAY': '0',
            'POLYGON_STOCK_RATE_LIMIT_FILE': '/tmp/quantrift_polygon_option_provider_test',
            **extra_env,
        }
        with patch.dict(os.environ, env, clear=False), \
             patch('providers.polygon_option_chain_provider.requests.Session', return_value=session):
            return PolygonOptionChainProvider()

    def test_snapshot_carries_wide_oi_and_max_pain(self):
        today = date.today()
        e = today + timedelta(days=35)
        def oi(strike, right, n):
            it = option_item(e, right, strike); it['open_interest'] = n; return it
        session = FakeSession(
            [
                {'status': 'OK', 'results': [{'c': 100}]},                       # /prev
                # per-bucket chain requests; only the 30-45 bucket has contracts
                {'status': 'OK', 'results': []},
                {'status': 'OK', 'results': []},
                {'status': 'OK', 'results': [option_item(e, 'C'), option_item(e, 'P')]},
            ],
            full_window=[
                # term structure, then the dedicated OI fetch: wide strikes with
                # real OI. Both span the whole window, so they are routed by that
                # rather than by how many bucket requests preceded them.
                {'status': 'OK', 'results': [option_item(e, 'C'), option_item(e, 'P')]},
                {'status': 'OK', 'results': [oi(90,'P',400), oi(100,'C',50), oi(100,'P',60), oi(110,'C',300)]},
            ],
        )
        provider = self._provider(session)
        snap = provider.fetch_option_chain('TEST', spot_hint=100.0, iv_hint=0.4)
        self.assertIsNotNone(snap.oi_by_strike)
        self.assertTrue(snap.oi_by_strike['points'])
        self.assertIsNotNone(snap.oi_by_strike['max_pain'])
        self.assertIsNotNone(snap.oi_by_strike['window_pct'])

    def test_disabled_flag_skips_oi_fetch(self):
        today = date.today(); e = today + timedelta(days=35)
        session = FakeSession([
            {'status': 'OK', 'results': [{'c': 100}]},
            {'status': 'OK', 'results': [option_item(e, 'C'), option_item(e, 'P')]},
            {'status': 'OK', 'results': [option_item(e, 'C'), option_item(e, 'P')]},
            {'status': 'OK', 'results': [option_item(e, 'C'), option_item(e, 'P')]},
        ])
        provider = self._provider(session, OPTION_OI_BY_STRIKE_ENABLED='false')
        snap = provider.fetch_option_chain('TEST', spot_hint=100.0, iv_hint=0.4)
        self.assertEqual(snap.oi_by_strike['points'], [])


class TrimAcrossExpiriesTests(unittest.TestCase):
    """The contract cap must not be spent entirely on the nearest expiry.

    Contracts arrive ordered by expiry, so `contracts[:max_contracts]` kept the
    front of the list and dropped every far month -- the second of two
    truncations that each independently made widening OPTION_DTE_BUCKETS look
    like it did nothing. Calendars and diagonals need a far leg to exist at all,
    and near-term strike density does not substitute for one.
    """

    @staticmethod
    def _contracts(expiries, per_expiry):
        from providers.polygon_option_chain_provider import _trim_across_expiries  # noqa: F401
        out = []
        for expiry in expiries:
            for strike in range(per_expiry):
                out.append(OptionContractSnapshot(
                    symbol='TEST', expiry=expiry, strike=100 + strike, right='C',
                    bid=None, ask=None, last=None, mark=None, volume=None,
                    open_interest=None, iv=None, delta=None, gamma=None,
                    theta=None, vega=None, rho=None,
                ))
        return out

    def test_every_expiry_survives_the_cap(self):
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        expiries = [today + timedelta(days=d) for d in (2, 35, 60, 97, 125)]
        trimmed = _trim_across_expiries(self._contracts(expiries, 50), 100)
        self.assertEqual(len(trimmed), 100)
        self.assertEqual({c.expiry for c in trimmed}, set(expiries))

    def test_the_budget_is_shared_roughly_evenly(self):
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        expiries = [today + timedelta(days=d) for d in (2, 35, 60, 97)]
        trimmed = _trim_across_expiries(self._contracts(expiries, 50), 100)
        counts = {}
        for c in trimmed:
            counts[c.expiry] = counts.get(c.expiry, 0) + 1
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

    def test_an_expiry_with_few_contracts_does_not_block_the_others(self):
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        near, far = today + timedelta(days=2), today + timedelta(days=97)
        contracts = self._contracts([near], 2) + self._contracts([far], 50)
        trimmed = _trim_across_expiries(contracts, 20)
        self.assertEqual(len(trimmed), 20)
        self.assertEqual(sum(1 for c in trimmed if c.expiry == near), 2)

    def test_a_chain_under_the_cap_is_returned_untouched(self):
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        contracts = self._contracts([today + timedelta(days=2)], 5)
        self.assertIs(_trim_across_expiries(contracts, 100), contracts)

    def test_strikes_nearest_spot_survive_the_cap(self):
        """A partial expiry must stay centred on spot, not keep its lowest strikes.

        Within an expiry the provider orders by strike ascending, so keeping each
        expiry's head kept only deep-ITM puts / deep-OTM calls and starved the
        upside. Measured on SPY at 776.34 the stored chain covered 12.2% below
        spot and 1.8% above, under the 3.0% wall-coverage floor, so every symbol
        was downgraded to 'low' confidence on a 100%-complete chain.
        """
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        expiries = [today + timedelta(days=d) for d in (2, 35)]
        # Strikes 100..149 per expiry; spot sits at the top of the range, so a
        # head slice and a spot-centred slice are maximally different.
        trimmed = _trim_across_expiries(self._contracts(expiries, 50), 12, spot=145.0)

        self.assertEqual(len(trimmed), 12)
        for expiry in expiries:
            strikes = sorted(c.strike for c in trimmed if c.expiry == expiry)
            # Centred on spot, spanning both sides -- the property wall coverage
            # depends on. A head slice would have returned 100..105.
            self.assertEqual(strikes, [142, 143, 144, 145, 146, 147])
            self.assertGreater(max(strikes), 145.0, 'no strike above spot survived')
            self.assertLess(min(strikes), 145.0, 'no strike below spot survived')

    def test_without_spot_the_provider_order_is_preserved(self):
        # Callers that cannot supply a spot must not crash or reorder silently.
        from providers.polygon_option_chain_provider import _trim_across_expiries
        today = date.today()
        trimmed = _trim_across_expiries(self._contracts([today + timedelta(days=2)], 50), 6)
        self.assertEqual([c.strike for c in trimmed], [100, 101, 102, 103, 104, 105])
