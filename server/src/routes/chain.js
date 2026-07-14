const express = require('express');
const { sendChainSnapshot } = require('./options');

const router = express.Router();

router.get('/:symbol', (req, res) => sendChainSnapshot(req, res, { includeContracts: true }));

module.exports = router;
