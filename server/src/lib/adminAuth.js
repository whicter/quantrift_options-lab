const crypto = require('crypto');

function tokenMatches(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requestToken(req) {
  const header = req.get?.('authorization') || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  if (bearer && bearer !== header) return bearer;
  return req.get?.('x-admin-token') || '';
}

/**
 * Operational detail is admin-only and fails closed: an unset ADMIN_API_TOKEN
 * disables the route rather than leaving it open.
 */
function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  if (!expected) return res.status(503).json({ error: 'admin api not configured' });
  if (!tokenMatches(requestToken(req), expected)) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

module.exports = { requireAdminToken, tokenMatches, requestToken };
