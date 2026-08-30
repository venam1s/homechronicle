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
      // D-05: shallow MERGE (last-writer-wins per key; keys are never removed), not a
      // whole-blob replace. Why: a client whose ['me','preferences'] GET has not resolved
      // (e.g. `retry:false` racing a transient 502) could otherwise build its PUT body from
      // an incomplete cache and truncate another device's keys server-side (M-7). Every known
      // client writer (SettingsTab's grouped writes, usePreference's single-key write,
      // UserPreferencesProvider's seedIfEmpty) sends an ADDITIVE partial, so key removal is
      // deliberately unsupported. `jsonb ||` is a SHALLOW merge — an object/array-valued key
      // (e.g. dashboardLayouts, quietHoursExcludedAccessories) is replaced wholesale by the
      // incoming value, which is the desired semantics for those keys.
      //
      // Because merged blobs can only grow, the pre-DB byte cap above is no longer sufficient
      // on its own (T-dfe-02): the WHERE octet_length(...) guard re-checks the cap AFTER the
      // merge and rejects an over-cap result by updating zero rows, which RETURNING then
      // surfaces as an empty row set below.
      // T-24-SQLI: parameterized $1/$2::jsonb/$3 — no string interpolation.
      const { rows } = await pool.query(
        `INSERT INTO user_preferences (user_id, prefs, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE
           SET prefs = user_preferences.prefs || EXCLUDED.prefs,
               updated_at = now()
           WHERE octet_length((user_preferences.prefs || EXCLUDED.prefs)::text) <= $3
         RETURNING prefs`,
        [userId, serialized, MAX_PREFS_BYTES],
      );
      if (!rows.length) {
        return res.status(400).json({ error: 'prefs payload too large' });
      }
      return res.json({ prefs: rows[0].prefs });
    } catch (err) {
      log.error('[api] PUT /api/me/preferences error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
