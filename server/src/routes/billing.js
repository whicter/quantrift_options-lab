const express = require('express');
const Stripe = require('stripe');
const pool = require('../db');
const { requireAuthenticatedUser } = require('../lib/auth');
const { ensureAccount } = require('./account');

const router = express.Router();

function stripeClient() {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
}

function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || 'https://www.quantrift.io').replace(/\/$/, '');
}

async function ensureStripeCustomer(client, account, database = pool) {
  if (account.subscription.stripe_customer_id) return account.subscription.stripe_customer_id;
  const connection = await database.connect();
  try {
    await connection.query('BEGIN');
    const { rows } = await connection.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id=$1 FOR UPDATE',
      [account.user.id]
    );
    if (rows[0]?.stripe_customer_id) {
      await connection.query('COMMIT');
      return rows[0].stripe_customer_id;
    }
    const customer = await client.customers.create({
      metadata: { quantrift_user_id: String(account.user.id), clerk_user_id: account.user.clerk_user_id },
    });
    await connection.query(
      'UPDATE subscriptions SET stripe_customer_id=$1,updated_at=NOW() WHERE user_id=$2',
      [customer.id, account.user.id]
    );
    await connection.query('COMMIT');
    return customer.id;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

function checkoutParams(account, customer, priceId) {
  return {
    mode: 'subscription', customer, client_reference_id: String(account.user.id),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${publicAppUrl()}/account?checkout=success`,
    cancel_url: `${publicAppUrl()}/account?checkout=canceled`,
    subscription_data: { metadata: { quantrift_user_id: String(account.user.id) } },
    allow_promotion_codes: true,
  };
}

async function createCheckout(req, res) {
  const client = stripeClient();
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!client || !priceId) return res.status(503).json({ error: 'billing not configured' });
  try {
    const account = await ensureAccount(req.clerkUserId);
    if (account.subscription.plan === 'pro' && ['active', 'trialing'].includes(account.subscription.status)) {
      return res.status(409).json({ error: 'subscription already active' });
    }
    const customer = await ensureStripeCustomer(client, account);
    const session = await client.checkout.sessions.create(checkoutParams(account, customer, priceId));
    return res.json({ url: session.url });
  } catch (error) {
    console.error('POST /api/billing/checkout error:', error.message);
    return res.status(502).json({ error: 'billing provider error' });
  }
}

async function createPortal(req, res) {
  const client = stripeClient();
  if (!client) return res.status(503).json({ error: 'billing not configured' });
  try {
    const account = await ensureAccount(req.clerkUserId);
    if (!account.subscription.stripe_customer_id) return res.status(409).json({ error: 'billing account not found' });
    const session = await client.billingPortal.sessions.create({
      customer: account.subscription.stripe_customer_id,
      return_url: `${publicAppUrl()}/account`,
    });
    return res.json({ url: session.url });
  } catch (error) {
    console.error('POST /api/billing/portal error:', error.message);
    return res.status(502).json({ error: 'billing provider error' });
  }
}

function mapStripeStatus(status) {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled') return 'canceled';
  return 'incomplete';
}

async function processStripeEvent(event, database = pool) {
  const connection = await database.connect();
  try {
    await connection.query('BEGIN');
    const inserted = await connection.query(
      `INSERT INTO stripe_webhook_events (event_id,event_type,payload)
       VALUES ($1,$2,$3::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type, JSON.stringify(event)]
    );
    if (!inserted.rowCount) { await connection.query('ROLLBACK'); return 'duplicate'; }
    const object = event.data.object;
    if (event.type === 'checkout.session.completed' && object.mode === 'subscription') {
      const userId = Number(object.client_reference_id);
      if (Number.isInteger(userId) && userId > 0) {
        await connection.query(
          `UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2,updated_at=NOW()
           WHERE user_id=$3`,
          [object.customer, object.subscription, userId]
        );
      }
    }
    if (event.type.startsWith('customer.subscription.')) {
      const subscription = object;
      let userId = Number(subscription.metadata?.quantrift_user_id);
      if (!Number.isInteger(userId)) {
        const { rows } = await connection.query('SELECT user_id FROM subscriptions WHERE stripe_customer_id=$1', [subscription.customer]);
        userId = rows[0]?.user_id;
      }
      if (userId) {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(subscription.status);
        const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
        await connection.query(
          `UPDATE subscriptions SET plan=$1,status=$2,stripe_customer_id=$3,stripe_subscription_id=$4,
             current_period_end=$5,cancel_at_period_end=$6,updated_at=NOW()
           WHERE user_id=$7`,
          [status === 'active' || status === 'trialing' ? 'pro' : 'free', status, subscription.customer,
            subscription.id, periodEnd, Boolean(subscription.cancel_at_period_end), userId]
        );
      }
    }
    await connection.query('COMMIT');
    return 'processed';
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

async function receiveWebhook(req, res, injected = null) {
  const client = injected?.client || stripeClient();
  const secret = injected?.secret || process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret) return res.status(503).json({ error: 'billing webhook not configured' });
  let event;
  try {
    event = client.webhooks.constructEvent(req.body, req.get('stripe-signature'), secret);
  } catch (error) {
    return res.status(400).json({ error: 'invalid webhook signature' });
  }
  try {
    const status = await processStripeEvent(event, injected?.database || pool);
    return res.json({ received: true, status });
  } catch (error) {
    console.error('POST /api/billing/webhook error:', error.message);
    return res.status(500).json({ error: 'webhook processing failed' });
  }
}

router.use(requireAuthenticatedUser);
router.post('/checkout', createCheckout);
router.post('/portal', createPortal);

module.exports = {
  router, stripeClient, ensureStripeCustomer, checkoutParams, createCheckout, createPortal,
  mapStripeStatus, processStripeEvent, receiveWebhook,
};
