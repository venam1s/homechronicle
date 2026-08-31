/**
 * Composition test for the app-wide context tree.
 *
 * Neither unit suite can see the defect this guards. AppearanceProvider.test
 * mocks useUserPreferences away entirely; UserPreferencesProvider.test never
 * paints a palette. Both were green while the tree main.jsx actually rendered
 * put appearance OUTSIDE the preferences provider, so a signed-in user's saved
 * palette was silently never applied on a fresh device (PAL-03).
 *
 * So this renders the real AppProviders and asserts on behaviour, not on the
 * order of substrings in a source file — a source-position check cannot express
 * this invariant at all, because the route element that also mentions the
 * provider appears earlier in main.jsx than the render block does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fetchJson = vi.fn();

vi.mock('../lib/api.js', () => ({
  fetchJson: (...args) => fetchJson(...args),
  API_BASE: '/api',
  withApiAuthHeaders: (h = {}) => h,
}));
// A signed-in user: the preferences query is gated on user?.id, and
// usePreference only reconciles from the blob when a user is present.
vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: { id: 1, email: 'user@example.com' } }),
}));

const { default: AppProviders } = await import('./AppProviders.jsx');
const { UserPreferencesProvider } = await import('./UserPreferencesProvider.jsx');
const { default: AppearanceProvider } = await import('./AppearanceProvider.jsx');
const { DEFAULT_PALETTE } = await import('../lib/palettes.js');

// The account's saved palette, deliberately not the default.
const ACCOUNT_PALETTE = 'dusk';

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderTree(tree) {
  return render(<QueryClientProvider client={newClient()}>{tree}</QueryClientProvider>);
}

describe('AppProviders', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    // Envelope shape matters: the provider's queryFn unwraps `d?.prefs ?? {}`.
    fetchJson.mockResolvedValue({ prefs: { palette: ACCOUNT_PALETTE } });
    // A fresh device — nothing cached locally, so the blob is the only source.
    localStorage.clear();
    document.documentElement.removeAttribute('data-palette');
  });

  it('renders its children', async () => {
    renderTree(<AppProviders><span>app</span></AppProviders>);
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  // PAL-03: the palette follows the account, not the browser.
  it('paints the account palette on a device with no local choice', async () => {
    renderTree(<AppProviders><span>app</span></AppProviders>);
    await waitFor(() =>
      expect(document.documentElement.dataset.palette).toBe(ACCOUNT_PALETTE));
  });

  it('mirrors the account palette into localStorage so the next load is flash-free', async () => {
    renderTree(<AppProviders><span>app</span></AppProviders>);
    await waitFor(() => expect(localStorage.getItem('hc_palette')).toBe(ACCOUNT_PALETTE));
  });

  // Exactly one preferences provider: a second, nested instance splits the
  // shared debounce buffer and brings back the racing whole-blob PUTs of CR-01.
  it('mounts a single preferences provider', () => {
    const src = AppProviders.toString();
    expect(src).not.toMatch(/UserPreferencesProvider[\s\S]*UserPreferencesProvider[\s\S]*UserPreferencesProvider/);
  });
});

// The discriminator. This is the tree that shipped; if it also passed the
// assertions above, they would be guarding nothing.
describe('the inverted nesting that shipped', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    fetchJson.mockResolvedValue({ prefs: { palette: ACCOUNT_PALETTE } });
    localStorage.clear();
    document.documentElement.removeAttribute('data-palette');
  });

  it('fetches the blob but never applies it', async () => {
    renderTree(
      <AppearanceProvider>
        <UserPreferencesProvider><span>app</span></UserPreferencesProvider>
      </AppearanceProvider>,
    );

    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    // Blob fetched, palette never applied — the failure really was this quiet.
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE);
    expect(localStorage.getItem('hc_palette')).toBeNull();
  });
});
