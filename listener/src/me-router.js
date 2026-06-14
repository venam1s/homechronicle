import express from 'express';
import { log } from './logger.js';

// D-07: Maximum serialized size for the preferences blob (256 KB).
// Full enforcement is wired in plan 24-02; constant established here for T-24-DOS guard.
const MAX_PREFS_BYTES = 256 * 1024;

/**
 * createMeRouter — factory returning an Express router for /api/me routes.
 * GET  /preferences -> 200 { prefs: {} | <stored blob> }
 * PUT  /preferences -> body { prefs: object }; 400 non-object/oversize; 401 no session; 200 { prefs: <stored blob> }
 *
 * Pool queries (GET SELECT + PUT upsert) are implemented in plan 24-02.
 * This skeleton locks the factory signature, route registrations, and security guards.
 */
export function createMeRouter({ pool }) {
  const router = express.Router();

  // GET /preferences — return the caller's preferences blob.
  router.get('/preferences', async (req, res) => {
    // T-24-AUTHZ: session guard — API_TOKEN requests do not set req.hcSession.
    const userId = req.hcSession?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Pool SELECT + no-row->{} logic implemented in 24-02.
    try {
      log.error('[api] GET /api/me/preferences: pool logic pending 24-02');
      res.status(501).json({ error: 'Not implemented' });
    } catch (err) {
      log.error('[api] GET /api/me/preferences error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /preferences — replace the caller's preferences blob.
  router.put('/preferences', async (req, res) => {
    // T-24-AUTHZ: session guard.
    const userId = req.hcSession?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // D-07: validate prefs is a plain object.
    const prefs = req.body?.prefs;
    if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs)) {
      return res.status(400).json({ error: 'prefs must be a JSON object' });
    }

    // T-24-DOS: size cap placeholder (constant defined above; enforcement wired in 24-02).
    void MAX_PREFS_BYTES;

    // Pool upsert + RETURNING logic implemented in 24-02.
    try {
      log.error('[api] PUT /api/me/preferences: pool logic pending 24-02');
      res.status(501).json({ error: 'Not implemented' });
    } catch (err) {
      log.error('[api] PUT /api/me/preferences error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
