import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator, requireAdminSession } from './security.js';

export function createRepairRouter({ getSettings, saveSettings, onSettingsChange }) {
  const router = Router();

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests, try again later.' },
  });

  router.get('/repair', (_req, res) => {
    try {
      res.json(getSettings());
    } catch (err) {
      log.error('[repair] GET /repair error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/repair', requireAdminSession, writeLimiter, async (req, res) => {
    try {
      const body = req.body ?? {};
      const updates = {};

      if (body.enabled !== undefined) {
        if (typeof body.enabled !== 'boolean') {
          return res.status(400).json({ error: 'enabled must be a boolean.' });
        }
        updates.enabled = body.enabled;
      }

      if (body.hour !== undefined) {
        const h = Number.parseInt(String(body.hour), 10);
        if (!Number.isFinite(h) || h < 0 || h > 23) {
          return res.status(400).json({ error: 'hour must be an integer 0-23.' });
        }
        updates.hour = h;
      }

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No supported settings provided.' });
      }

      const current = getSettings();
      const next = { ...current, ...updates };
      await saveSettings(next);
      onSettingsChange(next);
      log.info(`[repair] Settings updated: enabled=${next.enabled} hour=${next.hour}`);
      res.json(getSettings());
    } catch (err) {
      log.error('[repair] PATCH /repair error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
