import { useState, useEffect } from 'react';
import { fetchJson, API_BASE } from '../lib/api.js';

// Asks our OWN listener, which fetches and caches the project's releases
// server-side from GitHub and GitLab, merged (listener/src/updates-router.js).
// The browser cannot call either host: the SPA is served with
// `connect-src 'self'`, so it is not allowed to reach any third-party origin.
// Same-origin sidesteps that without loosening the CSP.
const UPDATES_URL = `${API_BASE}/updates/latest`;
const CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
const DISMISS_KEY = 'hc_update_dismissed';

// ---------------------------------------------------------------------------
// Semver comparison — supports v0.1.3, v0.1.3-beta.5, etc.
// ---------------------------------------------------------------------------

function parseVersion(tag) {
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?/i);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,          // "beta" or null
    preNum: m[5] != null ? Number(m[5]) : null,
  };
}

/** Returns true if `a` is strictly newer than `b`. */
function isNewer(a, b) {
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  // Same major.minor.patch — compare pre-release
  // stable > beta, beta.6 > beta.5
  if (a.pre && !b.pre) return false;  // beta is NOT newer than stable
  if (!a.pre && b.pre) return true;   // stable IS newer than beta
  if (a.pre && b.pre) {
    if (a.pre !== b.pre) return a.pre > b.pre;
    return (a.preNum ?? 0) > (b.preNum ?? 0);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Checks the listener for a newer release.
 *
 * Returns:
 *   update  the newer release, or null — null too once the user dismissed that
 *           exact tag (drives the masthead link)
 *   latest  the newer release regardless of dismissal (drives Settings › About)
 *   status  'checking' | 'available' | 'current' | 'unavailable' | 'disabled'.
 *           'current' only after a successful check; a failed one (listener
 *           error, or the listener could not reach GitLab) is 'unavailable', so
 *           About never claims "Up to date" when it doesn't know.
 *   dismiss hide `update` for this tag
 */
export function useUpdateCheck(currentBuild) {
  const [latest, setLatest] = useState(null);
  const [dismissedTag, setDismissedTag] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY); } catch { return null; }
  });
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.localStorage.getItem('hc_disable_update_check') === 'true') {
      setStatus('disabled');
      return undefined;
    }

    const currentVersion = parseVersion(currentBuild);

    async function check() {
      let payload;
      try {
        payload = await fetchJson(UPDATES_URL);
      } catch {
        // Best-effort: keep the last good answer, if there was one.
        setStatus((s) => (s === 'checking' ? 'unavailable' : s));
        return;
      }
      if (payload?.enabled === false) {
        setLatest(null);
        setStatus('disabled');
        return;
      }
      // The listener serves an empty list when it couldn't reach GitLab; an
      // empty list is not proof that nothing newer exists.
      if (payload?.upstreamOk === false) {
        setStatus((s) => (s === 'checking' ? 'unavailable' : s));
        return;
      }
      const releases = Array.isArray(payload?.releases) ? payload.releases : [];

      // Determine if the current build is a pre-release (beta)
      const runningBeta = currentVersion?.pre != null;

      // Find the latest release the user should care about:
      // - If running a beta, consider both stable and beta releases
      // - If running stable, only consider stable releases
      let candidate = null;
      for (const release of releases) {
        const ver = parseVersion(release.tag);
        if (!ver) continue;
        if (!runningBeta && ver.pre) continue; // stable users skip betas
        if (!candidate || isNewer(ver, candidate.version)) {
          candidate = { version: ver, release };
        }
      }

      if (candidate && isNewer(candidate.version, currentVersion)) {
        setLatest({
          tag: candidate.release.tag,
          url: candidate.release.url,
          isPrerelease: candidate.release.prerelease,
          publishedAt: candidate.release.publishedAt,
        });
        setStatus('available');
      } else {
        setLatest(null);
        setStatus('current');
      }
    }

    check();
    const timer = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [currentBuild]);

  function dismiss() {
    if (latest?.tag) {
      try { window.localStorage.setItem(DISMISS_KEY, latest.tag); } catch { /* ignore */ }
      setDismissedTag(latest.tag);
    }
  }

  const update = latest && latest.tag !== dismissedTag ? latest : null;
  return { update, latest, status, dismiss };
}
