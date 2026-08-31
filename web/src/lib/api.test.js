import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson } from './api.js';

function ok(body = {}) {
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) };
}
const headersOf = () => globalThis.fetch.mock.calls[0][1].headers;

describe('fetchJson Content-Type', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ok());
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });
  afterEach(() => { delete globalThis.fetch; });

  // The bug: fetch types a bare string body as text/plain, express.json() only
  // parses application/json, so the route saw req.body === {} and 400ed. The
  // preferences PUT was the one call site that omitted the header, and its
  // fire-and-forget catch swallowed the rejection — account preference sync
  // silently never worked against a real server.
  it('defaults to application/json for a string body', async () => {
    await fetchJson('/api/me/preferences', { method: 'PUT', body: JSON.stringify({ prefs: {} }) });
    expect(headersOf()['Content-Type']).toBe('application/json');
  });

  it('does not add one to a GET with no body', async () => {
    await fetchJson('/api/events');
    const h = headersOf();
    expect(Object.keys(h).some((k) => k.toLowerCase() === 'content-type')).toBe(false);
  });

  it('leaves an explicit header alone, whatever its casing', async () => {
    await fetchJson('/api/x', { method: 'POST', body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const h = headersOf();
    expect(h['content-type']).toBe('application/x-www-form-urlencoded');
    expect(h['Content-Type']).toBeUndefined();
  });

  // FormData and friends set their own type (multipart needs a generated
  // boundary); overriding it would corrupt the request.
  it('does not touch a non-string body', async () => {
    await fetchJson('/api/upload', { method: 'POST', body: new FormData() });
    const h = headersOf();
    expect(Object.keys(h).some((k) => k.toLowerCase() === 'content-type')).toBe(false);
  });
});
