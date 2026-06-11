import test from 'node:test';
import assert from 'node:assert/strict';
import { scrypt, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import {
  resolveAndValidateWebhookTarget,
  secureTokenEquals,
  validateWebhookTargetUrl,
  hashPassword,
  verifyPassword,
  hashToken,
  generateToken,
  rateLimitKeyGenerator,
} from '../src/security.js';

// T-20-BRUTE: the auth rate limiter must key per real client IP behind a proxy,
// but only when Express `trust proxy` is configured — otherwise X-Forwarded-For is
// attacker-spoofable. These tests pin both halves of that contract.
function fakeReq({ trustProxy, xff, ip } = {}) {
  return {
    app: { get: (key) => (key === 'trust proxy' ? trustProxy : undefined) },
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    ip,
    socket: { remoteAddress: ip },
  };
}

test('rateLimitKeyGenerator ignores X-Forwarded-For when trust proxy is unset (anti-spoof default)', () => {
  // No trust proxy → all clients behind a proxy collapse to the socket IP. This is
  // the spoof-safe default; the lockout footgun is fixed by SETTING trust proxy.
  const req = fakeReq({ trustProxy: undefined, xff: '203.0.113.9', ip: '10.0.0.1' });
  assert.equal(rateLimitKeyGenerator(req), '10.0.0.1');
});

test('rateLimitKeyGenerator keys on the first X-Forwarded-For client when trust proxy is set', () => {
  const req = fakeReq({ trustProxy: 1, xff: '203.0.113.9, 10.0.0.1', ip: '10.0.0.1' });
  assert.equal(rateLimitKeyGenerator(req), '203.0.113.9');
});

test('rateLimitKeyGenerator falls back to req.ip when trust proxy is set but no X-Forwarded-For present', () => {
  const req = fakeReq({ trustProxy: 1, xff: undefined, ip: '198.51.100.7' });
  assert.equal(rateLimitKeyGenerator(req), '198.51.100.7');
});

test('secureTokenEquals uses exact token match semantics', () => {
  assert.equal(secureTokenEquals('abc123', 'abc123'), true);
  assert.equal(secureTokenEquals('abc123', 'ABC123'), false);
  assert.equal(secureTokenEquals('abc123', 'abc1234'), false);
  assert.equal(secureTokenEquals('', 'abc123'), false);
});

test('validateWebhookTargetUrl blocks localhost and loopback IP targets', () => {
  const localhost = validateWebhookTargetUrl('http://localhost:8080/hook');
  const loopback = validateWebhookTargetUrl('http://127.0.0.1:8080/hook');
  const loopbackV6 = validateWebhookTargetUrl('http://[::1]/hook');

  assert.equal(localhost.ok, false);
  assert.match(localhost.error, /localhost/i);
  assert.equal(loopback.ok, false);
  assert.match(loopback.error, /loopback/i);
  assert.equal(loopbackV6.ok, false);
  assert.match(loopbackV6.error, /loopback/i);
});

test('validateWebhookTargetUrl can block private ranges when policy disabled', () => {
  const blocked = validateWebhookTargetUrl('http://192.168.1.50/hook', { allowPrivateTargets: false });
  const allowed = validateWebhookTargetUrl('http://192.168.1.50/hook', { allowPrivateTargets: true });

  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /private/i);
  assert.equal(allowed.ok, true);
});

test('validateWebhookTargetUrl blocks IPv6-mapped IPv4 literals in hex form', () => {
  // ::ffff:7f00:1 = 127.0.0.1 (loopback)
  const loopbackHex = validateWebhookTargetUrl('http://[::ffff:7f00:1]/hook');
  assert.equal(loopbackHex.ok, false);
  assert.match(loopbackHex.error, /loopback/i);

  // ::ffff:a9fe:a9fe = 169.254.169.254 (link-local metadata)
  const linkLocalHex = validateWebhookTargetUrl('http://[::ffff:a9fe:a9fe]/hook');
  assert.equal(linkLocalHex.ok, false);
  assert.match(linkLocalHex.error, /link-local/i);

  // ::ffff:0808:0808 = 8.8.8.8 (public — should be allowed by default)
  const publicMapped = validateWebhookTargetUrl('http://[::ffff:808:808]/hook');
  assert.equal(publicMapped.ok, true);
});

test('resolveAndValidateWebhookTarget blocks IPv6-mapped IPv4 literal loopback and link-local', async () => {
  // ::ffff:7f00:1 = 127.0.0.1 — literal IP, goes through direct-IP early return
  const loopbackResult = await resolveAndValidateWebhookTarget('http://[::ffff:7f00:1]/hook');
  assert.equal(loopbackResult.ok, false);
  assert.match(loopbackResult.error, /loopback/i);

  // ::ffff:a9fe:a9fe = 169.254.169.254 — link-local metadata endpoint
  const linkLocalResult = await resolveAndValidateWebhookTarget('http://[::ffff:a9fe:a9fe]/hook');
  assert.equal(linkLocalResult.ok, false);
  assert.match(linkLocalResult.error, /link-local/i);

  // ::ffff:808:808 = 8.8.8.8 — public, should be ok
  const publicResult = await resolveAndValidateWebhookTarget('http://[::ffff:808:808]/hook');
  assert.equal(publicResult.ok, true);
});

test('resolveAndValidateWebhookTarget blocks DNS targets resolving to loopback/private IPs', async () => {
  const resolvedLoopback = await resolveAndValidateWebhookTarget('https://alerts.example/hook', {
    allowPrivateTargets: false,
    lookup: async () => [{ address: '127.0.0.1' }],
  });
  assert.equal(resolvedLoopback.ok, false);
  assert.match(resolvedLoopback.error, /loopback/i);

  const resolvedPrivate = await resolveAndValidateWebhookTarget('https://alerts.example/hook', {
    allowPrivateTargets: false,
    lookup: async () => [{ address: '10.0.0.7' }],
  });
  assert.equal(resolvedPrivate.ok, false);
  assert.match(resolvedPrivate.error, /private/i);

  const resolvedPublic = await resolveAndValidateWebhookTarget('https://alerts.example/hook', {
    allowPrivateTargets: false,
    lookup: async () => [{ address: '93.184.216.34' }],
  });
  assert.equal(resolvedPublic.ok, true);
});

// -- hashPassword / verifyPassword --

test('hashPassword produces an argon2id hash (starts with $argon2id$)', async () => {
  const hash = await hashPassword('correct horse');
  assert.ok(typeof hash === 'string', 'hash must be a string');
  assert.ok(hash.startsWith('$argon2id$'), `expected $argon2id$ prefix, got: ${hash.slice(0, 20)}`);
});

test('hashPassword never produces a scrypt-prefixed hash', async () => {
  const hash = await hashPassword('battery staple');
  assert.ok(!hash.startsWith('scrypt:'), 'hashPassword must NOT emit a scrypt: string');
});

test('verifyPassword returns true for matching argon2id hash', async () => {
  const pw = 'correct horse battery staple';
  const hash = await hashPassword(pw);
  assert.equal(await verifyPassword(hash, pw), true);
});

test('verifyPassword returns false for wrong password against argon2id hash', async () => {
  const hash = await hashPassword('correct horse');
  assert.equal(await verifyPassword(hash, 'wrong password'), false);
});

test('verifyPassword handles legacy scrypt fallback (scrypt:<saltHex>:<hashHex>)', async () => {
  // Build a legacy scrypt hash inline to exercise the fallback branch
  const scryptAsync = promisify(scrypt);

  const password = 'legacy-user-password';
  const salt = cryptoRandomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  const legacyHash = `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;

  assert.equal(await verifyPassword(legacyHash, password), true, 'correct password must verify against legacy hash');
  assert.equal(await verifyPassword(legacyHash, 'wrong'), false, 'wrong password must not verify against legacy hash');
});

// -- hashToken / generateToken (D-12 hash-at-rest) --

test('generateToken() returns a 64-char lowercase hex string (32 bytes)', () => {
  const token = generateToken();
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]+$/, 'must be lowercase hex');
});

test('generateToken(16) returns a 32-char hex string', () => {
  const token = generateToken(16);
  assert.equal(token.length, 32);
  assert.match(token, /^[0-9a-f]+$/);
});

test('generateToken() produces different values on successive calls (randomness)', () => {
  const t1 = generateToken();
  const t2 = generateToken();
  assert.notEqual(t1, t2, 'two calls must not produce the same token');
});

test('hashToken is deterministic and produces a 64-char SHA-256 hex digest', () => {
  const digest = hashToken('abc');
  assert.equal(digest.length, 64, 'SHA-256 hex digest must be 64 chars');
  assert.match(digest, /^[0-9a-f]+$/, 'must be lowercase hex');
  // deterministic: same input same output
  assert.equal(hashToken('abc'), digest, 'hashToken must be deterministic');
  // different inputs produce different digests
  assert.notEqual(hashToken('abc'), hashToken('xyz'), 'different inputs must produce different digests');
});

test('D-12 hash-at-rest: hashToken(rawToken) !== rawToken and is 64 hex chars', () => {
  const raw = generateToken();
  const hashed = hashToken(raw);
  assert.equal(hashed.length, 64);
  assert.notEqual(hashed, raw, 'stored digest must never equal the raw token (D-12)');
  assert.match(hashed, /^[0-9a-f]+$/);
});
