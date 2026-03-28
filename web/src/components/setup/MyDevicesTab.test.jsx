import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    saveRetentionMutation: { mutate: vi.fn(), isPending: false },
    ...overrides,
  };
}

function renderTab(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MyDevicesTab setup={setup} />
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

  it('calls saveRetentionMutation with liveEventToastsEnabled on toggle', async () => {
    const mutate = vi.fn();
    const setup = makeSetup({
      saveRetentionMutation: { mutate, isPending: false },
      retentionConfig: { liveEventToastsEnabled: false, toastAccessories: [] },
    });
    renderTab(setup);

    await userEvent.click(screen.getByRole('button', { name: /live toasts/i }));

    expect(mutate).toHaveBeenCalledWith({ liveEventToastsEnabled: true });
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
