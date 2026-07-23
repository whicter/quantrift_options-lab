/**
 * GET /api/admin/status/{data,options,cache}
 *
 * Full operational detail for operators: provider/source names, per-symbol
 * provenance, coverage gaps, job backlog and recent failures, scanner batch
 * age, option snapshot completeness and provider budget usage.
 *
 * Every route requires an admin token and fails closed when none is configured.
 */

const express = require('express');
const router = express.Router();
const { requireAdminToken } = require('../lib/adminAuth');
const { buildDataStatus, buildOptionsStatus, buildCacheStatus } = require('../domain/status/statusReports');

router.use(requireAdminToken);

function reportRoute(name, build) {
  router.get(`/${name}`, async (req, res) => {
    try {
      res.json(await build());
    } catch (err) {
      console.error(`GET /api/admin/status/${name} error:`, err.message);
      res.status(500).json({ error: 'database error' });
    }
  });
}

reportRoute('data', buildDataStatus);
reportRoute('options', buildOptionsStatus);
reportRoute('cache', buildCacheStatus);

module.exports = router;
