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

describe('Remove All Pairings', () => {
  beforeEach(() => {
    mockFetchJson.mockReset().mockResolvedValue({});
  });

  it('renders Remove All Pairings button', () => {
    renderTab(makeSetup());
    expect(screen.getByRole('button', { name: /remove all pairings/i })).toBeInTheDocument();
  });

  it('shows confirmation panel on click with DELETE input', async () => {
    renderTab(makeSetup());
    await userEvent.click(screen.getByRole('button', { name: /remove all pairings/i }));

    expect(screen.getByText(/this will remove all/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type delete/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeDisabled();
  });

  it('enables confirm only when DELETE is typed', async () => {
    renderTab(makeSetup());
    await userEvent.click(screen.getByRole('button', { name: /remove all pairings/i }));

    const input = screen.getByPlaceholderText(/type delete/i);
    await userEvent.type(input, 'DELETE');

    expect(screen.getByRole('button', { name: /^confirm$/i })).not.toBeDisabled();
  });

  it('calls delete mutations for all devices on confirm', async () => {
    const deleteHK = vi.fn((_id, opts) => opts?.onSuccess?.());
    const deleteMatter = vi.fn((_id, opts) => opts?.onSuccess?.());
    const setup = makeSetup({
      matterPairings: [{ nodeId: 'node-1', name: 'Matter Sensor' }],
      deletePairingMutation: { isPending: false, mutate: deleteHK },
      deleteMatterPairingMutation: { isPending: false, mutate: deleteMatter },
    });
    renderTab(setup);

    await userEvent.click(screen.getByRole('button', { name: /remove all pairings/i }));
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(deleteHK).toHaveBeenCalledTimes(2); // 2 HomeKit devices
      expect(deleteMatter).toHaveBeenCalledTimes(1); // 1 Matter device
    });
  });

  it('cancel dismisses the confirmation panel', async () => {
    renderTab(makeSetup());
    await userEvent.click(screen.getByRole('button', { name: /remove all pairings/i }));
    expect(screen.getByText(/this will remove all/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/this will remove all/i)).not.toBeInTheDocument();
  });
});
