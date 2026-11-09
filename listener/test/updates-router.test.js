import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  createUpdatesRouter,
  normalizeRelease,
  resolveReleaseUrls,
  GITHUB_RELEASES_URL,
  GITLAB_RELEASES_URL,
} from '../src/updates-router.js';

/**
 * The update check is proxied server-side because the browser cannot do it:
 * the SPA is served with `connect-src 'self'`. It asks GitHub first and falls
 * back to GitLab, where every release up to v0.5.0 was published.
 */

// A realistic GitHub releases payload.
const GITHUB_RELEASES = [
  {
    tag_name: 'v0.6.0',
    html_url: 'https://github.com/venam1s/homechronicle/releases/tag/v0.6.0',
    draft: false,
    prerelease: false,
    created_at: '2026-11-20T11:00:00Z',
    published_at: '2026-11-20T12:00:00Z',
  },
];

// A realistic GitLab releases payload — the field names differ from GitHub's,
// which is most of what this router exists to paper over.
const GITLAB_RELEASES = [
  {
    tag_name: 'v0.3.4',
    name: 'v0.3.4',
    released_at: '2026-08-30T12:00:00.000Z',
    upcoming_release: false,
    _links: { self: 'https://gitlab.com/havuq/homechronicle/-/releases/v0.3.4' },
  },
  {
    tag_name: 'v0.4.0-beta.1',
    released_at: '2026-08-31T12:00:00.000Z',
    upcoming_release: false,
    _links: { self: 'https://gitlab.com/havuq/homechronicle/-/releases/v0.4.0-beta.1' },
  },
];

function makeApp(fetchImpl) {
  const app = express();
  app.use('/api/updates', createUpdatesRouter({ fetchImpl }));
  return app;
}

// In-process, no sockets — see alerts-settings-router.test.js for why.
function get(app, url = '/api/updates/latest') {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET', url, originalUrl: url, headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      setHeader() { return this; },
      getHeader() { return undefined; },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    app.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

const okFetch = (payload) => async () => ({ ok: true, status: 200, json: async () => payload });

describe('normalizeRelease', () => {
  test('maps GitLab field names onto the shape the UI expects', () => {
    assert.deepEqual(normalizeRelease(GITLAB_RELEASES[0]), {
      tag: 'v0.3.4',
      url: 'https://gitlab.com/havuq/homechronicle/-/releases/v0.3.4',
      prerelease: false,
      publishedAt: '2026-08-30T12:00:00.000Z',
    });
  });

  // GitLab has no `prerelease` boolean — that is a GitHub concept. It is
  // derived from the tag, which is where this project already encodes it.
  test('derives prerelease from the tag', () => {
    assert.equal(normalizeRelease({ tag_name: 'v0.4.0-beta.1' }).prerelease, true);
    assert.equal(normalizeRelease({ tag_name: 'v0.4.0-rc.2' }).prerelease, true);
    assert.equal(normalizeRelease({ tag_name: 'v0.4.0' }).prerelease, false);
  });

  // `upcoming_release` means "dated in the future" — not a thing to offer as
  // an available update.
  test('drops upcoming releases and untagged entries', () => {
    assert.equal(normalizeRelease({ tag_name: 'v9.9.9', upcoming_release: true }), null);
    assert.equal(normalizeRelease({ tag_name: '' }), null);
    assert.equal(normalizeRelease({}), null);
  });

  test('maps GitHub field names onto the same shape', () => {
    assert.deepEqual(normalizeRelease(GITHUB_RELEASES[0]), {
      tag: 'v0.6.0',
      url: 'https://github.com/venam1s/homechronicle/releases/tag/v0.6.0',
      prerelease: false,
      publishedAt: '2026-11-20T12:00:00Z',
    });
  });

  // GitHub does have the flag — honour it even when the tag doesn't say so.
  test('honours GitHub\'s prerelease flag', () => {
    assert.equal(normalizeRelease({ tag_name: 'v0.6.0', prerelease: true }).prerelease, true);
  });

  // Drafts are not public; they only appear with a token, but never offer one.
  test('drops GitHub drafts', () => {
    assert.equal(normalizeRelease({ tag_name: 'v0.6.0', draft: true }), null);
  });
});

describe('resolveReleaseUrls', () => {
  test('defaults to GitHub first, then GitLab', () => {
    assert.deepEqual(resolveReleaseUrls({}), [GITHUB_RELEASES_URL, GITLAB_RELEASES_URL]);
    assert.match(GITHUB_RELEASES_URL, /^https:\/\/api\.github\.com\/repos\/venam1s\/homechronicle\/releases/);
    assert.match(GITLAB_RELEASES_URL, /^https:\/\/gitlab\.com\/api\/v4\/projects\/havuq%2Fhomechronicle\/releases/);
  });

  // An explicit UPDATE_CHECK_URL means exactly that URL — no silent fallback.
  test('UPDATE_CHECK_URL replaces the list entirely', () => {
    assert.deepEqual(resolveReleaseUrls({ UPDATE_CHECK_URL: ' https://example.test/releases ' }), ['https://example.test/releases']);
    assert.deepEqual(resolveReleaseUrls({ UPDATE_CHECK_URL: '   ' }), [GITHUB_RELEASES_URL, GITLAB_RELEASES_URL]);
  });
});

describe('GitHub first, GitLab fallback', () => {
  // Routes by URL so each test says exactly what each host answers.
  function routedFetch(routes, calls = []) {
    return async (url) => {
      calls.push(url);
      const host = new URL(url).hostname;
      const answer = routes[host];
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => answer };
    };
  }
  const makeRoutedApp = (routes, calls) => {
    const app = express();
    app.use('/api/updates', createUpdatesRouter({ fetchImpl: routedFetch(routes, calls) }));
    return app;
  };

  test('uses GitHub when it answers, and does not call GitLab', async () => {
    const calls = [];
    const res = await get(makeRoutedApp({ 'api.github.com': GITHUB_RELEASES, 'gitlab.com': GITLAB_RELEASES }, calls));
    assert.deepEqual(res.body.releases.map((r) => r.tag), ['v0.6.0']);
    assert.equal(res.body.source, 'github');
    assert.equal(res.body.upstreamOk, true);
    assert.equal(calls.length, 1);
  });

  test('falls back to GitLab when GitHub 404s (repo missing or account gone)', async () => {
    const res = await get(makeRoutedApp({ 'api.github.com': 404, 'gitlab.com': GITLAB_RELEASES }));
    assert.deepEqual(res.body.releases.map((r) => r.tag), ['v0.3.4', 'v0.4.0-beta.1']);
    assert.equal(res.body.source, 'gitlab');
    assert.equal(res.body.upstreamOk, true);
  });

  // Unauthenticated GitHub API calls are rate-limited per IP (403).
  test('falls back to GitLab when GitHub rate-limits or is unreachable', async () => {
    for (const github of [403, new Error('ENOTFOUND')]) {
      const res = await get(makeRoutedApp({ 'api.github.com': github, 'gitlab.com': GITLAB_RELEASES }));
      assert.equal(res.body.source, 'gitlab');
      assert.equal(res.body.releases.length, 2);
    }
  });

  // A GitHub repo that exists but has no releases yet must not hide GitLab's.
  test('falls back to GitLab when GitHub has no releases', async () => {
    const res = await get(makeRoutedApp({ 'api.github.com': [], 'gitlab.com': GITLAB_RELEASES }));
    assert.equal(res.body.source, 'gitlab');
    assert.equal(res.body.releases.length, 2);
  });

  test('both down degrades to an empty list, not a 500', async () => {
    const res = await get(makeRoutedApp({ 'api.github.com': 500, 'gitlab.com': new Error('ETIMEDOUT') }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.releases, []);
    assert.equal(res.body.upstreamOk, false);
    assert.equal(res.body.source, null);
  });

  test('the fallback result is cached like any other', async () => {
    const calls = [];
    const app = makeRoutedApp({ 'api.github.com': 404, 'gitlab.com': GITLAB_RELEASES }, calls);
    await get(app); await get(app); await get(app);
    assert.equal(calls.length, 2);
  });

  // GitHub's API rejects requests without a User-Agent.
  test('sends a User-Agent', async () => {
    let headers;
    const app = express();
    app.use('/api/updates', createUpdatesRouter({
      fetchImpl: async (_url, opts) => { headers = opts?.headers; return { ok: true, status: 200, json: async () => GITHUB_RELEASES }; },
    }));
    await get(app);
    assert.ok(headers?.['user-agent']);
  });
});

describe('GET /api/updates/latest', () => {
  test('returns the normalized releases', async () => {
    const res = await get(makeApp(okFetch(GITLAB_RELEASES)));
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.deepEqual(res.body.releases.map((r) => r.tag), ['v0.3.4', 'v0.4.0-beta.1']);
    assert.equal(res.body.upstreamOk, true);
  });

  test('caches, so N clients do not mean N calls to gitlab.com', async () => {
    let calls = 0;
    const app = makeApp(async () => { calls += 1; return { ok: true, status: 200, json: async () => GITLAB_RELEASES }; });
    await get(app); await get(app); await get(app);
    assert.equal(calls, 1);
  });

  // A self-hosted box with no internet must not surface errors over this.
  test('an upstream failure degrades to an empty list, not a 500', async () => {
    const res = await get(makeApp(async () => { throw new Error('ENOTFOUND'); }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.releases, []);
    assert.equal(res.body.upstreamOk, false);
  });

  test('a non-200 upstream response is treated as a failure', async () => {
    const res = await get(makeApp(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.releases, []);
    assert.equal(res.body.upstreamOk, false);
  });

  test('junk from upstream does not become junk in the response', async () => {
    const res = await get(makeApp(okFetch({ not: 'an array' })));
    assert.deepEqual(res.body.releases, []);
  });

  test('sends an abort signal so a hung upstream cannot pin the request open', async () => {
    let sawSignal = false;
    await get(makeApp(async (_url, opts) => {
      sawSignal = Boolean(opts?.signal);
      return { ok: true, status: 200, json: async () => [] };
    }));
    assert.equal(sawSignal, true);
  });
});
