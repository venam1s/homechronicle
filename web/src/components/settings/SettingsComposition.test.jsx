/**
 * The two settings pages mounted under the real providers: the real ToastProvider,
 * QueryClientProvider and UserPreferencesProvider, the real useSetup, and the real
 * GeneralSection / PreferencesSection with their real groups and hooks. Only the
 * network (fetchJson, answered by URL from a small table) and the auth hooks are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import { UserPreferencesProvider } from '../UserPreferencesProvider.jsx';
import { fetchJson } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useAuthConfig } from '../../hooks/useAuthConfig.js';
import { useSetup } from '../../hooks/useSetup.js';
import GeneralSection from './GeneralSection.jsx';
import PreferencesSection from './PreferencesSection.jsx';

vi.mock('../../lib/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchJson: vi.fn(),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useAuthConfig.js', () => ({
  useAuthConfig: vi.fn(),
}));

const RETENTION = {
  retentionDays: 365,
  staleThresholdHours: 24,
  archiveBeforeDelete: true,
  autoScanHomeKit: false,
  toastsEnabled: true,
  liveEventToastsEnabled: false,
  toastPosition: 'bottom-right',
  toastDuration: 3,
  toastMaxVisible: 3,
  toastAccessories: [],
  episodeWindowMinutes: 3,
  sceneWindowSeconds: 5,
};

// GET answers by URL suffix; anything not listed answers {}.
const GET_TABLE = [
  ['/api/setup/retention', () => RETENTION],
  ['/api/setup/repair', () => ({ enabled: false, hour: 3 })],
  ['/api/setup/alerts', () => ({ quietMinutes: 15, webhookTimeoutMs: 5000, webhookTimeoutFromEnv: false })],
  ['/api/setup/log-level', () => ({ level: 'info' })],
  ['/api/setup/discovered', () => ({ accessories: [] })],
  ['/api/setup/pairings', () => []],
  ['/api/setup/matter/pairings', () => []],
  ['/accessories', () => []],
  ['/archive/count', () => ({ count: 0 })],
  ['/me/preferences', () => ({ prefs: { toastsEnabled: true } })],
];

function answer(url, options = {}) {
  const method = options.method ?? 'GET';
  if (method === 'PATCH' && url.endsWith('/api/setup/retention')) {
    return { ...RETENTION, ...JSON.parse(options.body) };
  }
  if (method === 'PUT' && url.endsWith('/me/preferences')) {
    return { prefs: { toastsEnabled: true, ...JSON.parse(options.body).prefs } };
  }
  const row = GET_TABLE.find(([suffix]) => url.endsWith(suffix));
  return row ? row[1]() : {};
}

const callsTo = (method, suffix) => fetchJson.mock.calls.filter(
  ([url, options]) => (options?.method ?? 'GET') === method && url.endsWith(suffix),
);

function SetupPage({ Section }) {
  const setup = useSetup();
  return <Section setup={setup} onNavigate={() => {}} />;
}

function renderPage(Section) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UserPreferencesProvider>
          <SetupPage Section={Section} />
        </UserPreferencesProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let user;

describe('settings pages under the real providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    fetchJson.mockImplementation(async (url, options) => answer(url, options));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('auth off: a household switch on General saves through the retention PATCH and confirms', async () => {
    useAuthConfig.mockReturnValue({ authEnabled: false, isLoading: false });
    useAuth.mockReturnValue({ user: null });
    renderPage(GeneralSection);

    const autoScan = screen.getByRole('switch', { name: 'HomeKit auto-scan' });
    await vi.waitFor(() => expect(autoScan).toBeEnabled());
    expect(autoScan).toHaveAttribute('aria-checked', 'false');

    await user.click(autoScan);
    await act(() => vi.advanceTimersByTimeAsync(300));

    const patches = callsTo('PATCH', '/api/setup/retention');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0][1].body)).toEqual({ autoScanHomeKit: true });
    expect(await screen.findByText('Setting saved')).toBeInTheDocument();
  });

  it('signed in: Toast notifications on Preferences writes the account preferences, not the household', async () => {
    useAuthConfig.mockReturnValue({ authEnabled: true, isLoading: false });
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@example.test' } });
    renderPage(PreferencesSection);

    const toasts = screen.getByRole('switch', { name: 'Toast notifications' });
    // Wait for the account preferences to load, so the provider's flush is not gated.
    await vi.waitFor(() => expect(callsTo('GET', '/me/preferences')).toHaveLength(1));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(toasts).toHaveAttribute('aria-checked', 'true');

    await user.click(toasts);
    expect(toasts).toHaveAttribute('aria-checked', 'false');
    // The provider coalesces preference writes for 500ms before the PUT.
    await act(() => vi.advanceTimersByTimeAsync(600));

    const puts = callsTo('PUT', '/me/preferences');
    expect(puts.length).toBeGreaterThan(0);
    expect(JSON.parse(puts.at(-1)[1].body).prefs).toMatchObject({ toastsEnabled: false });
    expect(callsTo('PATCH', '/api/setup/retention')).toHaveLength(0);
  });
});
