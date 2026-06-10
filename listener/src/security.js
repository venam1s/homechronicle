import { timingSafeEqual, createHmac, randomBytes, createHash, scrypt } from 'crypto';
import { promisify } from 'util';
import argon2 from 'argon2';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

// -- Crypto constants (AUTH-05/D-11) --
const ARGON2_MEMORY_COST = parseInt(process.env.ARGON2_MEMORY_COST ?? '19456', 10);
const ARGON2_TIME_COST = parseInt(process.env.ARGON2_TIME_COST ?? '2', 10);
const ARGON2_PARALLELISM = 1;

const scryptAsync = promisify(scrypt);

function ipv4ToInt(ip) {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipv4InCidr(ip, network, bits) {
  const value = ipv4ToInt(ip);
  const base = ipv4ToInt(network);
  if (value === null || base === null || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  return (value & mask) === (base & mask);
}

function classifyIpv4(ip, allowPrivateTargets) {
  if (ipv4InCidr(ip, '127.0.0.0', 8)) return { blocked: true, reason: 'loopback IPv4 targets are not allowed' };
  if (ipv4InCidr(ip, '169.254.0.0', 16)) return { blocked: true, reason: 'link-local IPv4 targets are not allowed' };
  if (ipv4InCidr(ip, '0.0.0.0', 8)) return { blocked: true, reason: 'unspecified IPv4 targets are not allowed' };
  if (ipv4InCidr(ip, '224.0.0.0', 4)) return { blocked: true, reason: 'multicast/broadcast IPv4 targets are not allowed' };
  if (ipv4InCidr(ip, '240.0.0.0', 4)) return { blocked: true, reason: 'reserved IPv4 targets are not allowed' };

  const privateRanges = [
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['100.64.0.0', 10],
  ];
  if (!allowPrivateTargets && privateRanges.some(([network, bits]) => ipv4InCidr(ip, network, bits))) {
    return { blocked: true, reason: 'private IPv4 targets are disabled by policy' };
  }

  return { blocked: false };
}

function classifyIpv6(host, allowPrivateTargets) {
  const value = host.toLowerCase();
  if (value === '::1') return { blocked: true, reason: 'loopback IPv6 targets are not allowed' };
  if (value === '::') return { blocked: true, reason: 'unspecified IPv6 targets are not allowed' };
  if (value.startsWith('ff')) return { blocked: true, reason: 'multicast IPv6 targets are not allowed' };
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return { blocked: true, reason: 'link-local IPv6 targets are not allowed' };
  }
  if (!allowPrivateTargets && (value.startsWith('fc') || value.startsWith('fd'))) {
    return { blocked: true, reason: 'private IPv6 targets are disabled by policy' };
  }
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return classifyIpv4(mapped, allowPrivateTargets);
    // Hex-form mapped IPv4: ::ffff:HHHH:HHHH (e.g. ::ffff:7f00:1 = 127.0.0.1)
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
      const high = Number.parseInt(hexParts[0], 16);
      const low = Number.parseInt(hexParts[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low) && high >= 0 && low >= 0) {
        const dotted = `${(high >>> 8) & 0xff}.${high & 0xff}.${(low >>> 8) & 0xff}.${low & 0xff}`;
        if (isIP(dotted) === 4) return classifyIpv4(dotted, allowPrivateTargets);
      }
    }
  }
  return { blocked: false };
}

function normalizeHostname(rawHostname) {
  return String(rawHostname ?? '').trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
}

function classifyResolvedAddress(address, allowPrivateTargets) {
  const ipType = isIP(address);
  if (ipType === 4) return classifyIpv4(address, allowPrivateTargets);
  if (ipType === 6) return classifyIpv6(address, allowPrivateTargets);
  return { blocked: true, reason: 'hostname resolved to a non-IP address' };
}

export function rateLimitKeyGenerator(req) {
  // Only trust X-Forwarded-For when Express trust proxy is configured,
  // otherwise an attacker can spoof the header to bypass rate limits.
  if (req?.app?.get('trust proxy')) {
    const forwardedFor = req?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
  }
  return req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
}

export function secureTokenEquals(expectedToken, providedToken) {
  const expected = String(expectedToken ?? '').trim();
  const provided = String(providedToken ?? '').trim();
  if (!expected || !provided) return false;
  // HMAC-hash both values to normalize length, preventing a length oracle
  // that would let an attacker determine the exact API_TOKEN length via timing.
  const key = Buffer.from('homechronicle-token-compare');
  const expectedHash = createHmac('sha256', key).update(expected).digest();
  const providedHash = createHmac('sha256', key).update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

export function validateWebhookTargetUrl(rawUrl, { allowPrivateTargets = true } = {}) {
  const url = String(rawUrl ?? '').trim();
  if (!url) return { ok: false, error: 'targetUrl is required' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'targetUrl must be a valid http/https URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'targetUrl must use http or https' };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) return { ok: false, error: 'targetUrl must include a hostname' };
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'localhost webhook targets are not allowed' };
  }

  const ipType = isIP(hostname);
  if (ipType === 4) {
    const rule = classifyIpv4(hostname, allowPrivateTargets);
    if (rule.blocked) return { ok: false, error: rule.reason };
  } else if (ipType === 6) {
    const rule = classifyIpv6(hostname, allowPrivateTargets);
    if (rule.blocked) return { ok: false, error: rule.reason };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}

// -- Password and token crypto helpers (AUTH-05/D-11/D-12) --

/**
 * Hash a plaintext password using argon2id (OWASP first choice, memory-hard).
 * Params tuned for RPi (memoryCost:19456, timeCost:2, parallelism:1).
 * Override via ARGON2_MEMORY_COST / ARGON2_TIME_COST env vars.
 * @param {string} password - Plaintext password to hash.
 * @returns {Promise<string>} argon2id hash string (always starts with $argon2id$).
 */
export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
  });
}

/**
 * Verify a password against a stored hash.
 * Supports argon2id hashes (primary) and legacy scrypt hashes (fallback).
 * Legacy format: "scrypt:<saltHex>:<derivedHex>" (64-byte output, timingSafeEqual comparison).
 * @param {string} hash - Stored hash string.
 * @param {string} password - Plaintext password to verify.
 * @returns {Promise<boolean>} true if password matches, false otherwise.
 */
export async function verifyPassword(hash, password) {
  if (hash.startsWith('$argon2')) {
    return argon2.verify(hash, password);
  }
  // Legacy scrypt fallback: "scrypt:<saltHex>:<derivedHex>"
  const parts = hash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const saltBuffer = Buffer.from(parts[1], 'hex');
  const storedHash = Buffer.from(parts[2], 'hex');
  const derived = await scryptAsync(password, saltBuffer, storedHash.length);
  return timingSafeEqual(derived, storedHash);
}

/**
 * Hash a raw session token for at-rest storage (D-12).
 * The raw token travels in the cookie; only the SHA-256 digest is stored in the DB.
 * @param {string} rawToken - Raw token hex string.
 * @returns {string} 64-char SHA-256 hex digest.
 */
export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a cryptographically random token using crypto.randomBytes (D-12, 256 bits of entropy).
 * @param {number} byteLength - Number of random bytes (default 32 = 256 bits).
 * @returns {string} Lowercase hex string of length byteLength * 2.
 */
export function generateToken(byteLength = 32) {
  return randomBytes(byteLength).toString('hex');
}

export async function resolveAndValidateWebhookTarget(rawUrl, {
  allowPrivateTargets = true,
  lookup = dnsLookup,
} = {}) {
  const baseValidation = validateWebhookTargetUrl(rawUrl, { allowPrivateTargets });
  if (!baseValidation.ok) return baseValidation;

  const parsed = new URL(baseValidation.normalizedUrl);
  const hostname = normalizeHostname(parsed.hostname);
  const directIpType = isIP(hostname);

  if (directIpType === 4 || directIpType === 6) {
    const directClassification = classifyResolvedAddress(hostname, allowPrivateTargets);
    if (directClassification.blocked) {
      return { ok: false, error: directClassification.reason };
    }
    return { ok: true, normalizedUrl: baseValidation.normalizedUrl, resolvedAddresses: [hostname] };
  }

  let answers;
  try {
    answers = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: `Could not resolve webhook hostname: ${hostname}` };
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    return { ok: false, error: `Could not resolve webhook hostname: ${hostname}` };
  }

  const resolvedAddresses = [];
  for (const answer of answers) {
    const address = String(answer?.address ?? '').trim();
    if (!address) {
      return { ok: false, error: 'Could not resolve webhook hostname to an IP address' };
    }
    const classification = classifyResolvedAddress(address, allowPrivateTargets);
    if (classification.blocked) {
      return { ok: false, error: `${classification.reason} (${address})` };
    }
    resolvedAddresses.push(address);
  }

  return {
    ok: true,
    normalizedUrl: baseValidation.normalizedUrl,
    resolvedAddresses,
  };
}
