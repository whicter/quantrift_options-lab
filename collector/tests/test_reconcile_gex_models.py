import unittest

import compute_gex
from reconcile_gex_models import needs_recompute


class GexModelReconciliationTests(unittest.TestCase):
    def test_missing_or_legacy_model_requires_recompute(self):
        self.assertTrue(needs_recompute(None))
        self.assertTrue(needs_recompute({}))
        self.assertTrue(needs_recompute({'model_version': 'gex-v1-legacy'}))

    def test_current_model_does_not_require_recompute(self):
        self.assertFalse(needs_recompute({'model_version': compute_gex.GEX_MODEL_VERSION}))
