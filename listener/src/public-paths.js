/**
 * public-paths.js — the API paths that bypass the auth gate.
 *
 * Extracted from index.js so there is ONE list. It used to be an inline const
 * with a "keep in sync with index.js" comment on the copies in gate.test.js
 * and auth-gate-empty-token.test.js — and they had already drifted, both
 * missing `/api/auth/config` and `/api/auth/invite-status`. A test that
 * re-implements the thing it is testing passes whatever the real code does.
 *
 * Matched with an EXACT comparison against `req.path` (no prefixes, no
 * wildcards), so every entry must be a complete path.
 *
 * Adding an entry here makes it reachable with no session and no token. The
 * bar: it must expose nothing about this instance, and it must not let an
 * anonymous caller cause work or side effects.
 */
export const PUBLIC_AUTH_PATHS = new Set([
  // Auth endpoints you must be able to reach in order to authenticate at all.
  '/api/auth/login',
  '/api/auth/claim-admin',
  '/api/auth/config',
  '/api/auth/csrf-token',
  '/api/auth/user-count',
  '/api/auth/invite-status',

  // Liveness — must answer for orchestrators and uptime checks that hold no
  // credentials.
  '/api/health',

  // Published release tags. This is public information on GitHub/GitLab and says
  // nothing about this instance. It cannot be used to make the box issue
  // outbound requests on demand either: the listener answers from a 12-hour
  // cache, so anonymous traffic hits memory, not the network.
  '/api/updates/latest',
]);
