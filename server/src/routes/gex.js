const express = require('express');
const { sendGexSnapshot } = require('./options');

const router = express.Router();

router.get('/:symbol', sendGexSnapshot);

module.exports = router;
