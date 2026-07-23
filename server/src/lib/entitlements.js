const { authConfigured, requestUserId } = require('./auth');
const { ensureAccount } = require('../routes/account');

function enforcementEnabled() {
  return String(process.env.AUTH_ENFORCEMENT_ENABLED || 'false').toLowerCase() === 'true';
}

function requireEntitlement(entitlement) {
  return async (req, res, next) => {
    if (!enforcementEnabled()) return next();
    if (!authConfigured()) return res.status(503).json({ error: 'authentication not configured' });
    const clerkUserId = requestUserId(req);
    if (!clerkUserId) return res.status(401).json({ error: 'unauthorized' });
    try {
      const account = await ensureAccount(clerkUserId);
      if (!account.entitlements.includes(entitlement)) {
        return res.status(403).json({ error: 'upgrade required', entitlement });
      }
      req.clerkUserId = clerkUserId;
      req.account = account;
      return next();
    } catch (error) {
      console.error('entitlement lookup failed:', error.message);
      return res.status(500).json({ error: 'database error' });
    }
  };
}

module.exports = { enforcementEnabled, requireEntitlement };
