const assert = require('node:assert/strict');
const test = require('node:test');

const { securityHeaders } = require('../src/lib/securityHeaders');

function responseRecorder() {
  return {
    headers: {},
    removed: [],
    setHeader(name, value) { this.headers[name] = value; },
    removeHeader(name) { this.removed.push(name); delete this.headers[name]; },
  };
}

function applyHeaders() {
  const res = responseRecorder();
  let continued = false;
  securityHeaders({}, res, () => { continued = true; });
  assert.equal(continued, true, 'middleware must call next()');
  return res;
}

test('API responses carry baseline security headers', () => {
  const res = applyHeaders();

  // The API serves JSON only: it loads nothing and belongs in no frame.
  assert.equal(res.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(res.headers['Cross-Origin-Resource-Policy'], 'same-site');
  assert.ok(res.removed.includes('X-Powered-By'));
});

test('HSTS is sent only in production, where the deployment is HTTPS-only', () => {
  const previous = process.env.NODE_ENV;

  process.env.NODE_ENV = 'production';
  assert.equal(applyHeaders().headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');

  process.env.NODE_ENV = 'development';
  assert.equal('Strict-Transport-Security' in applyHeaders().headers, false);

  process.env.NODE_ENV = previous;
});
