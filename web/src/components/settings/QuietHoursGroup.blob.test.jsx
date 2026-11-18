/**
 * QuietHoursGroup.blob.test.jsx
 *
 * Quiet-hours routing, ported from SettingsTab.blob.test.jsx (suites D, E, F):
 *
 * D. Signed out: changes go to saveRetentionMutation, not setPrefsBlob.
 * E. Signed in: every change writes all four QH keys together via setPrefsBlob (QH-08).
 * F. Signed in, blob lacks quietHoursEnabled: controls prefill from retentionConfig and
 *    nothing is written on mount (QH-07).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import { localHourToUtc, utcHourToLocal } from '../../lib/hours.js';
import QuietHoursGroup from './QuietHoursGroup.jsx';

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

// Mock usePreference so we can spy on blob setters without needing a real server.
// The factory receives (key, defaultValue, opts) and returns [defaultValue, setter].
const prefSetters = {};

vi.mock('../../hooks/usePreference.js', () => ({
  usePreference: vi.fn((key, defaultValue) => {
    const setter = vi.fn();
    prefSetters[key] = setter;
    return [defaultValue, setter];
  }),
}));

// Mock useUserPreferences so setPrefsBlob is spyable.
// Default returns safe no-op (no prefs blob keys); individual tests override via mockReturnValue.
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
import { useUserPreferences } from '../../hooks/useUserPreferences.js';

const SIGNED_IN = { user: { id: 1, role: 'admin', email: 'a@example.com' } };

function makeRetentionConfig(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeSetup(overrides = {}) {
  return {
    retentionConfig: makeRetentionConfig(),
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

function renderGroup(setup, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <QuietHoursGroup setup={setup} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockBlob(prefs, setPrefsBlob) {
  useUserPreferences.mockReturnValue({
    prefs,
    isLoading: false,
    setPrefsBlob,
    seedIfEmpty: vi.fn(),
  });
}

const quietSwitch = () => screen.getByRole('switch', { name: 'Quiet hours' });

// Household saves debounce 300ms; see DevicesGroup.test.jsx for why both options are needed.
let user;
const mockSetPrefsBlob = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(prefSetters)) delete prefSetters[key];
  usePreference.mockImplementation((key, defaultValue) => {
    const setter = vi.fn();
    prefSetters[key] = setter;
    return [defaultValue, setter];
  });
  mockSetPrefsBlob.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => { vi.useRealTimers(); });

// ── Suite D: Signed out — changes route to saveRetentionMutation ──

describe('D. Quiet-hours anon path — changes go to saveRetentionMutation, not setPrefsBlob', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: null });
    mockBlob({}, mockSetPrefsBlob);
  });

  it('toggling quiet-hours enabled (anon) calls saveRetentionMutation.mutateAsync, not setPrefsBlob', async () => {
    const setup = makeSetup();
    renderGroup(setup);

    await user.click(quietSwitch());
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledTimes(1);
    const callArg = setup.saveRetentionMutation.mutateAsync.mock.calls[0][0];
    expect(callArg).toHaveProperty('quietHoursEnabled');
    expect(callArg).toEqual({ quietHoursEnabled: true });
    expect(mockSetPrefsBlob).not.toHaveBeenCalled();
  });

  it('changing Start (anon) saves the UTC hour through the household mutation', async () => {
    const setup = makeSetup({ retentionConfig: makeRetentionConfig({ quietHoursEnabled: true }) });
    renderGroup(setup);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Quiet hours start' }), '9 PM');
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ quietHoursStart: localHourToUtc(21) });
    expect(mockSetPrefsBlob).not.toHaveBeenCalled();
  });
});

// ── Suite E: Signed in — all four keys written together via setPrefsBlob ──

describe('E. Quiet-hours authed path — four-key grouped write to setPrefsBlob (QH-08)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue(SIGNED_IN);
  });

  it('toggling quiet-hours enabled (authed) calls setPrefsBlob with all four QH keys', async () => {
    // Blob WITH quietHoursEnabled present, so blobHasQh = true.
    mockBlob({
      quietHoursEnabled: false,
      quietHoursStart: 23,
      quietHoursEnd: 6,
      quietHoursExcludedAccessories: [],
    }, mockSetPrefsBlob);

    const setup = makeSetup();
    renderGroup(setup);

    await user.click(quietSwitch());

    // Exactly the four QH keys; hours stored as UTC (the mocked usePreference returns
    // the defaults 23 / 6, shown in local time and written back as UTC).
    expect(mockSetPrefsBlob).toHaveBeenCalledTimes(1);
    expect(mockSetPrefsBlob.mock.calls[0][0]).toEqual({
      quietHoursEnabled: true,
      quietHoursStart: localHourToUtc(utcHourToLocal(23)),
      quietHoursEnd: localHourToUtc(utcHourToLocal(6)),
      quietHoursExcludedAccessories: [],
    });

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
  });

  it('turning quiet hours on then changing Start writes enabled: true with the new start', async () => {
    mockBlob({ quietHoursEnabled: false }, mockSetPrefsBlob);
    renderGroup(makeSetup());

    await user.click(quietSwitch());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Quiet hours start' }), '9 PM');

    expect(mockSetPrefsBlob).toHaveBeenLastCalledWith({
      quietHoursEnabled: true,
      quietHoursStart: localHourToUtc(21),
      quietHoursEnd: localHourToUtc(utcHourToLocal(6)),
      quietHoursExcludedAccessories: [],
    });
  });

  it('removing an excluded accessory writes all four keys and refreshes the quiet-hours stats', async () => {
    usePreference.mockImplementation((key, defaultValue) => {
      const setter = vi.fn();
      prefSetters[key] = setter;
      if (key === 'quietHoursEnabled') return [true, setter];
      if (key === 'quietHoursExcludedAccessories') return [['acc-1', 'acc-2'], setter];
      return [defaultValue, setter];
    });
    mockBlob({ quietHoursEnabled: true }, mockSetPrefsBlob);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const setup = makeSetup({ paired: [{ id: 'acc-1', name: 'Hall lamp' }] });
    renderGroup(setup, qc);

    await user.click(screen.getByTitle('Restore acc-1 to quiet hours'));

    expect(mockSetPrefsBlob).toHaveBeenCalledWith({
      quietHoursEnabled: true,
      quietHoursStart: localHourToUtc(utcHourToLocal(23)),
      quietHoursEnd: localHourToUtc(utcHourToLocal(6)),
      quietHoursExcludedAccessories: ['acc-2'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stats', 'quiet-hours'] });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
  });
});

// ── Suite F: Presence-check prefill — no write on mount (QH-07) ──

describe('F. Quiet-hours prefill — authed blob lacks quietHoursEnabled → prefill from retentionConfig, no write-on-mount (QH-07)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue(SIGNED_IN);
  });

  it('renders QH controls from retentionConfig values when blob lacks quietHoursEnabled key', async () => {
    // Blob is non-null and non-empty (Phase-24 user) but has NO quietHoursEnabled key.
    mockBlob({ theme: 'dark', toastsEnabled: true }, mockSetPrefsBlob);

    // retentionConfig has quietHoursEnabled: true
    const setup = makeSetup({ retentionConfig: makeRetentionConfig({ quietHoursEnabled: true }) });
    renderGroup(setup);

    // QH switch reflects retentionConfig.quietHoursEnabled = true (prefill).
    expect(quietSwitch()).toHaveAttribute('aria-checked', 'true');

    // CRITICAL: setPrefsBlob must NOT have been called on mount (no seeding on mount).
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(mockSetPrefsBlob).not.toHaveBeenCalled();
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('QuietHoursGroup', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: null });
    mockBlob({}, mockSetPrefsBlob);
  });

  it('hides Start, End and the chips while Quiet hours is off', async () => {
    const setup = makeSetup({
      retentionConfig: makeRetentionConfig({ quietHoursEnabled: false, quietHoursExcludedAccessories: ['acc-1'] }),
      paired: [{ id: 'acc-1', name: 'Hall lamp' }],
    });
    renderGroup(setup);

    expect(quietSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('combobox', { name: 'Quiet hours start' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Quiet hours end' })).toBeNull();
    expect(screen.queryByText('Hall lamp')).toBeNull();

    await user.click(quietSwitch());

    expect(screen.getByRole('combobox', { name: 'Quiet hours start' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Quiet hours end' })).toBeInTheDocument();
    expect(screen.getByText('Hall lamp')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(300));
  });

  it('signed out: removing a chip saves the shorter list and refreshes the quiet-hours stats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const setup = makeSetup({
      retentionConfig: makeRetentionConfig({ quietHoursEnabled: true, quietHoursExcludedAccessories: ['acc-1', 'acc-2'] }),
    });
    renderGroup(setup, qc);

    await user.click(screen.getByTitle('Restore acc-1 to quiet hours'));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ quietHoursExcludedAccessories: ['acc-2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stats', 'quiet-hours'] });
    expect(mockSetPrefsBlob).not.toHaveBeenCalled();
  });

  it('signed out: disables the switch and shows it off until the household config loads', () => {
    renderGroup(makeSetup({ retentionConfig: undefined }));
    expect(quietSwitch()).toBeDisabled();
    expect(quietSwitch()).toHaveAttribute('aria-checked', 'false');
  });
});
