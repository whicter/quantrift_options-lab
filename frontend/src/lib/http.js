const API_BASE = (import.meta.env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 30000;

let authTokenProvider = null;

export class ApiError extends Error {
  constructor(message, { status = null, path = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export function setAuthTokenProvider(provider) {
  authTokenProvider = typeof provider === 'function' ? provider : null;
}

async function withAuthorization(headers, { token, useAuthProvider }) {
  const resolvedToken = token ?? (useAuthProvider && authTokenProvider
    ? await authTokenProvider()
    : null);
  return resolvedToken
    ? { ...headers, Authorization: `Bearer ${resolvedToken}` }
    : headers;
}

function requestBody(body, headers) {
  if (body == null) return { body: undefined, headers };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (isFormData || typeof body === 'string') return { body, headers };
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  };
}

export async function requestJson(path, {
  method = 'GET',
  headers = {},
  body,
  token,
  useAuthProvider = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const authorizedHeaders = await withAuthorization(headers, { token, useAuthProvider });
  const request = requestBody(body, authorizedHeaders);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(`API ${response.status}`, { status: response.status, path });
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(`API timeout after ${timeoutMs}ms`, { path, cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getJson(path, options = {}) {
  return requestJson(path, { ...options, useAuthProvider: true });
}

export function getAuthenticatedJson(path, token, options = {}) {
  return requestJson(path, { ...options, token });
}

export { API_BASE, DEFAULT_TIMEOUT_MS };
