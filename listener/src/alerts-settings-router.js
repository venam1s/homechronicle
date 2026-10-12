import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator, requireAdminSession } from './security.js';

/**
 * @param {object} deps
 * @param {number|null} [deps.webhookTimeoutEnvMs] — the ALERTS_WEBHOOK_TIMEOUT_MS
 *   value when that env var is set. It then wins over the saved timeout, so GET
 *   reports it (with `webhookTimeoutFromEnv: true`) and PATCH refuses to change it.
 */
export function createAlertsSettingsRouter({ getSettings, saveSettings, onSettingsChange, webhookTimeoutEnvMs = null }) {
  const router = Router();
  const timeoutFromEnv = webhookTimeoutEnvMs != null;

  // What the UI should show: the timeout deliveries actually use.
  const view = () => ({
    ...getSettings(),
    ...(timeoutFromEnv ? { webhookTimeoutMs: webhookTimeoutEnvMs } : {}),
    webhookTimeoutFromEnv: timeoutFromEnv,
  });

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests, try again later.' },
  });

  router.get('/alerts', (_req, res) => {
    try {
      res.json(view());
    } catch (err) {
      log.error('[alerts-settings] GET /alerts error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/alerts', requireAdminSession, writeLimiter, async (req, res) => {
    try {
      const body = req.body ?? {};
      const updates = {};

      // `enabled` is deliberately NOT accepted. MALERT-07 removed the
      // household-wide alerts gate when alert rules became per-user: a single
      // admin switch would silently kill every other user's personal alerts.
      // The field lingered here afterwards — accepted and persisted, but read
      // by nothing — so toggling it off told an operator alerts were disabled
      // while every rule kept firing. Rejecting it is honest; accepting a
      // setting that does nothing is not.
      if (body.enabled !== undefined) {
        return res.status(400).json({
          error: 'Alerts are enabled per rule, not household-wide. Disable individual rules instead.',
        });
      }

      if (body.defaultQuietMinutes !== undefined) {
        const v = Number.parseInt(String(body.defaultQuietMinutes), 10);
        if (!Number.isFinite(v) || v < 0 || v > 10080) {
          return res.status(400).json({ error: 'defaultQuietMinutes must be an integer 0-10080.' });
        }
        updates.defaultQuietMinutes = v;
      }

      if (body.webhookTimeoutMs !== undefined) {
        if (timeoutFromEnv) {
          return res.status(400).json({
            error: 'The webhook timeout is set by ALERTS_WEBHOOK_TIMEOUT_MS. Change or remove it in .env.',
          });
        }
        const v = Number.parseInt(String(body.webhookTimeoutMs), 10);
        if (!Number.isFinite(v) || v < 1000 || v > 30000) {
          return res.status(400).json({ error: 'webhookTimeoutMs must be an integer 1000-30000.' });
        }
        updates.webhookTimeoutMs = v;
      }

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No supported settings provided.' });
      }

      const current = getSettings();
      const next = { ...current, ...updates };
      await saveSettings(next);
      onSettingsChange(next);
      log.info(`[alerts-settings] Settings updated: defaultQuietMinutes=${next.defaultQuietMinutes} webhookTimeoutMs=${next.webhookTimeoutMs}`);
      res.json(view());
    } catch (err) {
      log.error('[alerts-settings] PATCH /alerts error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
