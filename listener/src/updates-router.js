import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';

/**
 * updates-router.js — "is there a newer release?", answered server-side.
 *
 * WHY THE SERVER DOES THIS
 *
 * Nginx serves the SPA with `connect-src 'self'` (web/nginx.conf.template), so
 * the browser is not allowed to reach ANY third-party origin. Proxying through
 * the listener works without widening the CSP — the page only ever talks to its
 * own origin. It also means one outbound request per server per cache window
 * instead of one per browser tab, and it keeps working for deployments whose
 * browsers have no internet access at all.
 *
 * WHERE IT LOOKS
 *
 * GitHub AND GitLab, in parallel, merged. Every release up to v0.5.0 was
 * published only on GitLab, and installs older than this code ask only GitLab,
 * so GitLab stays a live release source through the move to GitHub. Asking just
 * one would be wrong in the migration window either way round: GitHub can hold
 * backfilled old releases while new ones are still cut on GitLab, or the
 * reverse. So both lists are merged, deduped by tag (GitHub's page link wins),
 * and sorted by version — not by date, since backfilled releases all carry the
 * date they were recreated. Either host alone is enough for a successful check.
 *
 * PRIVACY: these are two outbound GETs (api.github.com, gitlab.com) per cache
 * window from a self-hosted box. They are on by default because the app has
 * always attempted an update check, but it is a single env var to turn off, and
 * they send nothing but a GET with a generic User-Agent.
 */

// Public releases APIs for this project — no token, no auth. Unauthenticated
// GitHub API calls are limited to 60/hour per IP; the 12-hour cache below keeps
// this far under that.
export const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/venam1s/homechronicle/releases?per_page=10';
export const GITLAB_RELEASES_URL =
  'https://gitlab.com/api/v4/projects/havuq%2Fhomechronicle/releases?per_page=10';

/**
 * The URLs to try, in order. An explicit UPDATE_CHECK_URL means exactly that
 * URL: someone who points the check elsewhere did not ask for a fallback.
 */
export function resolveReleaseUrls(env = process.env) {
  const override = env.UPDATE_CHECK_URL?.trim();
  return override ? [override] : [GITHUB_RELEASES_URL, GITLAB_RELEASES_URL];
}

// For the `sources` field — which hosts answered.
function sourceName(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return 'custom'; }
  if (host === 'api.github.com' || host === 'github.com') return 'github';
  if (host === 'gitlab.com') return 'gitlab';
  return 'custom';
}

const RELEASE_URLS = resolveReleaseUrls();
const ENABLED = !/^(0|false|no|off)$/i.test(process.env.UPDATE_CHECK_ENABLED ?? 'true');

// One upstream call per this window, however many clients ask.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// A failure is cached briefly too, so an outage or an offline box does not mean
// an upstream request on every single page load.
const ERROR_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

// vX.Y.Z or vX.Y.Z-beta.N — the tag shapes this project publishes.
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?$/i;

/**
 * Sort comparator: newest version first. A stable release outranks its own
 * pre-releases; beta.10 outranks beta.2. Tags that are not versions sink to
 * the end in their original order (Array.prototype.sort is stable).
 */
export function compareTagsDesc(a, b) {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return (pa ? -1 : 0) + (pb ? 1 : 0);
  for (const i of [1, 2, 3]) {
    const d = Number(pb[i]) - Number(pa[i]);
    if (d) return d;
  }
  if (!pa[4] !== !pb[4]) return pa[4] ? 1 : -1; // stable first
  if (!pa[4]) return 0;
  if (pa[4] !== pb[4]) return pa[4] < pb[4] ? 1 : -1;
  return Number(pb[5] ?? 0) - Number(pa[5] ?? 0);
}

/**
 * Normalize a GitHub or GitLab release into the shape the UI wants. The two
 * APIs share `tag_name` and differ in the rest, so one function reads both.
 *
 * GitLab has no `prerelease` boolean, so it is also derived from the tag —
 * which is where the app already encodes it, e.g. `v0.1.4-beta.16`. GitLab's
 * `upcoming_release` (dated in the future) and GitHub's `draft` are filtered
 * out rather than offered as updates.
 */
export function normalizeRelease(release) {
  const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!tag) return null;
  if (release?.upcoming_release || release?.draft) return null;

  return {
    tag,
    // The human-facing release page: GitHub `html_url`, GitLab `_links.self`.
    url: release?.html_url ?? release?._links?.self ?? null,
    prerelease: release?.prerelease === true || /-(?:alpha|beta|rc)\b/i.test(tag),
    publishedAt: release?.published_at ?? release?.released_at ?? release?.created_at ?? null,
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

  // { releases, fetchedAt, ok, sources }
  let cache = null;

  // One source, one bounded request. Throws on anything but a JSON array.
  async function fetchReleases(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        // GitHub's API rejects requests without a User-Agent. Generic on
        // purpose: it says nothing about this instance or its version.
        headers: { accept: 'application/json', 'user-agent': 'HomeChronicle-update-check' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error('expected an array of releases');
      return body.map(normalizeRelease).filter(Boolean);
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadReleases() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < (cache.ok ? CACHE_TTL_MS : ERROR_TTL_MS)) {
      return cache;
    }

    // Best-effort by design: a self-hosted box with no internet must not see
    // errors in its UI over this. If every host fails, serve an empty list and
    // try again after ERROR_TTL_MS. Parallel, so a cold check takes at most one
    // FETCH_TIMEOUT_MS, not one per host.
    const settled = await Promise.allSettled(RELEASE_URLS.map((url) => fetchReleases(url)));

    const byTag = new Map();
    const sources = [];
    settled.forEach((outcome, i) => {
      const source = sourceName(RELEASE_URLS[i]);
      if (outcome.status === 'rejected') {
        log.debug(`[updates] release check via ${source} failed: ${outcome.reason?.message ?? outcome.reason}`);
        return;
      }
      sources.push(source);
      log.debug(`[updates] fetched ${outcome.value.length} release(s) from ${source}`);
      // URL order is GitHub first, so on a tag both hosts have, GitHub's wins.
      for (const release of outcome.value) {
        if (!byTag.has(release.tag)) byTag.set(release.tag, release);
      }
    });

    const releases = [...byTag.values()].sort((a, b) => compareTagsDesc(a.tag, b.tag));
    const result = { releases, fetchedAt: now, ok: sources.length > 0, sources };
    cache = result;
    return cache;
  }

  /**
   * GET /latest — the recent releases from every host, newest version first.
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
      const { releases, ok, fetchedAt, sources } = await loadReleases();
      return res.json({
        enabled: true,
        releases,
        checkedAt: new Date(fetchedAt).toISOString(),
        upstreamOk: ok,
        // Hosts that answered: any of 'github', 'gitlab', 'custom'; [] if none.
        sources,
      });
    } catch (err) {
      log.error('[api] /api/updates/latest error:', err.message ?? err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
