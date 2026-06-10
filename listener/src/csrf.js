/**
 * csrf.js — csrf-sync configuration module coupled to custom sessions.
 *
 * COUPLING STRATEGY: B (sync-store + lazy DB flush)
 * Decided by Plan 06 spike: csrf-sync does NOT await storeTokenInState.
 * Therefore we write to req.hcSession.csrfToken synchronously (safe) and
 * flush to the sessions table lazily via updateSessionCsrfToken (fire-and-forget).
 *
 * Usage:
 *   const { csrfSynchronisedProtection, generateCsrfToken } = createCsrf({ pool });
 *
 * index.js (Plan 09) mounts csrfSynchronisedProtection AFTER cookie-parser
 * and the session gate, so req.hcSession is populated before the middleware runs.
 * generateCsrfToken is injected into createAuthPublicRouter's /csrf-token route.
 */

import { csrfSync } from 'csrf-sync';
import { log } from './logger.js';
import { updateSessionCsrfToken } from './db.js';

/**
 * createCsrf — factory that wires csrf-sync to the custom session layer.
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool — pg.Pool injected for testability
 * @returns {{ csrfSynchronisedProtection: Function, generateCsrfToken: Function }}
 */
export function createCsrf({ pool }) {
  const {
    csrfSynchronisedProtection,
    generateToken,
  } = csrfSync({
    /**
     * getTokenFromState — reads the CSRF token from the in-memory session.
     * Returns null when req.hcSession is absent (pre-auth/public routes).
     */
    getTokenFromState: (req) => req.hcSession?.csrfToken ?? null,

    /**
     * storeTokenInState — STRATEGY B (Plan 06 verdict):
     *   1. Write to req.hcSession.csrfToken SYNCHRONOUSLY (in-memory, immediate).
     *   2. Flush to sessions.csrf_token via updateSessionCsrfToken LAZILY (fire-and-forget).
     *
     * csrf-sync calls this synchronously and discards the return value — an awaited
     * DB write here would race the response. The sync in-memory write is authoritative
     * for the lifetime of the request; the DB column is hydrated on the next request
     * via validateSession().
     *
     * If req.hcSession is absent (public/pre-auth request), this is a no-op.
     */
    storeTokenInState: (req, token) => {
      if (req.hcSession) {
        // SYNC: in-memory write (safe — csrf-sync does not await this)
        req.hcSession.csrfToken = token;
        // LAZY: flush to DB out-of-band; do NOT await here (Strategy B)
        updateSessionCsrfToken(pool, req.hcSession.id, token)
          .catch((err) => log.error('[csrf] lazy flush failed:', err.message));
      }
    },

    /**
     * getTokenFromRequest — reads the CSRF token from the X-CSRF-Token request header.
     * Using exact case matching (case-insensitive via req.get()).
     */
    getTokenFromRequest: (req) => req.get('X-CSRF-Token') ?? null,

    /** size: 32 bytes = 64-character hex token */
    size: 32,
  });

  /**
   * generateCsrfToken — csrf-sync's generateToken renamed to avoid collision
   * with security.js's generateToken (which generates session raw tokens).
   *
   * Inject into createAuthPublicRouter's GET /csrf-token route (Plan 09).
   */
  const generateCsrfToken = generateToken;

  return { csrfSynchronisedProtection, generateCsrfToken };
}
