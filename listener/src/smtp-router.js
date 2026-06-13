/**
 * smtp-router.js — Admin-only SMTP configuration routes.
 *
 * Routes (all admin-only, mounted at /api/setup):
 *   GET  /smtp        — read non-secret config + passwordConfigured boolean (EMAIL-04)
 *   PUT  /smtp        — update config + optional secret rotation (D-01)
 *   POST /smtp/test   — send a test email to the requesting admin (D-03)
 *
 * Security invariants (T-21-04-SMTPLEAK, T-21-04-ADMINONLY):
 *   - GET response is built field-by-field; password/smtpPass are NEVER included
 *   - PUT with blank/absent password does NOT call writeSmtpSecret (preserves secret, D-01)
 *   - Every route checks req.hcSession?.role !== 'admin' → 403
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';

/**
 * Create the SMTP configuration router.
 *
 * @param {object} deps
 * @param {object} deps.smtpConfigStore — JsonObjectStore holding non-secret SMTP fields
 * @param {function} deps.readSmtpSecret — () => Promise<string|null>
 * @param {function} deps.writeSmtpSecret — (smtpPass: string) => Promise<void>
 * @param {function} deps.buildSmtpConfig — (snapshot, secret) => transport config
 * @param {function} deps.envOverriddenFields — (snapshot) => string[]
 * @param {function} deps.initEmail — (config) => Promise<void>
 * @param {function} deps.sendTestEmail — (to: string) => Promise<void>
 * @param {function} deps.isEmailEnabled — () => boolean
 * @param {function} [deps.onSmtpConfigChange] — (builtConfig) => void; called after initEmail so callers can re-thread `from` and other live state
 * @returns {Router}
 */
export function createSmtpRouter({
  smtpConfigStore,
  readSmtpSecret,
  writeSmtpSecret,
  buildSmtpConfig,
  envOverriddenFields,
  initEmail,
  sendTestEmail,
  isEmailEnabled,
  onSmtpConfigChange,
}) {
  const router = Router();

  const smtpWriteLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // -- GET /smtp — return non-secret SMTP config (EMAIL-02, EMAIL-04) --
  router.get('/smtp', async (req, res) => {
    // Admin-only guard (T-21-04-ADMINONLY)
    if (req.hcSession?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const snapshot = smtpConfigStore.getSnapshot();
      const secret = await readSmtpSecret();

      // Build response field-by-field — NEVER spread snapshot (Pitfall 5)
      // Defensively exclude any password/smtpPass key that may have leaked into the snapshot
      const safeSnapshot = { ...snapshot };
      delete safeSnapshot.password;
      delete safeSnapshot.smtpPass;

      const response = {
        host: safeSnapshot.host ?? '',
        port: safeSnapshot.port ?? 587,
        user: safeSnapshot.user ?? '',
        from: safeSnapshot.from ?? '',
        secure: Boolean(safeSnapshot.secure ?? false),
        passwordConfigured: secret != null,
        envFields: envOverriddenFields(snapshot),
      };

      // Final safety check: ensure no password key sneaked in
      delete response.password;
      delete response.smtpPass;

      res.json(response);
    } catch (err) {
      log.error('[api] GET /api/setup/smtp error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- PUT /smtp — update non-secret fields + optionally rotate secret (D-01) --
  router.put('/smtp', smtpWriteLimiter, async (req, res) => {
    // Admin-only guard (T-21-04-ADMINONLY)
    if (req.hcSession?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const body = req.body ?? {};

      // Persist non-secret fields to the config store
      const snapshot = smtpConfigStore.getSnapshot();
      const nextConfig = {
        host: typeof body.host === 'string' ? body.host.trim() : (snapshot.host ?? ''),
        port: Number.isFinite(Number(body.port)) ? Number(body.port) : (snapshot.port ?? 587),
        user: typeof body.user === 'string' ? body.user.trim() : (snapshot.user ?? ''),
        from: typeof body.from === 'string' ? body.from.trim() : (snapshot.from ?? ''),
        secure: body.secure !== undefined ? Boolean(body.secure) : (snapshot.secure ?? false),
      };

      await smtpConfigStore.write(nextConfig);

      // If a non-empty password was provided, rotate the secret (D-01)
      // Blank or absent password: leave existing secret untouched
      if (typeof body.password === 'string' && body.password.length > 0) {
        await writeSmtpSecret(body.password);
      }

      // Rebuild config + re-initialize transport so changes take effect live
      const secret = await readSmtpSecret();
      const smtpConfig = buildSmtpConfig(nextConfig, secret);
      await initEmail(smtpConfig);
      // Re-thread `from` and alert-channel sender in the caller (HIGH-1)
      onSmtpConfigChange?.(smtpConfig);

      res.json({ ok: true });
    } catch (err) {
      log.error('[api] PUT /api/setup/smtp error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -- POST /smtp/test — send a test email to the requesting admin (D-03) --
  router.post('/smtp/test', smtpWriteLimiter, async (req, res) => {
    // Admin-only guard (T-21-04-ADMINONLY)
    if (req.hcSession?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      if (!isEmailEnabled()) {
        return res.status(503).json({ error: 'Email is not configured.' });
      }

      const adminEmail = req.hcSession.email;
      await sendTestEmail(adminEmail);

      res.json({ ok: true });
    } catch (err) {
      log.error('[api] POST /api/setup/smtp/test error:', err.message ?? err.stack ?? err);
      // SMTP send failures are 502 (bad gateway to upstream), not 500
      res.status(502).json({ error: err.message ?? 'Failed to send test email' });
    }
  });

  return router;
}
