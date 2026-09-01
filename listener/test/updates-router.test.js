import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createUpdatesRouter, normalizeRelease } from '../src/updates-router.js';

/**
 * The update check is proxied server-side because the browser cannot do it:
 * the SPA is served with `connect-src 'self'`, and the old target
 * (api.github.com/repos/havuq/...) 404s since the GitHub account went away.
 */

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
