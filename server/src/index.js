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
const { router: supportResistanceRouter } = require('./routes/supportResistance');
const analyzeRouter = require('./routes/analyze');
const { router: marketRouter } = require('./routes/market');
const { router: weeklyRouter } = require('./routes/weekly');
const { router: alertsRouter } = require('./routes/alerts');
const { router: heartbeatRouter } = require('./routes/heartbeat');
const { startHeartbeatMonitor } = require('./lib/heartbeatMonitor');

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

app.use(cors({
  origin: buildCorsOrigin(),
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/metrics', metricsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/scan', scanRouter);
app.use('/api/status', statusRouter);
app.use('/api/options', optionsRouter);
app.use('/api/chain', chainRouter);
app.use('/api/gex', gexRouter);
app.use('/api/unusual', unusualRouter);
app.use('/api/sr', supportResistanceRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/market', marketRouter);
app.use('/api/weekly', weeklyRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/heartbeat', heartbeatRouter);

startHeartbeatMonitor();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
