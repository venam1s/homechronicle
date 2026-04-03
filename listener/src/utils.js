export function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parentBridgeId(id) {
  const parts = String(id ?? '').split(':');
  return parts.length > 6 ? parts.slice(0, 6).join(':') : String(id ?? '');
}

export function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.localhost');
}

export function normalizeRateLimitValue(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function extractBearerToken(headerValue) {
  const auth = String(headerValue ?? '').trim();
  if (!auth) return '';
  const spaceIndex = auth.indexOf(' ');
  if (spaceIndex <= 0) return '';
  const scheme = auth.slice(0, spaceIndex).toLowerCase();
  if (scheme !== 'bearer') return '';
  return auth.slice(spaceIndex + 1).trim();
}
