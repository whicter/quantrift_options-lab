/**
 * Baseline security headers for the JSON API.
 *
 * The API only ever serves JSON, so it locks itself down to nothing: it does
 * not load resources, does not belong in a frame, and must not be sniffed into
 * an active content type.
 */

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // Only meaningful over TLS, and only true once the deployment is HTTPS-only.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  return next();
}

module.exports = { securityHeaders };
