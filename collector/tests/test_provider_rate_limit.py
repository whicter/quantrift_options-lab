import unittest

from providers.provider_rate_limit import DatabaseRequestPacer, RateLimitDeferred


class DatabaseRequestPacerTest(unittest.TestCase):
    """The file lock this replaces cannot coordinate workers on different
    machines: each host keeps its own lock file, so N hosts issue N times the
    intended rate. These assert the properties that make the shared claim safe."""

    def test_two_workers_racing_receive_distinct_spaced_slots(self):
        # The core guarantee. A fake database applies the same GREATEST/advance
        # rule the SQL does, so two claims cannot land on the same slot.
        db = _FakeRateLimitDb(delay=16)
        slept = []
        pacer_a = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=slept.append)
        pacer_b = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=slept.append)

        first = pacer_a.wait()
        second = pacer_b.wait()

        self.assertEqual(first, 0.0)      # queue empty: fires now
        self.assertEqual(second, 16.0)    # second worker waits a full delay
        self.assertEqual(slept, [16.0])

    def test_slots_keep_spacing_across_many_workers(self):
        db = _FakeRateLimitDb(delay=16)
        waits = [
            DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None).wait()
            for _ in range(4)
        ]
        self.assertEqual(waits, [0.0, 16.0, 32.0, 48.0])

    def test_separate_scopes_do_not_block_each_other(self):
        # Options and stock endpoints have independent budgets; pacing one must
        # not stall the other.
        db = _FakeRateLimitDb(delay=16)
        stocks = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        options = DatabaseRequestPacer(db.connect, 'polygon', 'options', delay=16, sleep=lambda _s: None)

        self.assertEqual(stocks.wait(), 0.0)
        self.assertEqual(options.wait(), 0.0)

    def test_zero_delay_never_touches_the_database(self):
        db = _FakeRateLimitDb(delay=0)
        pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=0)
        self.assertEqual(pacer.wait(), 0.0)
        self.assertEqual(db.connections, 0)

    def test_a_penalty_pushes_the_shared_slot_for_every_worker(self):
        db = _FakeRateLimitDb(delay=16)
        pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        pacer.penalize(120)

        # A different worker now inherits the backoff instead of hammering on.
        other = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        self.assertEqual(other.wait(), 120.0)

    def test_a_shorter_penalty_never_shortens_a_longer_one(self):
        db = _FakeRateLimitDb(delay=16)
        pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        pacer.penalize(300)
        pacer.penalize(5)  # concurrent 429 with a short Retry-After

        other = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        self.assertEqual(other.wait(), 300.0)

    def test_a_far_slot_defers_instead_of_firing_anyway(self):
        """The deadlock this pacer used to create.

        The cap used to be applied by the CALLER, after an unconditional claim:
        the slot advanced, the caller slept the capped 300s rather than the real
        wait, and then fired regardless. Against a provider that had just
        returned 429 -- precisely when penalize() pushes the slot far out --
        every worker skipped the backoff it had just been handed, earned a fresh
        429, and pushed the slot further, while each claim added another delay.
        Measured live 2026-08-03: polygon/stocks sat 1076s out with
        last_status=429 and climbing, and daily prices had not advanced in days.
        """
        db = _FakeRateLimitDb(delay=16)
        pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        pacer.penalize(99999)

        other = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
        with self.assertRaises(RateLimitDeferred) as caught:
            other.wait()
        self.assertGreater(caught.exception.wait_seconds, 300)

    def test_a_deferred_claim_does_not_advance_the_slot(self):
        """What makes the backoff self-clearing: declining to claim writes
        nothing, so the penalty drains with wall-clock time instead of being
        pushed further out by every worker that checks it."""
        db = _FakeRateLimitDb(delay=16)
        DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None).penalize(99999)
        before = db.next_allowed_at[('polygon', 'stocks')]

        for _ in range(5):
            pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)
            with self.assertRaises(RateLimitDeferred):
                pacer.wait()

        self.assertEqual(db.next_allowed_at[('polygon', 'stocks')], before,
                         'a deferred claim must not push the slot out')

    def test_a_caller_willing_to_wait_longer_still_gets_the_slot(self):
        """A cron collector can afford a long inline wait where a worker cannot;
        the budget is per-call, and the sleep is the TRUE wait, never capped."""
        db = _FakeRateLimitDb(delay=16)
        DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None).penalize(600)

        slept = []
        patient = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=slept.append)
        self.assertEqual(patient.wait(max_wait_seconds=1800), 600.0)
        self.assertEqual(slept, [600.0])

    def test_connections_are_released_and_not_held_while_sleeping(self):
        # Claim commits and closes before the caller sleeps; a paced request
        # must not pin a connection for the length of its delay.
        db = _FakeRateLimitDb(delay=16)
        order = []
        pacer = DatabaseRequestPacer(
            db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: order.append('slept'),
        )
        pacer.wait()
        pacer.wait()

        self.assertEqual(db.open_connections, 0)
        self.assertEqual(db.commits, 2)
        self.assertEqual(order, ['slept'])

    def test_a_failed_claim_rolls_back_and_surfaces(self):
        db = _FakeRateLimitDb(delay=16, fail=True)
        pacer = DatabaseRequestPacer(db.connect, 'polygon', 'stocks', delay=16, sleep=lambda _s: None)

        with self.assertRaises(RuntimeError):
            pacer.wait()
        self.assertEqual(db.rollbacks, 1)
        self.assertEqual(db.open_connections, 0)


class _FakeRateLimitDb:
    """Applies the same slot rule as the SQL, on a virtual clock.

    fires_at = max(next_allowed_at, now); next_allowed_at = fires_at + delay
    """

    def __init__(self, delay: float, fail: bool = False):
        self.now = 0.0
        # Keyed by (provider, scope), matching the real table's primary key.
        self.next_allowed_at: dict[tuple[str, str], float] = {}
        self.delay = delay
        self.fail = fail
        self.connections = 0
        self.open_connections = 0
        self.commits = 0
        self.rollbacks = 0

    def connect(self):
        self.connections += 1
        self.open_connections += 1
        return _FakeConn(self)

    def claim(self, key, delay, max_wait):
        """Mirrors the SQL: the UPDATE's WHERE excludes rows whose slot is
        further out than max_wait, so no row is returned and nothing advances."""
        if self.fail:
            raise RuntimeError('database unavailable')
        pending = self.next_allowed_at.get(key, self.now)
        if pending > self.now + max_wait:
            return None
        fires_at = max(pending, self.now)
        self.next_allowed_at[key] = fires_at + delay
        return fires_at - self.now

    def penalize(self, key, seconds):
        self.next_allowed_at[key] = max(self.next_allowed_at.get(key, self.now), self.now + seconds)


class _FakeCursor:
    def __init__(self, conn):
        self._conn = conn
        self._result = None

    def execute(self, sql, params=None):
        db = self._conn.db
        if isinstance(params, tuple):  # the "how far out is it" SELECT
            key = (params[0], params[1])
            self._result = (db.next_allowed_at.get(key, db.now) - db.now,)
            return
        key = (params['provider'], params['scope'])
        if 'last_status' in sql:
            db.penalize(key, float(params['seconds']))
        else:
            claimed = db.claim(key, float(params['delay']), float(params['max_wait']))
            self._result = None if claimed is None else (claimed,)

    def fetchone(self):
        return self._result

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class _FakeConn:
    def __init__(self, db):
        self.db = db

    def cursor(self):
        return _FakeCursor(self)

    def commit(self):
        self.db.commits += 1

    def rollback(self):
        self.db.rollbacks += 1

    def close(self):
        self.db.open_connections -= 1


if __name__ == '__main__':
    unittest.main()
