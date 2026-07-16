const express = require('express');
const pool = require('../db');
const { authConfigured, requireAuthenticatedUser } = require('../lib/auth');

const router = express.Router();

const PLANS = [
  { id: 'free', name: 'Free', entitlements: ['learn', 'delayed_analysis'] },
  { id: 'pro', name: 'Pro', entitlements: ['learn', 'live_analysis', 'scanner', 'alerts', 'portfolio'] },
];

async function ensureAccount(clerkUserId) {
  const { rows: users } = await pool.query(
    `INSERT INTO users (clerk_user_id) VALUES ($1)
     ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at=NOW()
     RETURNING id, clerk_user_id, email, display_name, created_at`,
    [clerkUserId]
  );
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active')
     ON CONFLICT (user_id) DO NOTHING`,
    [users[0].id]
  );
  const { rows: subscriptions } = await pool.query(
    `SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end
     FROM subscriptions WHERE user_id=$1`,
    [users[0].id]
  );
  const subscription = subscriptions[0];
  const paidActive = subscription.plan === 'pro' && ['active', 'trialing'].includes(subscription.status);
  const plan = PLANS.find(item => item.id === (paidActive ? 'pro' : 'free')) || PLANS[0];
  return { user: users[0], subscription, entitlements: plan.entitlements };
}

async function sendMe(req, res) {
  try {
    const account = await ensureAccount(req.clerkUserId);
    const { stripe_customer_id: _customer, stripe_subscription_id: _subscription, ...publicSubscription } = account.subscription;
    return res.json({ ...account, subscription: publicSubscription });
  } catch (error) {
    console.error('GET /api/account/me error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.get('/plans', (_req, res) => res.json({ plans: PLANS, auth_configured: authConfigured() }));
router.get('/me', requireAuthenticatedUser, sendMe);

module.exports = { router, PLANS, ensureAccount, sendMe };
