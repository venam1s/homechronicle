export function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parentBridgeId(id) {
  const parts = String(id ?? '').split(':');
  return parts.length > 6 ? parts.slice(0, 6).join(':') : String(id ?? '');
}
