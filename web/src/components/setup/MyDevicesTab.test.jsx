import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import MyDevicesTab from './MyDevicesTab.jsx';

// Mock fetchJson for Repair All (which calls the API directly)
const mockFetchJson = vi.fn().mockResolvedValue({});
vi.mock('../../lib/api.js', () => ({
  fetchJson: (...args) => mockFetchJson(...args),
}));

// Sign-in state; set per test. Defaults (below) are auth off, the sole operator.
vi.mock('../../hooks/useAuth.js', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/useAuthConfig.js', () => ({ useAuthConfig: vi.fn() }));

// Per-user preferences: each key returns its entry in prefValues (else the
// default) and a setter recorded in prefSetters, so tests can read and spy on them.
const prefValues = {};
const prefSetters = {};
vi.mock('../../hooks/usePreference.js', () => ({
  usePreference: vi.fn((key, defaultValue) => {
    prefSetters[key] ??= vi.fn();
    return [key in prefValues ? prefValues[key] : defaultValue, prefSetters[key]];
  }),
}));

import { useAuth } from '../../hooks/useAuth.js';
import { useAuthConfig } from '../../hooks/useAuthConfig.js';

function signInAs(role) {
  useAuthConfig.mockReturnValue({ authEnabled: true, isLoading: false });
  useAuth.mockReturnValue({ user: { id: 1, email: 'a@example.com', role } });
}

function authOff() {
  useAuthConfig.mockReturnValue({ authEnabled: false, isLoading: false });
  useAuth.mockReturnValue({ user: null });
}

beforeEach(() => {
  for (const key of Object.keys(prefValues)) delete prefValues[key];
  for (const key of Object.keys(prefSetters)) delete prefSetters[key];
  authOff();
});

function makeSetup(overrides = {}) {
  return {
    paired: [
      { id: 'AA:BB:CC:DD:EE:01', name: 'Light 1', category: 14, address: '192.168.1.10' },
      { id: 'AA:BB:CC:DD:EE:02', name: 'Light 2', category: 14, address: '192.168.1.11' },
    ],
    matterPairings: [],
    dbAccessories: [],
    savedRooms: {},
    roomInputs: {},
    setRoomInputs: vi.fn(),
    handleRoomBlur: vi.fn(),
    savedNotes: {},
    noteInputs: {},
    setNoteInputs: vi.fn(),
    handleNoteBlur: vi.fn(),
    savedDisplayNames: {},
    displayNameInputs: {},
    setDisplayNameInputs: vi.fn(),
    handleDisplayNameBlur: vi.fn(),
    deletePairingMutation: { isPending: false, mutate: vi.fn() },
    deleteMatterPairingMutation: { isPending: false, mutate: vi.fn() },
    repairPairingMutation: { mutateAsync: vi.fn().mockResolvedValue({}) },
    matterRuntime: null,
    retentionConfig: { toastsEnabled: true, liveEventToastsEnabled: false, toastAccessories: [] },
    saveRetentionMutation: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    ...overrides,
  };
}

function renderTab(setup, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MyDevicesTab setup={setup} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('MyDevicesTab toolbar', () => {
  beforeEach(() => {
    mockFetchJson.mockReset().mockResolvedValue({});
  });

  it('renders Repair All button', () => {
    renderTab(makeSetup());
    expect(screen.getByRole('button', { name: /repair all/i })).toBeInTheDocument();
  });

  it('calls repair API for each HomeKit device on Repair All click', async () => {
    renderTab(makeSetup());

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /repair all/i }));
    });

    await waitFor(() => {
      const repairCalls = mockFetchJson.mock.calls.filter(([url]) => url.includes('/api/setup/repair/'));
      expect(repairCalls).toHaveLength(2);
      expect(repairCalls[0][0]).toContain('AA%3ABB%3ACC%3ADD%3AEE%3A01');
      expect(repairCalls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
      expect(repairCalls[1][0]).toContain('AA%3ABB%3ACC%3ADD%3AEE%3A02');
      expect(repairCalls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    });
  });

  it('shows progress during Repair All', async () => {
    let resolveFirst;
    let repairCallCount = 0;
    mockFetchJson.mockImplementation((url) => {
      if (url.includes('/api/setup/repair/')) {
        repairCallCount++;
        if (repairCallCount === 1) return new Promise((r) => { resolveFirst = r; });
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    renderTab(makeSetup());

    act(() => {
      userEvent.click(screen.getByRole('button', { name: /repair all/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/repairing 1\/2/i)).toBeInTheDocument();
    });

    await act(async () => resolveFirst({}));

    await waitFor(() => {
      expect(screen.getAllByText(/2 ok/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('counts NO_PIN failures as skipped', async () => {
    let repairCallCount = 0;
    mockFetchJson.mockImplementation((url) => {
      if (url.includes('/api/setup/repair/')) {
        repairCallCount++;
        if (repairCallCount === 1) return Promise.resolve({});
        return Promise.reject(new Error(JSON.stringify({ code: 'NO_PIN', error: 'No PIN' })));
      }
      return Promise.resolve({});
    });

    renderTab(makeSetup());

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /repair all/i }));
    });

    await waitFor(() => {
      expect(screen.getAllByText(/1 ok.*1 skipped/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Live Toasts toggle', () => {
  beforeEach(() => {
    mockFetchJson.mockReset().mockResolvedValue({});
  });

  it('renders Live Toasts toggle', () => {
    renderTab(makeSetup());
    expect(screen.getByRole('button', { name: /live toasts/i })).toBeInTheDocument();
  });

  describe('with fake timers', () => {
    // Household saves debounce 300ms: both options are needed, or user-event hangs.
    let user;
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    });
    afterEach(() => { vi.useRealTimers(); });

    it('auth off: Live Toasts writes the household setting', async () => {
      const setup = makeSetup({
        retentionConfig: { toastsEnabled: true, liveEventToastsEnabled: false, toastAccessories: [] },
      });
      renderTab(setup);
      const btn = screen.getByRole('button', { name: /live toasts/i });
      expect(btn).toHaveTextContent('Live Toasts Off');

      await user.click(btn);
      await act(() => vi.advanceTimersByTimeAsync(300));

      expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ liveEventToastsEnabled: true });
      expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
      expect(prefSetters.liveEventToastsEnabled).not.toHaveBeenCalled();
      expect(btn).toHaveTextContent('Live Toasts On');
      expect(screen.getByText('Live toasts enabled')).toBeInTheDocument();
    });

    it('signed in: Live Toasts reads and writes the personal preference, not the household setting', async () => {
      signInAs('admin');
      prefValues.liveEventToastsEnabled = false;
      // The household flag deliberately disagrees: the button must not follow it.
      const setup = makeSetup({
        retentionConfig: { toastsEnabled: true, liveEventToastsEnabled: true, toastAccessories: [] },
      });
      renderTab(setup);
      const btn = screen.getByRole('button', { name: /live toasts/i });
      expect(btn).toHaveTextContent('Live Toasts Off');
      // The watch bells follow the same value as the button.
      expect(screen.queryByTitle('Enable live event toasts')).toBeNull();

      await user.click(btn);
      await act(() => vi.advanceTimersByTimeAsync(300));

      expect(prefSetters.liveEventToastsEnabled).toHaveBeenCalledTimes(1);
      expect(prefSetters.liveEventToastsEnabled).toHaveBeenCalledWith(true);
      expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
      expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText('Live toasts enabled')).toBeInTheDocument();
    });
  });

  it('signed in: the watch bells show when your own preference is on and the household flag is off', () => {
    signInAs('admin');
    prefValues.liveEventToastsEnabled = true;
    renderTab(makeSetup({
      retentionConfig: { toastsEnabled: true, liveEventToastsEnabled: false, toastAccessories: [] },
    }));
    expect(screen.getByRole('button', { name: /live toasts/i })).toHaveTextContent('Live Toasts On');
    expect(screen.getAllByTitle('Enable live event toasts')).toHaveLength(2);
  });

  it('signed in as a member: no watch bells, since only an admin may change the watch list', () => {
    signInAs('member');
    prefValues.liveEventToastsEnabled = true;
    renderTab(makeSetup({
      retentionConfig: { toastsEnabled: true, liveEventToastsEnabled: true, toastAccessories: [] },
    }));
    expect(screen.getByRole('button', { name: /live toasts/i })).toHaveTextContent('Live Toasts On');
    expect(screen.queryByTitle('Enable live event toasts')).toBeNull();
  });

  it('shows enabled state when liveEventToastsEnabled is true', () => {
    const setup = makeSetup({
      retentionConfig: { liveEventToastsEnabled: true, toastAccessories: [] },
    });
    renderTab(setup);

    const btn = screen.getByRole('button', { name: /live toasts/i });
    expect(btn).toHaveTextContent(/on/i);
  });
});


describe('MyDevicesTab link to the repair schedule', () => {
  const linkName = 'Auto-scan and repair schedule';

  it('shows "Auto-scan and repair schedule" to an admin and navigates to Settings general', async () => {
    signInAs('admin');
    const onNavigate = vi.fn();
    renderTab(makeSetup(), { onNavigate });
    await userEvent.click(screen.getByRole('button', { name: linkName }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('settings', { section: 'general' });
  });

  it('hides "Auto-scan and repair schedule" from a member', () => {
    signInAs('member');
    renderTab(makeSetup(), { onNavigate: vi.fn() });
    expect(screen.queryByRole('button', { name: linkName })).toBeNull();
  });

  it('shows the link with auth off, and none without onNavigate', () => {
    const { unmount } = renderTab(makeSetup(), { onNavigate: vi.fn() });
    expect(screen.getByRole('button', { name: linkName })).toBeInTheDocument();
    unmount();

    renderTab(makeSetup());
    expect(screen.queryByRole('button', { name: linkName })).toBeNull();
  });
});

describe('MyDevicesTab device status badge', () => {
  it('shows "Not on network" for an unreachable device and "Logging" for a quiet connected one', () => {
    renderTab(makeSetup({
      dbAccessories: [
        { accessory_id: 'AA:BB:CC:DD:EE:01', reliability: { needs_repair: false, unreachable: true }, health: { status: 'stale', isStale: true } },
        { accessory_id: 'AA:BB:CC:DD:EE:02', reliability: { needs_repair: false, unreachable: false }, health: { status: 'online', isStale: false } },
      ],
    }));
    const badge = screen.getByText('Not on network');
    expect(badge).toHaveAttribute('title', expect.stringMatching(/keeps retrying, less often/));
    expect(screen.getAllByText('Logging')).toHaveLength(1);
    expect(screen.queryByText('Stale')).toBeNull();
  });
});
