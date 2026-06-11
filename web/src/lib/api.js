export const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

const API_TOKEN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_TOKEN ?? '').trim()
  : '';

export class ApiError extends Error {
  constructor(message, { status = null, statusText = '', url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

export function withApiAuthHeaders(headers = {}) {
  if (!API_TOKEN) return headers;
  return {
    ...headers,
    'x-api-token': API_TOKEN,
  };
}

function getGatewayHint(status) {
  if (status === 502) {
    return 'Bad Gateway: the web container could not get a valid response from the listener API. This usually means the listener is down, restarting, or LISTENER_HOST/LISTENER_PORT is incorrect.';
  }
  if (status === 503) {
    return 'Service Unavailable: the listener API is reachable but not ready yet.';
  }
  if (status === 504) {
    return 'Gateway Timeout: the listener API did not respond in time.';
  }
  return null;
}

// Re-fetch a fresh CSRF token and persist it to sessionStorage, mirroring
// AuthGate's recovery path. Returns the new token, or '' on failure. Uses raw
// fetch (not fetchJson) so it can never recurse into the 403-retry path (WR-06).
async function refreshCsrfToken() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    const res = await fetch(`${API_BASE}/auth/csrf-token`, { credentials: 'include' });
    if (!res.ok) return '';
    const body = await res.json();
    const token = body?.csrfToken ?? '';
    if (token) sessionStorage.setItem('csrfToken', token);
    return token;
  } catch {
    return '';
  }
}

function isCsrfRejection(status, data) {
  if (status !== 403) return false;
  const code = data?.code ?? '';
  const msg = String(data?.error ?? data?.message ?? '');
  // csrf-sync surfaces EBADCSRFTOKEN; also match a generic "invalid csrf token" body.
  return code === 'EBADCSRFTOKEN' || /csrf/i.test(msg);
}

export async function fetchJson(url, options = {}, { _csrfRetried = false } = {}) {
  // Requires CORS_ALLOW_LOCALHOST=true in dev .env for cross-origin cookies to work.
  const csrfToken = typeof sessionStorage !== 'undefined'
    ? (sessionStorage.getItem('csrfToken') ?? '')
    : '';
  const isMutation = options.method &&
    options.method !== 'GET' && options.method !== 'HEAD';

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...withApiAuthHeaders(options.headers ?? {}),
      ...(isMutation && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // CSRF self-recovery (WR-06): a stale token (e.g. after a failed lazy DB
    // flush) makes every mutation 403 with no client recovery. On the first such
    // failure for a mutation, re-fetch a fresh token and retry the request once
    // before surfacing the error.
    if (isMutation && !_csrfRetried && isCsrfRejection(response.status, data)) {
      const fresh = await refreshCsrfToken();
      if (fresh) {
        return fetchJson(url, options, { _csrfRetried: true });
      }
    }

    const apiMessage = data?.error ?? data?.message ?? null;
    const statusLabel = response.statusText?.trim() || 'Request failed';
    const fallback = `HTTP ${response.status} (${statusLabel})`;
    const hint = getGatewayHint(response.status);
    const message = [apiMessage ?? fallback, hint].filter(Boolean).join(' ');
    throw new ApiError(message, {
      status: response.status,
      statusText: response.statusText ?? '',
      url,
    });
  }

  return data;
}
