require('dotenv').config();
const express = require('express');
const cors = require('cors');
const metricsRouter = require('./routes/metrics');
const scanRouter = require('./routes/scan');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/metrics', metricsRouter);
app.use('/api/scan', scanRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
