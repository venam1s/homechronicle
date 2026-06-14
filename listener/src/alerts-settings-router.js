import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator, requireAdminSession } from './security.js';

export function createAlertsSettingsRouter({ getSettings, saveSettings, onSettingsChange }) {
  const router = Router();

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests, try again later.' },
  });

  router.get('/alerts', (_req, res) => {
    try {
      res.json(getSettings());
    } catch (err) {
      log.error('[alerts-settings] GET /alerts error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/alerts', requireAdminSession, writeLimiter, async (req, res) => {
    try {
      const body = req.body ?? {};
      const updates = {};

      if (body.enabled !== undefined) {
        if (typeof body.enabled !== 'boolean') {
          return res.status(400).json({ error: 'enabled must be a boolean.' });
        }
        updates.enabled = body.enabled;
      }

      if (body.defaultQuietMinutes !== undefined) {
        const v = Number.parseInt(String(body.defaultQuietMinutes), 10);
        if (!Number.isFinite(v) || v < 0 || v > 10080) {
          return res.status(400).json({ error: 'defaultQuietMinutes must be an integer 0-10080.' });
        }
        updates.defaultQuietMinutes = v;
      }

      if (body.webhookTimeoutMs !== undefined) {
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
      log.info(`[alerts-settings] Settings updated: enabled=${next.enabled} defaultQuietMinutes=${next.defaultQuietMinutes} webhookTimeoutMs=${next.webhookTimeoutMs}`);
      res.json(getSettings());
    } catch (err) {
      log.error('[alerts-settings] PATCH /alerts error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
