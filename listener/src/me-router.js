import express from 'express';
import { log } from './logger.js';

// D-07: Maximum serialized size for the preferences blob (256 KB).
// T-24-DOS: size cap enforced before pool.query in the PUT handler.
const MAX_PREFS_BYTES = 256 * 1024;

/**
 * createMeRouter — factory returning an Express router for /api/me routes.
 * GET  /preferences -> 200 { prefs: {} | <stored blob> }
 * PUT  /preferences -> body { prefs: object }; 400 non-object/oversize; 401 no session; 200 { prefs: <stored blob> }
 *
 * Mounted at /api/me in index.js after the global auth gate and csrfSynchronisedProtection (D-08).
 * The per-handler session guard below rejects service-token requests (T-24-AUTHZ).
 */
export function createMeRouter({ pool }) {
  const router = express.Router();

  // GET /preferences — return the caller's preferences blob.
  router.get('/preferences', async (req, res) => {
    // T-24-AUTHZ: session guard — API_TOKEN requests do not set req.hcSession.
    const userId = req.hcSession?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { rows } = await pool.query(
        'SELECT prefs FROM user_preferences WHERE user_id = $1',
        [userId],
      );
      // D-04: no row -> return empty object, NOT 404.
      return res.json({ prefs: rows[0]?.prefs ?? {} });
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

    // D-07: validate prefs is a plain object (not array, string, null, or missing).
    const prefs = req.body?.prefs;
    if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs)) {
      return res.status(400).json({ error: 'prefs must be a JSON object' });
    }

    // T-24-DOS: size cap — reject oversized blobs before any DB access.
    const serialized = JSON.stringify(prefs);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PREFS_BYTES) {
      return res.status(400).json({ error: 'prefs payload too large' });
    }

    try {
      // D-05: whole-blob replace (last-writer-wins). RETURNING prefs gives us the stored value.
      // T-24-SQLI: parameterized $1/$2::jsonb — no string interpolation.
      const { rows } = await pool.query(
        `INSERT INTO user_preferences (user_id, prefs, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE
           SET prefs = EXCLUDED.prefs,
               updated_at = now()
         RETURNING prefs`,
        [userId, serialized],
      );
      return res.json({ prefs: rows[0].prefs });
    } catch (err) {
      log.error('[api] PUT /api/me/preferences error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
