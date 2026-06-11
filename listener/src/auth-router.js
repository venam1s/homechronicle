import express from 'express';
import rateLimit from 'express-rate-limit';
import { parseIntInRange } from './utils.js';
import { log } from './logger.js';
import { rateLimitKeyGenerator, hashToken, generateToken, verifyPassword, hashPassword } from './security.js';
import {
  getUserCount,
  findUserByEmail,
  createSession,
  revokeSession,
  validateSession,
} from './db.js';

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

/**
 * createAuthPublicRouter — mounts BEFORE the auth gate.
 *
 * Routes:
 *   POST /login        — AUTH-02, AUTH-06, SEC-01, SEC-04
 *   POST /claim-admin  — AUTH-01, P10 atomic bootstrap
 *   GET  /csrf-token   — SEC-02 (public, no session required)
 *   GET  /user-count   — public probe (Plan 05 cross-plan contract)
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {boolean} deps.SESSION_COOKIE_SECURE — from SESSION_COOKIE_SECURE env (D-14, SEC-01); never from NODE_ENV
 * @param {number} deps.SESSION_MAX_AGE_DEFAULT — ms, default 7 days (D-07)
 * @param {number} deps.SESSION_MAX_AGE_REMEMBER — ms, default 30 days (AUTH-06)
 * @param {function} deps.generateCsrfToken — csrf-sync's generateToken(req, res), injected from index.js (Plan 09)
 */
export function createAuthPublicRouter({
  pool,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_DEFAULT,
  SESSION_MAX_AGE_REMEMBER,
  generateCsrfToken,
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
  async function issueSession(res, userId, rememberMe) {
    const maxAgeMs = rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT;
    const expiresAt = new Date(Date.now() + maxAgeMs);
    const rawToken = generateToken();
    await createSession(pool, { userId, tokenHash: hashToken(rawToken), expiresAt });
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
      // Pass req only — omitting res so csrf-sync defaults overwrite=false,
      // reusing the existing session token instead of regenerating on every call (SEC-02/CR-05)
      const csrfToken = generateCsrfToken(req);
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

  // -- POST /login — AUTH-02, AUTH-06, SEC-01, SEC-04 --
  router.post('/login', authLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const rememberMe = Boolean(req.body?.rememberMe);

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const user = await findUserByEmail(pool, email);
      if (!user || !(await verifyPassword(user.password_hash, password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Anti-fixation (SEC-04/D-12): revoke any prior session before issuing a new one
      if (req.cookies?.hc_session) {
        await revokeSession(pool, hashToken(req.cookies.hc_session));
      }

      await issueSession(res, user.id, rememberMe);

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

      const passwordHash = await hashPassword(password);

      // Atomic INSERT ... WHERE NOT EXISTS (P10 — prevents bootstrap race)
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role)
         SELECT $1, $2, 'admin'
         WHERE NOT EXISTS (SELECT 1 FROM users)
         RETURNING id, email, role`,
        [email, passwordHash],
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Admin account already exists' });
      }

      const user = result.rows[0];

      // Auto-login the first admin (no prior cookie to revoke)
      await issueSession(res, user.id, false);

      res.json({ user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      log.error('[api] /api/auth/claim-admin error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * createAuthProtectedRouter — mounts AFTER the auth gate (req.hcSession populated).
 *
 * Routes:
 *   GET    /me      — AUTH-03: returns the authenticated user from the session
 *   DELETE /logout  — AUTH-03: revokes the server-side session + clears the hc_session cookie
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 */
export function createAuthProtectedRouter({ pool }) {
  const router = express.Router();

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
      // Clear the cookie by setting Max-Age=0 (same name + path as issuance in createAuthPublicRouter)
      res.clearCookie('hc_session', { httpOnly: true, sameSite: 'lax', path: '/' });
      res.json({ ok: true });
    } catch (err) {
      log.error('[api] /api/auth/logout error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
