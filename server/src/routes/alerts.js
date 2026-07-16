const crypto = require('crypto');
const express = require('express');
const pool = require('../db');

const router = express.Router();

function normalizeRules(input = {}) {
  const symbols = Array.isArray(input.symbols)
    ? [...new Set(input.symbols.map(value => String(value).trim().toUpperCase()).filter(value => /^[A-Z0-9.-]{1,12}$/.test(value)))].slice(0, 50)
    : [];
  const minIvRank = input.min_iv_rank === '' || input.min_iv_rank == null ? null : Number(input.min_iv_rank);
  const gammaRegime = ['positive', 'negative', 'neutral'].includes(input.gamma_regime) ? input.gamma_regime : null;
  if (minIvRank != null && (!Number.isFinite(minIvRank) || minIvRank < 0 || minIvRank > 100)) throw new Error('invalid min_iv_rank');
  return { symbols, min_iv_rank: minIvRank, gamma_regime: gammaRegime, unusual_only: Boolean(input.unusual_only) };
}

function normalizeDestination(channel, input) {
  if (channel === 'email') {
    const email = String(input?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('invalid email');
    return { email };
  }
  if (channel === 'web_push') {
    const endpoint = String(input?.endpoint || '');
    const p256dh = String(input?.keys?.p256dh || '');
    const auth = String(input?.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !auth) throw new Error('invalid push subscription');
    return { endpoint, expirationTime: input.expirationTime || null, keys: { p256dh, auth } };
  }
  throw new Error('invalid channel');
}

async function createSubscription(req, res) {
  try {
    if (req.body?.consent !== true) return res.status(400).json({ error: 'consent required' });
    const channel = String(req.body?.channel || '');
    const destination = normalizeDestination(channel, req.body?.destination);
    const rules = normalizeRules(req.body?.rules);
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO scanner_alert_subscriptions (unsubscribe_token, channel, destination, rules)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       RETURNING id, channel, rules, active, created_at`,
      [token, channel, JSON.stringify(destination), JSON.stringify(rules)]
    );
    return res.status(201).json({ ...rows[0], unsubscribe_token: token });
  } catch (error) {
    if (error.message.startsWith('invalid')) return res.status(400).json({ error: error.message });
    console.error('POST /api/alerts/subscriptions error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function unsubscribe(req, res) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: 'invalid token' });
  try {
    const result = await pool.query(
      `UPDATE scanner_alert_subscriptions SET active = FALSE, updated_at = NOW()
       WHERE unsubscribe_token = $1 AND active = TRUE RETURNING id`, [token]
    );
    return res.json({ status: result.rowCount ? 'unsubscribed' : 'not_found' });
  } catch (error) {
    console.error('DELETE /api/alerts/subscriptions/:token error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/vapid-public-key', (req, res) => res.json({ public_key: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null }));
router.post('/subscriptions', createSubscription);
router.delete('/subscriptions/:token', unsubscribe);

module.exports = { router, normalizeRules, normalizeDestination, createSubscription, unsubscribe };
