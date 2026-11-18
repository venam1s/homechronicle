/**
 * useUserPreferences.seed.test.jsx
 *
 * seedIfEmpty (useUserPreferences / UserPreferencesProvider): the PUT body carries a
 * representative dashboard key AND a theme key AND the toast values passed by the
 * caller, not just the toast values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

// Mock useAuth at the module level; the test sets the signed-in user.
vi.mock('./useAuth.js', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from './useAuth.js';

// ── Suite C: seedIfEmpty body includes dashboard + theme + toast values ──

describe('C. seedIfEmpty assembles full D-12 snapshot (theme + dashboard + toast values)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('seedIfEmpty PUT body contains hc_theme_preference, hc_dashboard_layouts, AND toast values', async () => {
    // Populate localStorage with D-12 keys that seedIfEmpty reads.
    localStorage.setItem('hc_theme_preference', 'dark');
    localStorage.setItem('hc_dashboard_layouts', JSON.stringify([{ i: 'events', x: 0, y: 0, w: 4, h: 4 }]));
    localStorage.setItem('hc_hidden_dashboard_panels', JSON.stringify(['alerts']));

    // Import the actual useUserPreferences to call seedIfEmpty directly.
    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { QueryClient: QC, QueryClientProvider: QCP } = await import('@tanstack/react-query');
    const { fetchJson } = await import('../lib/api.js');

    // Reset mocks for this isolated test — we need the real usePreference chain.
    // Re-mock fetchJson for this test: GET /me/preferences returns empty blob.
    fetchJson.mockImplementation((url, opts) => {
      if (typeof url === 'string' && url.includes('/me/preferences')) {
        if (opts?.method === 'PUT') {
          return Promise.resolve({ prefs: JSON.parse(opts.body).prefs });
        }
        return Promise.resolve({ prefs: {} });
      }
      return Promise.resolve({});
    });

    // For this test, use the real useUserPreferences by bypassing the module-level mock.
    // vi.importActual returns the un-mocked module even when vi.mock is active.
    const { useUserPreferences: realUseUserPreferences } = await vi.importActual('./useUserPreferences.js');
    // The query/debounce/seed logic lives in UserPreferencesProvider (CR-01 fix); the
    // consumer hook reads it from context, so the provider must wrap the renderHook tree.
    const { UserPreferencesProvider } = await vi.importActual('../components/UserPreferencesProvider.jsx');

    const qc = new QC({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });

    // Stub useAuth to return authed user for this specific test
    // Note: we've already vi.mocked useAuth above; we re-use that mock here.
    useAuth.mockReturnValue({ user: { id: 99, role: 'admin', email: 'seed@example.com' } });

    const wrapper = ({ children }) => createElement(
      QCP,
      { client: qc },
      createElement(UserPreferencesProvider, null, children),
    );
    const { result } = renderHook(() => realUseUserPreferences(), { wrapper });

    // Wait for the prefs query to resolve (returns {}).
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Call seedIfEmpty with toast + grouping values (as App.jsx does).
    await act(async () => {
      result.current.seedIfEmpty({
        toastsEnabled: true,
        liveEventToastsEnabled: false,
        toastPosition: 'bottom-right',
        toastDuration: 3,
        toastMaxVisible: 3,
        episodeWindowMinutes: 3,
        sceneWindowSeconds: 5,
        episodeMinEventCount: 3,
      });
      // Allow debounce (500ms) to fire.
      await new Promise((r) => setTimeout(r, 600));
    });

    // Find the PUT call that carried the full seed body.
    const putCalls = fetchJson.mock.calls.filter(
      ([, opts]) => opts?.method === 'PUT',
    );

    expect(putCalls.length).toBeGreaterThanOrEqual(1);

    const body = JSON.parse(putCalls[0][1].body);
    const prefs = body.prefs;

    // Must include theme value from localStorage (D-12 inventory includes hc_theme_preference).
    expect(prefs).toHaveProperty('theme');

    // Must include a dashboard layout key (D-12 inventory includes hc_dashboard_layouts).
    expect(prefs).toHaveProperty('dashboardLayouts');

    // Must include toast values passed by the caller.
    expect(prefs).toMatchObject({
      toastsEnabled: true,
      liveEventToastsEnabled: false,
      toastPosition: 'bottom-right',
    });
  });
});
