import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import { localHourToUtc } from '../../lib/hours.js';
import DevicesGroup from './DevicesGroup.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

function makeSetup(overrides = {}) {
  return {
    retentionConfig: { autoScanHomeKit: true, toastsEnabled: true },
    saveRetentionMutation: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null },
    saveRepairMutation: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    ...overrides,
  };
}

function renderGroup(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DevicesGroup setup={setup} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let user;

describe('DevicesGroup: Scheduled Repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime: RTL wraps user-event in a real setTimeout(0) it only advances under Jest.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => { vi.useRealTimers(); });

  const repairSwitch = () => screen.getByRole('switch', { name: 'Scheduled Repair' });

  it('renders "Scheduled Repair" as a row label when repairConfig is provided', () => {
    renderGroup(makeSetup());
    const matches = screen.getAllByText('Scheduled Repair');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // A row label inside Devices, not a section heading.
    expect(matches.some((el) => el.closest('[data-testid="settings-row"]'))).toBe(true);
  });

  it('renders explanatory text containing "re-pairs HomeKit devices"', () => {
    renderGroup(makeSetup());
    expect(screen.getByText(/re-pairs HomeKit devices/i)).toBeInTheDocument();
  });

  it('renders the switch as off when repairConfig.enabled is false', () => {
    renderGroup(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(repairSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the switch as on when repairConfig.enabled is true', () => {
    renderGroup(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(repairSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('saves { enabled: true } through saveRepairMutation.mutateAsync when the switch is clicked', async () => {
    const saveRepairMutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
    renderGroup(makeSetup({
      repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null },
      saveRepairMutation,
    }));
    await user.click(repairSwitch());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(saveRepairMutation.mutateAsync).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows the hour picker when repair is enabled', () => {
    renderGroup(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.getByText('Repair hour')).toBeInTheDocument();
  });

  it('hides the hour picker when repair is disabled', () => {
    renderGroup(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.queryByText('Repair hour')).not.toBeInTheDocument();
  });

  it('shows "No runs yet" when lastRunAt is null', () => {
    renderGroup(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('shows outcome counts when lastRunResult is present', () => {
    renderGroup(makeSetup({
      repairConfig: {
        enabled: true,
        hour: 3,
        lastRunAt: '2026-04-03T10:00:00Z',
        lastRunResult: { targeted: 3, repaired: 2, skipped: 1, failed: 0 },
      },
    }));
    expect(screen.getByText(/2 repaired/)).toBeInTheDocument();
    expect(screen.getByText(/0 failed/)).toBeInTheDocument();
  });

  it('returns the repair switch to off and reports it when the save fails', async () => {
    const setup = makeSetup({ saveRepairMutation: { mutateAsync: vi.fn().mockRejectedValue(new Error('403')) } });
    renderGroup(setup);
    await user.click(repairSwitch());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(repairSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Failed to save setting')).toBeInTheDocument();
  });

  it('saves the repair hour as UTC', async () => {
    const setup = makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } });
    renderGroup(setup);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Repair hour' }), '5 AM');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRepairMutation.mutateAsync).toHaveBeenCalledWith({ hour: localHourToUtc(5) });
  });
});

describe('DevicesGroup: HomeKit auto-scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime: RTL wraps user-event in a real setTimeout(0) it only advances under Jest.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('saves autoScanHomeKit through the retention mutation', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    const row = screen.getByText('HomeKit auto-scan').closest('[data-testid="settings-row"]');
    expect(within(row).getByText(/Manual scans from Add Accessories still work/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'HomeKit auto-scan' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ autoScanHomeKit: false });
  });
});
