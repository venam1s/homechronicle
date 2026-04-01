export function toOptionalText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function toOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNodeId(value) {
  const text = toOptionalText(value);
  if (!text) return null;
  try {
    return BigInt(text).toString();
  } catch {
    return text.toUpperCase();
  }
}

export function isMatterPairing(pairing) {
  return String(pairing?.protocol ?? 'homekit').toLowerCase() === 'matter';
}
