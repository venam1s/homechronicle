/**
 * useUserPreferences.test.js — RED stubs for the server-blob hook.
 *
 * Wave-0: These tests are expected to FAIL until plan 24-03 implements
 * web/src/hooks/useUserPreferences.js. Do NOT weaken assertions to pass early.
 *
 * Contracts under test:
 * - queryKey is ['me','preferences'] (NOT ['auth','me'] — collision guard, D-09)
 * - queryFn unwraps d?.prefs ?? {} (self-contained, mirrors useAuth.js pattern)
 * - query disabled when user is null (PREF-05/D-15)
 * - PUT mutation sends { prefs: <blob> } and updates the cache
 * - debounce in setPrefs coalesces rapid writes into ONE fetchJson PUT (D-09)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
  withApiAuthHeaders: (h = {}) => h,
}));

vi.mock('./useAuth.js', () => ({
  useAuth: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';
import { useAuth } from './useAuth.js';
import { useUserPreferences } from './useUserPreferences.js';
import { usePreference } from './usePreference.js';
import { UserPreferencesProvider } from '../components/UserPreferencesProvider.jsx';

// The query/debounce/seed logic lives in UserPreferencesProvider; useUserPreferences is a
// thin context consumer (CR-01 fix). The wrapper nests the provider so the consumer sees
// the real shared buffer.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return { wrapper: function Wrapper({ children }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(UserPreferencesProvider, null, children),
    );
  }, queryClient };
}

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses query key [me, preferences] — distinct from [auth, me] (D-09 collision guard)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark' } });

    const { wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Verify the hook fetches the correct endpoint (implies correct query key).
    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/me/preferences'),
    );
    // Assert via React Query cache: the correct key must hold the unwrapped blob.
    expect(queryClient.getQueryData(['me', 'preferences'])).toEqual({ theme: 'dark' });
  });

  it('queryFn unwraps d?.prefs ?? {} — does not return the raw envelope', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', accent: 'ocean' } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Must be the unwrapped blob, not { prefs: { ... } }.
    expect(result.current.prefs).toEqual({ theme: 'dark', accent: 'ocean' });
    expect(result.current.prefs?.prefs).toBeUndefined();
  });

  it('returns empty object when blob is empty (D-04)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    expect(result.current.prefs).toEqual({});
  });

  it('query is DISABLED and fetchJson not called when user is null (PREF-05/D-15)', async () => {
    useAuth.mockReturnValue({ user: null });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    // Give the query a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Must not have called the server — enabled: !!user?.id is false.
    expect(fetchJson).not.toHaveBeenCalled();
    // prefs should be undefined or {} (query never ran).
    expect(result.current.prefs == null || Object.keys(result.current.prefs ?? {}).length === 0).toBe(true);
  });

  it('PUT mutation sends { prefs: blob } to /me/preferences', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    const newBlob = { theme: 'light', accent: 'purple' };
    fetchJson.mockResolvedValue({ prefs: newBlob });
    await result.current.setPrefsBlob(newBlob);

    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/me/preferences'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ prefs: newBlob }),
      }),
    );
  });

  it('PUT mutation updates the React Query cache on success', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    const newBlob = { theme: 'dark' };
    fetchJson.mockResolvedValue({ prefs: newBlob });
    await result.current.setPrefsBlob(newBlob);

    await waitFor(() => expect(result.current.prefs).toEqual(newBlob));
  });

  it('debounce coalesces rapid setPrefsBlob calls into ONE fetchJson PUT (D-09)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    // Initial GET returns empty blob.
    fetchJson.mockResolvedValue({ prefs: {} });

    vi.useFakeTimers();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    // Let the initial GET settle.
    await act(async () => { vi.advanceTimersByTime(0); });
    fetchJson.mockClear();

    // Rapid successive setPrefsBlob calls with different keys.
    await act(async () => {
      result.current.setPrefsBlob({ theme: 'dark' });
      result.current.setPrefsBlob({ accent: 'purple' });
    });

    // Advance past the debounce window.
    await act(async () => { vi.advanceTimersByTime(1000); });

    vi.useRealTimers();

    // D-09: debounce must coalesce into ONE PUT.
    const putCalls = fetchJson.mock.calls.filter(
      ([, opts]) => opts?.method === 'PUT',
    );
    expect(putCalls).toHaveLength(1);
    // The single PUT must carry BOTH keys merged.
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', accent: 'purple' });
  });
});

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: vi.fn((k) => (k in store ? store[k] : null)),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  };
}

describe('cross-instance debounce (CR-01 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('coalesces setValue across TWO usePreference instances into ONE PUT carrying both keys', async () => {
    // The bug this guards: when each usePreference instance owned its own debounce buffer,
    // two near-simultaneous setValue calls fired TWO racing whole-blob PUTs and the
    // last-to-arrive (fewest keys) won server-side. With ONE shared provider buffer there is
    // exactly ONE PUT containing every key.
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({
      a: usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference', serialize: (v) => v, deserialize: (v) => v }),
      b: usePreference('accent', 'ocean', { localStorageKey: 'hc_accent', serialize: (v) => v, deserialize: (v) => v }),
    }), { wrapper });

    await waitFor(() => expect(result.current.a[0]).toBeDefined());
    fetchJson.mockClear();
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', accent: 'purple' } });

    vi.useFakeTimers();
    act(() => {
      result.current.a[1]('dark');   // setValue on instance A
      result.current.b[1]('purple'); // setValue on instance B (near-simultaneous)
    });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', accent: 'purple' });
  });

  it('serializes PUTs across debounce windows — a later PUT waits for the in-flight one', async () => {
    // Guards the across-window variant of CR-01: an earlier slow PUT must not be sent
    // concurrently with (or land after) a newer one, or an older value of a key could be
    // applied last. Each PUT carries only its own window's keys (the server merges).
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });

    const putBodies = [];
    let resolveFirstPut;
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === 'PUT') {
        const sent = JSON.parse(opts.body).prefs;
        putBodies.push(sent);
        if (putBodies.length === 1) {
          return new Promise((res) => { resolveFirstPut = () => res({ prefs: sent }); });
        }
        return Promise.resolve({ prefs: sent });
      }
      return Promise.resolve({ prefs: {} });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ a: 1 }); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(putBodies).toHaveLength(1); // first PUT dispatched, now in-flight

    act(() => { result.current.setPrefsBlob({ b: 2 }); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(putBodies).toHaveLength(1); // second PUT held back — first is still in-flight (serialized)

    await act(async () => { resolveFirstPut(); await Promise.resolve(); });
    vi.useRealTimers();

    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(putBodies).toEqual([{ a: 1 }, { b: 2 }]); // partials, in dispatch order
    await waitFor(() => expect(result.current.prefs).toMatchObject({ a: 1, b: 2 }));
  });
});

describe('flush gating (M-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never-resolving GET: setPrefsBlob + 3000ms produces ZERO PUT calls, partial stays buffered', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockImplementation((url, opts) => (
      opts?.method === 'PUT' ? Promise.resolve({ prefs: {} }) : new Promise(() => {})
    ));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ theme: 'dark' }); });
    await act(async () => { vi.advanceTimersByTime(3000); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  it('slow GET: the pending key is sent in exactly ONE PUT once the GET resolves, and the cache keeps the fetched keys', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });

    let resolveGet;
    const gate = new Promise((r) => { resolveGet = r; });
    // Like the real server: PUT shallow-merges into the stored blob and returns all of it.
    const serverBlob = { a: 1, b: 2 };
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === 'PUT') {
        Object.assign(serverBlob, JSON.parse(opts.body).prefs);
        return Promise.resolve({ prefs: { ...serverBlob } });
      }
      return gate;
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ theme: 'dark' }); });
    await act(async () => { vi.advanceTimersByTime(1500); });

    let putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(0);

    resolveGet({ prefs: { a: 1, b: 2 } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toEqual({ theme: 'dark' });
    expect(result.current.prefs).toMatchObject({ a: 1, b: 2, theme: 'dark' });
  });

  it('the pre-existing coalescing behaviour is unaffected once the query is success', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    vi.useFakeTimers();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    await act(async () => { vi.advanceTimersByTime(0); });
    fetchJson.mockClear();

    act(() => {
      result.current.setPrefsBlob({ theme: 'dark' });
      result.current.setPrefsBlob({ accent: 'purple' });
    });
    await act(async () => { vi.advanceTimersByTime(1000); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', accent: 'purple' });
  });

  it('budget exhaustion: never-resolving GET abandons the flush without hanging the caller promise', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockImplementation((url, opts) => (
      opts?.method === 'PUT' ? Promise.resolve({ prefs: {} }) : new Promise(() => {})
    ));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    vi.useFakeTimers();
    let p;
    act(() => { p = result.current.setPrefsBlob({ theme: 'dark' }); });
    await act(async () => { vi.advanceTimersByTime(11_000); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('seedIfEmpty (PREF-11/D-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage({ hc_theme_preference: 'dark' }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('seeds exactly once when the blob is empty (snapshot + shared values), ignoring repeat calls', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());
    fetchJson.mockClear();
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', toastsEnabled: true } });

    vi.useFakeTimers();
    act(() => {
      result.current.seedIfEmpty({ toastsEnabled: true });
      result.current.seedIfEmpty({ toastsEnabled: true }); // second call must be a no-op (ref-guarded)
    });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', toastsEnabled: true });
  });

  it('does not seed when the blob is already non-empty', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'light' } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toEqual({ theme: 'light' }));
    fetchJson.mockClear();

    vi.useFakeTimers();
    act(() => { result.current.seedIfEmpty({ toastsEnabled: true }); });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });
});

// -- Last-chance write when the page goes away --
//
// flushNow() covers the sign-out button, but a debounced write was still lost
// when the tab was closed or the session expired inside the 500ms window: a
// normal fetch is cancelled along with the document. This path hands the
// request over with keepalive so it survives the page.
describe('flush on page hide', () => {
  const user = { id: 42, role: 'member', email: 'u@example.com' };
  let rawFetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    rawFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    globalThis.fetch = rawFetch;
    useAuth.mockReturnValue({ user });
    fetchJson.mockResolvedValue({ prefs: { theme: 'light' } });
  });

  afterEach(() => {
    delete globalThis.fetch;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  async function mounted() {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());
    return result;
  }

  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  const putCall = () => rawFetch.mock.calls.find(([, o]) => o?.method === 'PUT');

  it('writes a buffered change when the page is hidden', async () => {
    const result = await mounted();
    act(() => { result.current.setPrefsBlob({ palette: 'graphite' }); });
    act(() => { hide(); });

    const call = putCall();
    expect(call, 'a buffered preference must be written on hide').toBeTruthy();
    const [url, opts] = call;
    expect(url).toContain('/me/preferences');
    expect(opts.keepalive, 'without keepalive the request dies with the page').toBe(true);
    expect(opts.credentials).toBe('include');
    // Without this the listener's express.json() ignores the body entirely.
    expect(opts.headers['Content-Type']).toBe('application/json');
    // Only the un-written partial: the server merges it with `jsonb ||`.
    expect(JSON.parse(opts.body)).toEqual({ prefs: { palette: 'graphite' } });
  });

  it('also writes on pagehide (desktop close / bfcache)', async () => {
    const result = await mounted();
    act(() => { result.current.setPrefsBlob({ palette: 'ink' }); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(JSON.parse(putCall()[1].body)).toEqual({ prefs: { palette: 'ink' } });
  });

  it('sends nothing when there is nothing buffered', async () => {
    await mounted();
    act(() => { hide(); });
    expect(putCall()).toBeUndefined();
  });

  it('sends nothing for a signed-out visitor', async () => {
    useAuth.mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    act(() => { result.current.setPrefsBlob({ palette: 'ink' }); });
    act(() => { hide(); });
    expect(putCall()).toBeUndefined();
  });

  it('does not fire twice when hide is followed by pagehide', async () => {
    const result = await mounted();
    act(() => { result.current.setPrefsBlob({ palette: 'tide' }); });
    act(() => { hide(); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(rawFetch.mock.calls.filter(([, o]) => o?.method === 'PUT')).toHaveLength(1);
  });

  it('stops listening once unmounted', async () => {
    const { wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());
    act(() => { result.current.setPrefsBlob({ palette: 'fern' }); });
    unmount();
    act(() => { hide(); });
    expect(putCall()).toBeUndefined();
  });
});

describe('partial writes (cross-tab / cross-device clobber)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only the changed keys, never values from this tab\'s cached copy', async () => {
    // A tab that loaded the account blob while theme was 'dark' must not push 'dark' back
    // when it saves an unrelated key — another tab or device may have set 'system' since.
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === 'PUT') {
        // The server merges the partial into what it holds (another tab already wrote 'system').
        return Promise.resolve({ prefs: { theme: 'system', palette: 'ink', ...JSON.parse(opts.body).prefs } });
      }
      return Promise.resolve({ prefs: { theme: 'dark', palette: 'ink' } });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toEqual({ theme: 'dark', palette: 'ink' }));

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ dashboardHidden: ['kpis'] }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    expect(JSON.parse(putCalls[0][1].body).prefs).toEqual({ dashboardHidden: ['kpis'] });
    // The server's merged reply refreshes the stale copy, so this tab learns 'system' too.
    await waitFor(() => expect(result.current.prefs).toEqual({ theme: 'system', palette: 'ink', dashboardHidden: ['kpis'] }));
  });
});

describe('failed saves are retried (partial writes must not be lost)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('re-sends the keys of a PUT that failed on a transient error', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    const putBodies = [];
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === 'PUT') {
        const sent = JSON.parse(opts.body).prefs;
        putBodies.push(sent);
        if (putBodies.length === 1) return Promise.reject(Object.assign(new Error('Bad Gateway'), { status: 502 }));
        return Promise.resolve({ prefs: { ...sent } });
      }
      return Promise.resolve({ prefs: {} });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toEqual({}));

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ theme: 'system' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    act(() => { result.current.setPrefsBlob({ palette: 'ink' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    vi.useRealTimers();

    expect(putBodies[0]).toEqual({ theme: 'system' });
    expect(putBodies.at(-1)).toEqual({ theme: 'system', palette: 'ink' });
  });

  it('does not retry a PUT the server rejected as invalid', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockImplementation((url, opts) => (opts?.method === 'PUT'
      ? Promise.reject(Object.assign(new Error('prefs payload too large'), { status: 400 }))
      : Promise.resolve({ prefs: {} })));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toEqual({}));

    vi.useFakeTimers();
    act(() => { result.current.setPrefsBlob({ theme: 'system' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    vi.useRealTimers();

    expect(fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT')).toHaveLength(1);
  });
});

describe('a value adopted from another tab also updates the shared cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage({ hc_theme_preference: 'dark' }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('never re-applies the stale cached value after a storage event', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockImplementation((url, opts) => (opts?.method === 'PUT'
      ? new Promise(() => {}) // in flight forever: no echo can repair the cache
      : Promise.resolve({ prefs: { theme: 'dark' } })));

    const { wrapper, queryClient } = makeWrapper();
    const codec = { localStorageKey: 'hc_theme_preference', serialize: (v) => v, deserialize: (v) => v, followOtherTabs: true };
    const { result } = renderHook(() => ({
      theme: usePreference('theme', 'system', codec),
      prefs: useUserPreferences(),
    }), { wrapper });
    await waitFor(() => expect(result.current.prefs.prefs).toEqual({ theme: 'dark' }));

    // Another tab switches to System.
    act(() => {
      window.dispatchEvent(Object.assign(new Event('storage'), { key: 'hc_theme_preference', newValue: 'system' }));
    });
    expect(result.current.theme[0]).toBe('system');
    expect(queryClient.getQueryData(['me', 'preferences'])).toMatchObject({ theme: 'system' });

    // This tab then saves something unrelated.
    localStorage.setItem.mockClear();
    vi.useFakeTimers();
    act(() => { result.current.prefs.setPrefsBlob({ palette: 'ink' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    vi.useRealTimers();

    expect(result.current.theme[0]).toBe('system');
    expect(localStorage.setItem).not.toHaveBeenCalledWith('hc_theme_preference', 'dark');
    expect(queryClient.getQueryData(['me', 'preferences'])).toMatchObject({ theme: 'system', palette: 'ink' });
  });
});
