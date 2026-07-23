const express = require('express');
const pool = require('../db');
const { requireAuthenticatedUser } = require('../lib/auth');
const { ensureAccount } = require('./account');

const router = express.Router();
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function normalizePositionInput(body = {}) {
  const symbol = String(body.symbol || '').trim().toUpperCase();
  const strategyName = String(body.strategy_name || '').trim().slice(0, 80);
  const quantity = Number(body.quantity ?? 1);
  const notes = String(body.notes || '').trim().slice(0, 1000) || null;
  if (!SYMBOL_RE.test(symbol)) throw new Error('invalid symbol');
  if (!strategyName) throw new Error('strategy_name required');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('invalid quantity');
  if (!Array.isArray(body.legs) || body.legs.length < 1 || body.legs.length > 8) throw new Error('invalid legs');
  const legs = body.legs.map(leg => {
    const expiry = String(leg.expiry || '').trim();
    const strike = Number(leg.strike);
    const optionRight = String(leg.option_right || '').trim().toUpperCase();
    const side = String(leg.side || '').trim().toLowerCase();
    const legQuantity = Number(leg.quantity ?? 1);
    const entryPrice = Number(leg.entry_price);
    const expiryDate = new Date(`${expiry}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(expiryDate.getTime()) || expiryDate.toISOString().slice(0, 10) !== expiry) throw new Error('invalid expiry');
    if (!Number.isFinite(strike) || strike <= 0) throw new Error('invalid strike');
    if (!['C', 'P'].includes(optionRight)) throw new Error('invalid option_right');
    if (!['long', 'short'].includes(side)) throw new Error('invalid side');
    if (!Number.isInteger(legQuantity) || legQuantity < 1 || legQuantity > 10000) throw new Error('invalid leg quantity');
    if (!Number.isFinite(entryPrice) || entryPrice < 0) throw new Error('invalid entry_price');
    return {
      expiry, strike, option_right: optionRight, side, quantity: legQuantity, entry_price: entryPrice,
      contract_symbol: String(leg.contract_symbol || '').trim().slice(0, 120) || null,
    };
  });
  return { symbol, strategy_name: strategyName, quantity, notes, legs };
}

function number(value) {
  return value == null ? null : Number(value);
}

function buildPortfolio(rows) {
  const positions = [];
  const byId = new Map();
  for (const row of rows) {
    let position = byId.get(String(row.position_id));
    if (!position) {
      position = {
        id: row.position_id, symbol: row.symbol, strategy_name: row.strategy_name, status: row.status,
        quantity: Number(row.position_quantity), opened_at: row.opened_at, closed_at: row.closed_at,
        notes: row.notes, snapshot_ts: row.snapshot_ts, quote_source: row.quote_source,
        entry_value: 0, market_value: 0, pnl: 0, delta: 0, gamma: 0, theta: 0, vega: 0,
        priced_legs: 0, legs: [],
      };
      byId.set(String(row.position_id), position);
      positions.push(position);
    }
    const sign = row.side === 'long' ? 1 : -1;
    const contracts = Number(row.leg_quantity) * Number(row.position_quantity);
    const multiplier = sign * contracts * 100;
    const mark = number(row.current_mark);
    const entryPrice = number(row.entry_price);
    const entryValue = multiplier * entryPrice;
    const marketValue = mark == null ? null : multiplier * mark;
    position.entry_value += entryValue;
    if (marketValue != null) {
      position.market_value += marketValue;
      position.pnl += marketValue - entryValue;
      position.priced_legs += 1;
    }
    for (const greek of ['delta', 'gamma', 'theta', 'vega']) {
      const value = number(row[greek]);
      if (value != null) position[greek] += multiplier * value;
    }
    position.legs.push({
      id: row.leg_id, expiry: row.expiry, strike: number(row.strike), option_right: row.option_right,
      side: row.side, quantity: Number(row.leg_quantity), entry_price: entryPrice,
      current_mark: mark, bid: number(row.bid), ask: number(row.ask), contract_symbol: row.contract_symbol,
    });
  }
  for (const position of positions) position.pricing_complete = position.priced_legs === position.legs.length;
  const summary = positions.reduce((acc, position) => {
    if (position.status !== 'open') return acc;
    acc.entry_value += position.entry_value;
    acc.market_value += position.market_value;
    acc.pnl += position.pnl;
    acc.delta += position.delta;
    acc.gamma += position.gamma;
    acc.theta += position.theta;
    acc.vega += position.vega;
    acc.unpriced_legs += position.legs.length - position.priced_legs;
    return acc;
  }, { entry_value: 0, market_value: 0, pnl: 0, delta: 0, gamma: 0, theta: 0, vega: 0, unpriced_legs: 0 });
  summary.pricing_complete = summary.unpriced_legs === 0;
  return { summary, positions };
}

async function localUserId(clerkUserId) {
  const account = await ensureAccount(clerkUserId);
  return account.user.id;
}

async function listPortfolio(req, res) {
  try {
    const userId = await localUserId(req.clerkUserId);
    const { rows } = await pool.query(
      `SELECT p.id position_id, p.symbol, p.strategy_name, p.status, p.quantity position_quantity,
              p.opened_at, p.closed_at, p.notes,
              l.id leg_id, l.expiry, l.strike, l.option_right, l.side, l.quantity leg_quantity,
              l.entry_price, COALESCE(q.contract_symbol, l.contract_symbol) contract_symbol,
              q.bid, q.ask, q.current_mark, q.delta, q.gamma, q.theta, q.vega,
              q.snapshot_ts, q.quote_source
       FROM positions p
       JOIN position_legs l ON l.position_id=p.id
       LEFT JOIN LATERAL (
         SELECT c.contract_symbol, c.bid, c.ask,
                COALESCE(c.mark, CASE WHEN c.bid IS NOT NULL AND c.ask IS NOT NULL THEN (c.bid+c.ask)/2 END, c.last) current_mark,
                c.delta, c.gamma, c.theta, c.vega, s.snapshot_ts, s.source quote_source
         FROM option_contract_snapshots c
         JOIN option_chain_snapshots s ON s.id=c.snapshot_id
         WHERE c.symbol=p.symbol AND c.expiry=l.expiry AND c.strike=l.strike AND c.option_right=l.option_right
           AND COALESCE(c.mark, c.bid, c.ask, c.last) IS NOT NULL
         ORDER BY s.snapshot_ts DESC LIMIT 1
       ) q ON TRUE
       WHERE p.user_id=$1
       ORDER BY p.opened_at DESC, p.id DESC, l.id ASC`,
      [userId]
    );
    return res.json(buildPortfolio(rows));
  } catch (error) {
    console.error('GET /api/portfolio error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

async function createPosition(req, res) {
  let input;
  try { input = normalizePositionInput(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
  const client = await pool.connect();
  try {
    const userId = await localUserId(req.clerkUserId);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO positions (user_id,symbol,strategy_name,quantity,notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,symbol,strategy_name,status,quantity,opened_at,notes`,
      [userId, input.symbol, input.strategy_name, input.quantity, input.notes]
    );
    for (const leg of input.legs) {
      await client.query(
        `INSERT INTO position_legs (position_id,expiry,strike,option_right,side,quantity,entry_price,contract_symbol)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [rows[0].id, leg.expiry, leg.strike, leg.option_right, leg.side, leg.quantity, leg.entry_price, leg.contract_symbol]
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ ...rows[0], legs: input.legs });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/portfolio error:', error.message);
    return res.status(500).json({ error: 'database error' });
  } finally {
    client.release();
  }
}

async function closePosition(req, res) {
  try {
    const userId = await localUserId(req.clerkUserId);
    const { rows } = await pool.query(
      `UPDATE positions SET status='closed',closed_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status='open' RETURNING id,status,closed_at`,
      [req.params.id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'position not found' });
    return res.json(rows[0]);
  } catch (error) {
    console.error('DELETE /api/portfolio/:id error:', error.message);
    return res.status(500).json({ error: 'database error' });
  }
}

router.use(requireAuthenticatedUser);
router.get('/', listPortfolio);
router.post('/', createPosition);
router.delete('/:id', closePosition);

module.exports = { router, normalizePositionInput, buildPortfolio, listPortfolio, createPosition, closePosition };
