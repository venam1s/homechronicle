import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';

/**
 * updates-router.js — "is there a newer release?", answered server-side.
 *
 * WHY THE SERVER DOES THIS
 *
 * The browser used to call api.github.com directly. That could never work, for
 * two independent reasons:
 *   1. The GitHub account is gone — `havuq` does not resolve there any more, so
 *      the repo 404s. Releases moved to GitLab.
 *   2. Nginx serves the SPA with `connect-src 'self'` (web/nginx.conf.template),
 *      so the browser is not allowed to reach ANY third-party origin. Pointing
 *      the same fetch at gitlab.com would have been blocked identically.
 *
 * Proxying through the listener fixes both without widening the CSP — the page
 * only ever talks to its own origin. It also means one outbound request per
 * server per cache window instead of one per browser tab, and it keeps working
 * for deployments whose browsers have no internet access at all.
 *
 * PRIVACY: this is an outbound call to gitlab.com from a self-hosted box. It is
 * on by default because the app has always attempted an update check, but it is
 * a single env var to turn off, and it sends nothing but a GET.
 */

// GitLab's releases API for this project. Public — no token, no auth.
const DEFAULT_RELEASES_URL =
  'https://gitlab.com/api/v4/projects/havuq%2Fhomechronicle/releases?per_page=10';

const RELEASES_URL = process.env.UPDATE_CHECK_URL?.trim() || DEFAULT_RELEASES_URL;
const ENABLED = !/^(0|false|no|off)$/i.test(process.env.UPDATE_CHECK_ENABLED ?? 'true');

// One upstream call per this window, however many clients ask.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// A failure is cached briefly too, so an outage or an offline box does not mean
// an upstream request on every single page load.
const ERROR_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Normalize a GitLab release into the shape the UI wants.
 *
 * GitLab has no `prerelease` boolean (that is a GitHub concept), so it is
 * derived from the tag — which is where the app already encodes it, e.g.
 * `v0.1.4-beta.16`. `upcoming_release` is a different thing entirely: a release
 * dated in the future. Those are filtered out rather than offered as updates.
 */
export function normalizeRelease(release) {
  const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!tag) return null;
  if (release?.upcoming_release) return null;

  return {
    tag,
    // `_links.self` is the human-facing release page.
    url: release?._links?.self ?? null,
    prerelease: /-(?:alpha|beta|rc)\b/i.test(tag),
    publishedAt: release?.released_at ?? release?.created_at ?? null,
  };
}

export function createUpdatesRouter({ fetchImpl = fetch } = {}) {
  const router = express.Router();

  const readLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  // { releases, fetchedAt, ok }
  let cache = null;

  async function loadReleases() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < (cache.ok ? CACHE_TTL_MS : ERROR_TTL_MS)) {
      return cache;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(RELEASES_URL, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error('expected an array of releases');

      const releases = body.map(normalizeRelease).filter(Boolean);
      cache = { releases, fetchedAt: now, ok: true };
      log.debug(`[updates] fetched ${releases.length} release(s) from upstream`);
    } catch (err) {
      // Best-effort by design: a self-hosted box with no internet must not see
      // errors in its UI over this. Serve an empty list and try again later.
      log.debug(`[updates] release check failed: ${err.message ?? err}`);
      cache = { releases: [], fetchedAt: now, ok: false };
    } finally {
      clearTimeout(timer);
    }
    return cache;
  }

  /**
   * GET /latest — the recent releases, newest-first as GitLab returns them.
   *
   * Deliberately returns the LIST rather than a single "latest": the client
   * already owns the comparison rules (a stable install ignores betas, a beta
   * install considers both), and those rules depend on what the client is
   * running, which the server does not know.
   */
  router.get('/latest', readLimiter, async (_req, res) => {
    if (!ENABLED) {
      return res.json({ enabled: false, releases: [] });
    }
    try {
      const { releases, ok, fetchedAt } = await loadReleases();
      return res.json({
        enabled: true,
        releases,
        checkedAt: new Date(fetchedAt).toISOString(),
        upstreamOk: ok,
      });
    } catch (err) {
      log.error('[api] /api/updates/latest error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
