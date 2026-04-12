export function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parentBridgeId(id) {
  const str = String(id ?? '');
  const parts = str.split(':');
  // HomeKit bridge child: "AA:BB:CC:DD:EE:FF:aid" → rejoin first 6 parts (MAC)
  if (parts.length > 6) return parts.slice(0, 6).join(':');
  // Matter endpoint: "nodeId:endpointId" → return nodeId
  if (parts.length === 2 && /^\d+$/.test(parts[0])) return parts[0];
  return str;
}

export function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.localhost');
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
