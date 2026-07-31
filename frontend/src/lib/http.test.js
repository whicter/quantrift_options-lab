import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiError,
  requestJson,
  setAuthTokenProvider,
} from './http.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('requestJson serializes JSON and applies an explicit bearer token', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ id: 7 });
  };

  const result = await requestJson('/api/portfolio', {
    method: 'POST',
    token: 'token-1',
    body: { symbol: 'SPY' },
  });

  assert.deepEqual(result, { id: 7 });
  assert.equal(captured.url, 'http://localhost:3001/api/portfolio');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer token-1');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(captured.options.body, '{"symbol":"SPY"}');
});

test('requestJson resolves provider auth only when requested', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    setAuthTokenProvider(null);
  });
  setAuthTokenProvider(async () => 'provider-token');
  const headers = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(options.headers);
    return jsonResponse({ ok: true });
  };

  await requestJson('/public');
  await requestJson('/signed-in', { useAuthProvider: true });

  assert.equal(headers[0].Authorization, undefined);
  assert.equal(headers[1].Authorization, 'Bearer provider-token');
});

test('requestJson exposes HTTP status through ApiError', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => jsonResponse({}, 404);

  await assert.rejects(
    requestJson('/missing'),
    error => error instanceof ApiError
      && error.status === 404
      && error.path === '/missing'
      && error.message === 'API 404',
  );
});

test('requestJson aborts requests at the configured deadline', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

  await assert.rejects(
    requestJson('/slow', { timeoutMs: 1 }),
    error => error instanceof ApiError
      && error.status === null
      && error.message === 'API timeout after 1ms',
  );
});
