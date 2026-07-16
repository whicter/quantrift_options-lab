require('dotenv').config();
const express = require('express');
const cors = require('cors');
const metricsRouter = require('./routes/metrics');
const pricesRouter = require('./routes/prices');
const scanRouter = require('./routes/scan');
const statusRouter = require('./routes/status');
const { router: optionsRouter } = require('./routes/options');
const chainRouter = require('./routes/chain');
const gexRouter = require('./routes/gex');
const unusualRouter = require('./routes/unusual');
const { router: flowRouter } = require('./routes/flow');
const { router: supportResistanceRouter } = require('./routes/supportResistance');
const { router: volumeProfileRouter } = require('./routes/volumeProfile');
const analyzeRouter = require('./routes/analyze');
const { router: marketRouter } = require('./routes/market');
const { router: weeklyRouter } = require('./routes/weekly');
const { router: alertsRouter } = require('./routes/alerts');
const { router: heartbeatRouter } = require('./routes/heartbeat');
const { startHeartbeatMonitor } = require('./lib/heartbeatMonitor');
const { buildAuthMiddleware } = require('./lib/auth');
const { router: accountRouter } = require('./routes/account');
const { router: portfolioRouter } = require('./routes/portfolio');
const { router: billingRouter, receiveWebhook } = require('./routes/billing');
const { requireEntitlement } = require('./lib/entitlements');

const app = express();
const PORT = process.env.PORT || 3001;

function buildCorsOrigin() {
  const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) return '*';

  return (origin, callback) => {
    if (!origin || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  };
}

app.use(buildAuthMiddleware());
app.use(cors({
  origin: buildCorsOrigin(),
}));
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), receiveWebhook);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/metrics', requireEntitlement('live_analysis'), metricsRouter);
app.use('/api/prices', requireEntitlement('live_analysis'), pricesRouter);
app.use('/api/scan', requireEntitlement('scanner'), scanRouter);
app.use('/api/status', statusRouter);
app.use('/api/options', requireEntitlement('live_analysis'), optionsRouter);
app.use('/api/chain', requireEntitlement('live_analysis'), chainRouter);
app.use('/api/gex', requireEntitlement('live_analysis'), gexRouter);
app.use('/api/unusual', requireEntitlement('live_analysis'), unusualRouter);
app.use('/api/flow', requireEntitlement('live_analysis'), flowRouter);
app.use('/api/sr', requireEntitlement('live_analysis'), supportResistanceRouter);
app.use('/api/vp', requireEntitlement('live_analysis'), volumeProfileRouter);
app.use('/api/analyze', requireEntitlement('live_analysis'), analyzeRouter);
app.use('/api/market', requireEntitlement('live_analysis'), marketRouter);
app.use('/api/weekly', requireEntitlement('live_analysis'), weeklyRouter);
app.use('/api/alerts', requireEntitlement('alerts'), alertsRouter);
app.use('/api/heartbeat', heartbeatRouter);
app.use('/api/account', accountRouter);
app.use('/api/portfolio', requireEntitlement('portfolio'), portfolioRouter);
app.use('/api/billing', billingRouter);

startHeartbeatMonitor();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
