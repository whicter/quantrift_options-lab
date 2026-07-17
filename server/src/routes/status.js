/**
 * GET /api/status/data
 *
 * Public product-safe coverage summary: the symbol registry the product
 * renders, plus an overall health label. Operational detail — provider/source
 * names, per-symbol provenance, coverage gaps, job failures and provider
 * budget — lives behind an admin token at /api/admin/status/*.
 */

const express = require('express');
const router = express.Router();
const { buildDataStatus, toPublicDataStatus } = require('../domain/status/statusReports');

router.get('/data', async (req, res) => {
  try {
    res.json(toPublicDataStatus(await buildDataStatus()));
  } catch (err) {
    console.error('GET /api/status/data error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
