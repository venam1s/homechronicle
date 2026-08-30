import express from 'express';
import rateLimit from 'express-rate-limit';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseIntInRange } from './utils.js';
import { log } from './logger.js';
import { rateLimitKeyGenerator, hashToken, generateToken, verifyPassword, hashPassword, getDummyPasswordHash, validatePasswordStrength, validateEmailAddress } from './security.js';
import {
  getUserCount,
  findUserByEmail,
  createUser,
  createSession,
  revokeSession,
  revokeSessionsForUser,
  validateSession,
  getInviteByTokenHash,
  redeemInvite,
  createPasswordResetToken,
  redeemResetToken,
  invalidateResetTokensForUser,
  listSessionsForUser,
  revokeSessionById,
} from './db.js';

/**
 * Extract session metadata from a request for the Active Sessions UI (D-01).
 * The IP is the Express trust-proxy-resolved req.ip (Phase-20 TRUST_PROXY); its
 * leading `::ffff:` IPv6-mapped-IPv4 prefix is stripped and an empty result is
 * coerced to null for clean storage/display (REVIEW LOW). user_agent is passed
 * through; createSession truncates it to 512 chars (T-23-UA-DOS).
 */
function extractSessionMeta(req) {
  const userAgent = req.headers?.['user-agent'] ?? null;
  const ipAddress = String(req.ip ?? '').replace(/^::ffff:/, '') || null;
  return { userAgent, ipAddress };
}

// -- Auth rate limiter constants (D-16/SEC-03) --
const AUTH_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
  1_000,
  24 * 60 * 60 * 1000,
);
const AUTH_RATE_LIMIT_MAX = parseIntInRange(
  process.env.AUTH_RATE_LIMIT_MAX,
  10,
  1,
  100_000,
);

// Transaction-scoped advisory-lock key for the first-admin bootstrap path
// (T-20-BOOTSTRAP-RACE). A bare `INSERT … WHERE NOT EXISTS (SELECT 1 FROM users)`
// is NOT race-safe under READ COMMITTED: two concurrent claim-admin requests with
// different emails each evaluate the existence check against the still-empty table,
// both pass, and both insert — the `email UNIQUE` constraint does not catch differing
// emails. Serializing the check+insert behind a constant pg_advisory_xact_lock forces
// the second request to wait until the first commits, after which it observes the row
// and 409s. The lock is released automatically at COMMIT/ROLLBACK.
const CLAIM_ADMIN_BOOTSTRAP_LOCK_KEY = 20_240_001;

// Fixed dummy hash computed once at startup (CR-01). When login receives an
// unknown email we still run argon2 verification against this constant so the
// unknown-email and known-email branches cost the same — closing the
// user-enumeration timing oracle. Uses the same argon2id params as real hashing.
const DUMMY_PASSWORD_HASH = getDummyPasswordHash();
// Observe a startup hashing failure (e.g. argon2 native-binding/memory-allocation
// failure on a constrained host at memoryCost=19456) instead of letting it remain a
// floating rejected Promise surfaced only on the first unknown-email login (WR-03).
DUMMY_PASSWORD_HASH.catch((err) =>
  log.error('[auth] dummy password hash precompute failed — login timing equalization degraded:', err.message));

/**
 * createAuthPublicRouter — mounts BEFORE the auth gate.
 *
 * Routes:
 *   POST /login           — AUTH-02, AUTH-06, SEC-01, SEC-04
 *   POST /claim-admin     — AUTH-01, P10 atomic bootstrap
 *   POST /accept-invite   — PWD-01, T-21-05-REPLAY
 *   POST /forgot-password — PWD-02, T-21-05-ENUM (enumeration-safe)
 *   POST /reset-confirm   — PWD-03, T-21-05-REPLAY, session revocation
 *   GET  /csrf-token      — SEC-02 (public, no session required)
 *   GET  /user-count      — public probe (Plan 05 cross-plan contract)
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {boolean} deps.SESSION_COOKIE_SECURE — from SESSION_COOKIE_SECURE env (D-14, SEC-01); never from NODE_ENV
 * @param {number} deps.SESSION_MAX_AGE_DEFAULT — ms, default 7 days (D-07)
 * @param {number} deps.SESSION_MAX_AGE_REMEMBER — ms, default 30 days (AUTH-06)
 * @param {function} deps.generateCsrfToken — csrf-sync's generateToken(req, res), injected from index.js (Plan 09)
 * @param {function} deps.sendPasswordReset — async (to, resetUrl) => void; injected from emails.js
 * @param {function} deps.isEmailEnabled — () => boolean; injected from emails.js
 * @param {string} deps.appBaseUrl — base URL for generating reset links (from smtp-config.js getAppBaseUrl)
 * @param {boolean} [deps.authEnabled] — mirrors AUTH_ENABLED; returned by GET /config so the browser can behave correctly in auth-off mode
 */
export function createAuthPublicRouter({
  pool,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_DEFAULT,
  SESSION_MAX_AGE_REMEMBER,
  generateCsrfToken,
  sendPasswordReset = async () => {},
  isEmailEnabled = () => false,
  appBaseUrl = '',
  authEnabled = true,
}) {
  const router = express.Router();

  const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // -- Helper: issue hc_session cookie and create session row --
  // userAgent/ipAddress are captured from the caller's request at each call site
  // (login / claim-admin / accept-invite) so the Active Sessions UI can show device
  // info (D-01). createSession truncates userAgent to 512 chars (T-23-UA-DOS).
  async function issueSession(res, userId, rememberMe, userAgent = null, ipAddress = null) {
    const maxAgeMs = rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT;
    const expiresAt = new Date(Date.now() + maxAgeMs);
    const rawToken = generateToken();
    await createSession(pool, { userId, tokenHash: hashToken(rawToken), expiresAt, userAgent, ipAddress });
    // Express res.cookie maxAge is in milliseconds (D-07/D-14)
    res.cookie('hc_session', rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SESSION_COOKIE_SECURE,
      maxAge: maxAgeMs,
      path: '/',
    });
    return rawToken;
  }

  // -- GET /csrf-token — public, SEC-02 --
  // This endpoint is pre-gate (publicly reachable without a session — used for
  // the pre-login CSRF token fetch). However, when a valid session cookie is
  // present, it populates req.hcSession so that csrf-sync's storeTokenInState
  // can persist the token to the session (Strategy B: in-memory write + lazy
  // DB flush). Without this, the post-login CSRF flow would always fail because
  // storeTokenInState no-ops when req.hcSession is absent.
  router.get('/csrf-token', async (req, res) => {
    try {
      // Session-aware: populate req.hcSession if a valid cookie is present so
      // storeTokenInState can write the CSRF token to the session object.
      if (!req.hcSession && req.cookies?.hc_session) {
        const session = await validateSession(pool, hashToken(req.cookies.hc_session));
        if (session) {
          req.hcSession = { ...session, csrfToken: session.csrf_token ?? null };
        }
      }
      // Default (no ?refresh): omit overwrite so csrf-sync reuses the existing
      // session token instead of regenerating on every call (SEC-02/CR-05).
      // ?refresh=1 (WR-04): force a fresh token via overwrite=true. The client
      // requests this on a post-403 CSRF retry so a stale/mismatched token (left
      // behind by a failed lazy DB flush) is replaced rather than re-handed,
      // breaking the 403 loop. csrf-sync's generator signature is
      // generateToken(req, overwrite) — there is no res argument.
      const forceRefresh = req.query?.refresh === '1';
      const csrfToken = generateCsrfToken(req, forceRefresh);
      res.json({ csrfToken });
    } catch (err) {
      log.error('[api] /api/auth/csrf-token error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- GET /user-count — public probe (Plan 05 cross-plan contract) --
  router.get('/user-count', async (req, res) => {
    try {
      const count = await getUserCount(pool);
      res.json({ count });
    } catch (err) {
      log.error('[api] /api/auth/user-count error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- GET /config — public, no auth required --
  // Returns the server-side AUTH_ENABLED flag so the browser can skip the login
  // wall in auth-off mode (AUTH_ENABLED=false). No secrets are exposed — only a
  // boolean indicating whether the auth system is active.
  router.get('/config', (_req, res) => {
    res.json({ authEnabled });
  });

  // -- GET /invite-status — public, read-only invite pre-validation --
  // Called by AcceptInvitePage on mount to determine whether the invite token
  // is still valid before showing the account-creation form. This is intentionally
  // non-destructive: it reads the invite row without mutating it (getInviteByTokenHash).
  // Returns ONLY { valid } or { valid, reason } — never email or role (privacy:
  // tokens are 256-bit random so the endpoint cannot be used for enumeration).
  router.get('/invite-status', async (req, res) => {
    try {
      const rawToken = String(req.query.token ?? '').trim();
      if (!rawToken) {
        return res.json({ valid: false, reason: 'invalid' });
      }

      const tokenHash = hashToken(rawToken);
      const invite = await getInviteByTokenHash(pool, tokenHash);

      if (!invite) {
        return res.json({ valid: false, reason: 'invalid' });
      }

      if (invite.status === 'revoked') {
        return res.json({ valid: false, reason: 'revoked' });
      }

      if (invite.used_at != null || invite.status === 'accepted') {
        return res.json({ valid: false, reason: 'used' });
      }

      if (new Date(invite.expires_at) <= new Date() || invite.status === 'expired') {
        return res.json({ valid: false, reason: 'expired' });
      }

      return res.json({ valid: true });
    } catch (err) {
      log.error('[api] /api/auth/invite-status error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /login — AUTH-02, AUTH-06, SEC-01, SEC-04 --
  router.post('/login', authLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const rememberMe = Boolean(req.body?.rememberMe);

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      // Always run argon2 verification — even for an unknown email — against a
      // fixed dummy hash so both branches cost the same and cannot be timed apart
      // (CR-01). verifyPassword must be invoked unconditionally; never let ||/&&
      // short-circuit it.
      const user = await findUserByEmail(pool, email);
      const hashToVerify = user?.password_hash ?? (await DUMMY_PASSWORD_HASH);
      const passwordOk = await verifyPassword(hashToVerify, password);
      if (!user || !passwordOk) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      // Disabled accounts: reject after full credential verification so timing
      // cannot distinguish a bad password from a disabled account (M-3).
      if (user.disabled_at) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Anti-fixation (SEC-04/D-12): revoke any prior session before issuing a new one
      if (req.cookies?.hc_session) {
        await revokeSession(pool, hashToken(req.cookies.hc_session));
      }

      const loginMeta = extractSessionMeta(req);
      await issueSession(res, user.id, rememberMe, loginMeta.userAgent, loginMeta.ipAddress);

      res.json({ user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      log.error('[api] /api/auth/login error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /claim-admin — AUTH-01, P10 atomic bootstrap, race-safe --
  router.post('/claim-admin', authLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      // Format/length validation (L-1) — same shared validator as invite creation.
      const emailResult = validateEmailAddress(email);
      if (emailResult.error) {
        return res.status(400).json({ error: emailResult.error });
      }
      const normalizedEmail = emailResult.value;

      // Server-side strength floor (WR-01). The admin account is the
      // highest-privilege credential; reject trivially brute-forceable passwords.
      // This check is authoritative — the client mirror is UX only.
      if (password.length < 12) {
        return res.status(400).json({ error: 'Password must be at least 12 characters' });
      }

      const passwordHash = await hashPassword(password);

      // Race-safe bootstrap (T-20-BOOTSTRAP-RACE). Serialize the existence
      // check + insert behind a transaction-scoped advisory lock so concurrent
      // claim-admin requests cannot both observe an empty users table. The bare
      // `WHERE NOT EXISTS` guard alone is NOT sufficient under READ COMMITTED —
      // see CLAIM_ADMIN_BOOTSTRAP_LOCK_KEY. Canonical pool.connect() +
      // BEGIN/COMMIT/ROLLBACK pattern (see runRetentionSweep in db.js).
      const client = await pool.connect();
      let user;
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [CLAIM_ADMIN_BOOTSTRAP_LOCK_KEY]);
        const result = await client.query(
          `INSERT INTO users (email, password_hash, role)
           SELECT $1, $2, 'admin'
           WHERE NOT EXISTS (SELECT 1 FROM users)
           RETURNING id, email, role`,
          [normalizedEmail, passwordHash],
        );
        await client.query('COMMIT');
        user = result.rows[0];
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      if (!user) {
        return res.status(409).json({ error: 'Admin account already exists' });
      }

      // Auto-login the first admin (no prior cookie to revoke)
      const claimMeta = extractSessionMeta(req);
      await issueSession(res, user.id, false, claimMeta.userAgent, claimMeta.ipAddress);

      res.json({ user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      log.error('[api] /api/auth/claim-admin error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /accept-invite — PWD-01, T-21-05-REPLAY --
  // Redeems a pending invite token to create the invited user's account and issue
  // a session. The invite token is single-use: redeemInvite atomically marks it
  // used_at so replayed tokens return null → 400.
  router.post('/accept-invite', authLimiter, async (req, res) => {
    try {
      const rawToken = String(req.body?.token ?? '').trim();
      const password = String(req.body?.password ?? '');

      if (!rawToken || !password) {
        return res.status(400).json({ error: 'token and password are required' });
      }

      // Validate password strength BEFORE redeeming the invite token so a weak
      // password does not consume the single-use token (prevents lockout).
      const strength = validatePasswordStrength(password);
      if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
      }

      const passwordHash = await hashPassword(password);

      // Wrap redeemInvite + createUser in a transaction so a createUser failure
      // (e.g. duplicate email) rolls back the invite redemption — preventing the
      // token from being consumed without a user account being created (M-2).
      // issueSession stays AFTER COMMIT: a session failure must not roll back
      // the account that was successfully created.
      const client = await pool.connect();
      let invite, user;
      try {
        await client.query('BEGIN');
        // Atomically redeem the invite (T-21-05-REPLAY — null on second use)
        invite = await redeemInvite(client, hashToken(rawToken));
        if (!invite) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid or expired invitation.' });
        }
        user = await createUser(client, { email: invite.email, passwordHash, role: invite.role });
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      const inviteMeta = extractSessionMeta(req);
      await issueSession(res, user.id, false, inviteMeta.userAgent, inviteMeta.ipAddress);

      res.json({ ok: true, user: { email: user.email, role: user.role } });
    } catch (err) {
      log.error('[api] /api/auth/accept-invite error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /forgot-password — PWD-02, T-21-05-ENUM (enumeration-safe) --
  // Always returns an identical success response for known and unknown emails so
  // attackers cannot enumerate registered addresses via response differences.
  // A constant artificial delay masks timing differences between the two code paths.
  const FORGOT_BODY = { message: 'If that address is registered, a reset link has been sent.' };
  const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

  router.post('/forgot-password', authLimiter, async (req, res) => {
    // Start the minimum delay immediately so it runs concurrently with DB work
    // (T-21-05-ENUM). The finally block awaits it before sending so SMTP latency
    // from sendPasswordReset (fire-and-forget) adds no timing signal.
    const delayMs = 200 + Math.floor(Math.random() * 200);
    const delayPromise = sleep(delayMs);

    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();

      if (email) {
        const user = await findUserByEmail(pool, email);
        if (user && !user.disabled_at) {
          // Mint a reset token, store it, fire email as fire-and-forget
          const rawToken = generateToken();
          const tokenHash = hashToken(rawToken);
          const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
          await createPasswordResetToken(pool, { userId: user.id, tokenHash, expiresAt });
          const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;
          // Fire-and-forget: do NOT await — SMTP latency must not add timing signal (T-21-05-ENUM)
          sendPasswordReset(email, resetUrl).catch((err) =>
            log.error('[api] /api/auth/forgot-password sendPasswordReset failed:', err.message ?? err),
          );
        }
      }
    } catch (err) {
      log.error('[api] /api/auth/forgot-password error:', err.message ?? err.stack ?? err);
      // Intentionally no error response — always return the generic body (T-21-05-ENUM)
    } finally {
      await delayPromise;
      res.json(FORGOT_BODY);
    }
  });

  // -- POST /reset-confirm — PWD-03, T-21-05-REPLAY, session revocation --
  // Redeems a single-use reset token and updates the user's password.
  // Atomically marks the token used_at so a replayed token returns null → 400.
  // Revokes all active sessions after reset to force re-authentication everywhere.
  router.post('/reset-confirm', authLimiter, async (req, res) => {
    try {
      const rawToken = String(req.body?.token ?? '').trim();
      const password = String(req.body?.password ?? '');

      if (!rawToken || !password) {
        return res.status(400).json({ error: 'token and password are required' });
      }

      // Validate strength BEFORE redeeming — preserve the token on rejection
      const strength = validatePasswordStrength(password);
      if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
      }

      // Atomically redeem (T-21-05-REPLAY — null on second use or expiry)
      const tokenRow = await redeemResetToken(pool, hashToken(rawToken));
      if (!tokenRow) {
        return res.status(400).json({ error: 'This reset link has expired or has already been used.' });
      }

      const passwordHash = await hashPassword(password);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, tokenRow.user_id],
      );

      // Invalidate any other outstanding reset links for this user (L-2) — the
      // just-redeemed token is already used_at-marked by redeemResetToken().
      await invalidateResetTokensForUser(pool, tokenRow.user_id);

      // Revoke all active sessions to force re-login on every device (PWD-01)
      await revokeSessionsForUser(pool, tokenRow.user_id);

      res.json({ ok: true });
    } catch (err) {
      log.error('[api] /api/auth/reset-confirm error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * createAuthProtectedRouter — mounts AFTER the auth gate (req.hcSession populated).
 *
 * Routes:
 *   GET    /me       — AUTH-03: returns the authenticated user from the session
 *   DELETE /logout   — AUTH-03: revokes the server-side session + clears the hc_session cookie
 *   PATCH  /password — PWD-01: change own password; revokes all sessions
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {boolean} [deps.SESSION_COOKIE_SECURE] — must match issuance in createAuthPublicRouter (M-6)
 */
export function createAuthProtectedRouter({ pool, SESSION_COOKIE_SECURE = false }) {
  const router = express.Router();

  // A dedicated instance, deliberately SEPARATE from authLimiter (closed over
  // by createAuthPublicRouter and out of scope here): the password-change
  // budget must not share state with the login budget, so a burst of failed
  // logins cannot lock a legitimate user out of changing their password, and
  // vice-versa (auth L-3, audit 2026-08-30).
  const passwordChangeLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // -- GET /me — AUTH-03: return authenticated user --
  router.get('/me', async (req, res) => {
    try {
      // Null guard: return 401 when req.hcSession is absent (no valid session).
      // Without this guard, accessing session.user_id throws a TypeError → 500,
      // which AuthGate misreads as "authenticated but server error" → infinite login loop.
      if (!req.hcSession) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const session = req.hcSession;
      const user = {
        id: session.user_id,
        role: session.role,
      };
      // Include email if the gate populated it on the session object
      if (session.email !== undefined) {
        user.email = session.email;
      }
      res.json({ user });
    } catch (err) {
      log.error('[api] /api/auth/me error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- DELETE /logout — AUTH-03: destroy session server-side + clear cookie --
  router.delete('/logout', async (req, res) => {
    try {
      const raw = req.cookies?.hc_session;
      if (raw) {
        await revokeSession(pool, hashToken(raw));
      }
      // Clear the cookie by setting Max-Age=0 (same name + path + flags as issuance in createAuthPublicRouter)
      res.clearCookie('hc_session', { httpOnly: true, sameSite: 'lax', secure: SESSION_COOKIE_SECURE, path: '/' });
      res.json({ ok: true });
    } catch (err) {
      log.error('[api] /api/auth/logout error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- PATCH /password — PWD-01: change own password --
  // Requires valid session (auth gate). Verifies current password before accepting a
  // new one, then revokes ALL sessions to force re-authentication on every device.
  // Rate-limited (auth L-3, audit 2026-08-30): without a limiter, a stolen
  // session gets an unlimited current-password oracle (bounded only by
  // argon2id, ~1k guesses/min), and a successful guess makes the theft
  // permanent by letting the attacker set a new password the real owner
  // doesn't know.
  router.patch('/password', passwordChangeLimiter, async (req, res) => {
    try {
      if (!req.hcSession) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const currentPassword = String(req.body?.currentPassword ?? '');
      const newPassword = String(req.body?.newPassword ?? '');

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
      }

      // Validate new password strength before loading user or verifying current
      const strength = validatePasswordStrength(newPassword);
      if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
      }

      // Load user to get current password_hash for verification
      const result = await pool.query(
        'SELECT id, email, password_hash, role FROM users WHERE id = $1',
        [req.hcSession.user_id],
      );
      const user = result.rows[0] ?? null;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify current password
      const currentOk = await verifyPassword(user.password_hash, currentPassword);
      if (!currentOk) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }

      // Hash and store new password
      const newHash = await hashPassword(newPassword);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newHash, user.id],
      );

      // Revoke all sessions to force re-login on all devices (PWD-01)
      await revokeSessionsForUser(pool, user.id);

      res.json({ ok: true });
    } catch (err) {
      log.error('[api] /api/auth/password error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- GET /sessions — SEC-05: list the caller's own active sessions --
  // Self-scoped on req.hcSession.user_id. token_hash/csrf_token are never returned
  // (db.js excludes them, D-02). The caller's own session is flagged current:true via a
  // strict presence check so an undefined id cannot false-match another undefined.
  router.get('/sessions', async (req, res) => {
    try {
      if (!req.hcSession) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const rows = await listSessionsForUser(pool, req.hcSession.user_id);
      const currentId = req.hcSession.id;
      const sessions = rows.map((s) => ({
        ...s,
        current: currentId != null && String(s.id) === String(currentId),
      }));
      res.json({ sessions });
    } catch (err) {
      log.error('[api] /api/auth/sessions error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- DELETE /sessions/:id — SEC-05: revoke one of the caller's own sessions --
  // Ownership enforced in SQL (revokeSessionById WHERE id=$1 AND user_id=$2): a guessed
  // id for another user deletes nothing → 404 (T-23-IDOR / D-04). CSRF-protected by mount
  // position (index.js mounts csrfSynchronisedProtection before this router) — no extra
  // middleware here (T-23-CSRF). The "exclude current from bulk revoke" rule (D-03) is a
  // Plan-05 UI concern; the API legitimately revokes any session the caller owns.
  router.delete('/sessions/:id', async (req, res) => {
    try {
      if (!req.hcSession) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const deleted = await revokeSessionById(pool, req.hcSession.user_id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ ok: true });
    } catch (err) {
      log.error('[api] /api/auth/sessions/:id error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
