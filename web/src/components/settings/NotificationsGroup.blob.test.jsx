/**
 * NotificationsGroup.blob.test.jsx
 *
 * PREF-10/PREF-11: where toast preference changes are written, by sign-in state:
 *
 * A. Signed in: a toast change writes the blob setter (via usePreference), NOT
 *    saveRetentionMutation.
 * B. Signed out: a toast change goes through the household saver to
 *    saveRetentionMutation, NOT the blob setter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import NotificationsGroup from './NotificationsGroup.jsx';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

// Mock useAuth at the module level — individual tests override via mockReturnValue.
vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

// Auth on. Mocked so its query never resolves mid-test and re-renders the
// group, which would replace the setters recorded in prefSetters below.
vi.mock('../../hooks/useAuthConfig.js', () => ({
  useAuthConfig: () => ({ authEnabled: true, isLoading: false }),
}));

// Mock usePreference so we can spy on blob setters without needing a real server.
// The factory receives (key, defaultValue, opts) and returns [defaultValue, setter].
// We expose the setters via a module-level registry so tests can assert on them.
// prefSetters holds the latest render's setter; everySetter holds every setter
// handed out, so "never called" holds across re-renders too.
const prefSetters = {};
const everySetter = {};

vi.mock('../../hooks/usePreference.js', () => ({
  usePreference: vi.fn((key, defaultValue) => {
    const setter = vi.fn();
    prefSetters[key] = setter;
    (everySetter[key] ??= []).push(setter);
    return [defaultValue, setter];
  }),
}));

vi.mock('../../hooks/useUserPreferences.js', () => ({
  useUserPreferences: vi.fn(() => ({
    prefs: {},
    isLoading: false,
    setPrefsBlob: vi.fn(),
    seedIfEmpty: vi.fn(),
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { useAuth } from '../../hooks/useAuth.js';
import { usePreference } from '../../hooks/usePreference.js';

function makeSetup(overrides = {}) {
  return {
    retentionConfig: {
      retentionDays: 365,
      staleThresholdHours: 24,
      archiveBeforeDelete: true,
      autoScanHomeKit: true,
      quietHoursEnabled: false,
      quietHoursStart: 22,
      quietHoursEnd: 6,
      episodeWindowMinutes: 3,
      sceneWindowSeconds: 5,
      episodeMinEventCount: 3,
      toastsEnabled: true,
      liveEventToastsEnabled: false,
      toastPosition: 'bottom-right',
      toastDuration: 3,
      toastMaxVisible: 3,
      toastAccessories: [],
      quietHoursExcludedAccessories: [],
    },
    saveRetentionMutation: {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
    dbAccessories: [],
    paired: [],
    ...overrides,
  };
}

function renderGroup(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NotificationsGroup setup={setup} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function resetPreferenceMock() {
  for (const key of Object.keys(prefSetters)) delete prefSetters[key];
  for (const key of Object.keys(everySetter)) delete everySetter[key];
  usePreference.mockImplementation((key, defaultValue) => {
    const setter = vi.fn();
    prefSetters[key] = setter;
    (everySetter[key] ??= []).push(setter);
    return [defaultValue, setter];
  });
}

const setterCalled = (key) => (everySetter[key] ?? []).some((s) => s.mock.calls.length > 0);

// Household saves debounce 300ms; see DevicesGroup.test.jsx for why both options are needed.
let user;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => { vi.useRealTimers(); });

// ── Suite A: Signed in — toast changes go to blob setter, not saveRetentionMutation ──

describe('A. Authed path — toast toggle routes to blob setter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreferenceMock();
  });

  it('clicking "Toast notifications" switch calls blob setter, NOT saveRetentionMutation', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@example.com' } });
    const setup = makeSetup();
    renderGroup(setup);

    // Defaults to on (toastsEnabled: true). Turn it off.
    await user.click(screen.getByRole('switch', { name: 'Toast notifications' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(prefSetters['toastsEnabled']).toHaveBeenCalledWith(false);
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
  });

  it('toggling "Live event toasts" calls blob setter, NOT saveRetentionMutation', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@example.com' } });
    const setup = makeSetup();
    renderGroup(setup);

    // Defaults to off (liveEventToastsEnabled: false). Turn it on.
    await user.click(screen.getByRole('switch', { name: 'Live event toasts' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(prefSetters['liveEventToastsEnabled']).toHaveBeenCalledWith(true);
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
  });

  it('changing toast position calls blob setter, NOT saveRetentionMutation', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@example.com' } });
    const setup = makeSetup();
    renderGroup(setup);

    const positionSelect = screen.getByRole('combobox', { name: 'Toast position' });
    expect(Array.from(positionSelect.options).some((o) => o.textContent.includes('Bottom Right'))).toBe(true);
    await user.selectOptions(positionSelect, 'top-right');
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(prefSetters['toastPosition']).toHaveBeenCalledWith('top-right');
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
  });
});

// ── Suite B: Signed out — toast changes route to the household saver ──

describe('B. Anon path — toast toggle routes to saveRetentionMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreferenceMock();
    useAuth.mockReturnValue({ user: null });
  });

  it('toggling "Toast notifications" anon path: saveRetentionMutation.mutateAsync called, blob setter NOT called', async () => {
    const setup = makeSetup();
    renderGroup(setup);

    // Turn it off (toastsEnabled: true -> false). The household save is debounced 300ms.
    await user.click(screen.getByRole('switch', { name: 'Toast notifications' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalled();
    const callArgs = setup.saveRetentionMutation.mutateAsync.mock.calls[0][0];
    expect(callArgs).toMatchObject({ toastsEnabled: false });
    expect(setterCalled('toastsEnabled')).toBe(false);
  });

  it('toggling "Live event toasts" anon path: saveRetentionMutation.mutateAsync called', async () => {
    const setup = makeSetup();
    renderGroup(setup);

    // Turn it on (liveEventToastsEnabled: false -> true).
    await user.click(screen.getByRole('switch', { name: 'Live event toasts' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalled();
    const callArgs = setup.saveRetentionMutation.mutateAsync.mock.calls[0][0];
    expect(callArgs).toMatchObject({ liveEventToastsEnabled: true });
    expect(setterCalled('liveEventToastsEnabled')).toBe(false);
  });

  it('applies the saved toast config before the confirmation toast (onSaved -> configure)', async () => {
    const setup = makeSetup();
    setup.saveRetentionMutation.mutateAsync.mockResolvedValue({ ...setup.retentionConfig, toastPosition: 'top-left' });
    renderGroup(setup);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Toast position' }), 'top-left');
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ toastPosition: 'top-left' });
    const container = screen.getByText('Setting saved').closest('.fixed');
    expect(container).toHaveClass('top-20');
    expect(container).toHaveClass('left-0');
    expect(setterCalled('toastPosition')).toBe(false);
  });
});
