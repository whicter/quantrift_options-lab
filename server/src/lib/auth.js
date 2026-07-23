const { clerkMiddleware } = require('@clerk/express');

function authConfigured() {
  return Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function buildAuthMiddleware() {
  if (!authConfigured()) return (_req, _res, next) => next();
  const authorizedParties = String(process.env.CLERK_AUTHORIZED_PARTIES || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return clerkMiddleware(authorizedParties.length ? { authorizedParties } : {});
}

function requestUserId(req) {
  return req.auth?.userId || null;
}

function requireAuthenticatedUser(req, res, next) {
  if (!authConfigured() && process.env.NODE_ENV !== 'test') {
    return res.status(503).json({ error: 'authentication not configured' });
  }
  const userId = requestUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  req.clerkUserId = userId;
  return next();
}

module.exports = { authConfigured, buildAuthMiddleware, requestUserId, requireAuthenticatedUser };
