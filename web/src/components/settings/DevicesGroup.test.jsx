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

function tree(setup, qc, props) {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DevicesGroup setup={setup} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

// Returns the render result plus update(setup), which re-renders with new props.
function renderGroup(setup, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(tree(setup, qc, props));
  return { ...utils, update: (next) => utils.rerender(tree(next, qc, props)) };
}

// Fake timers with user-event under Vitest: household saves debounce 300ms, so
// tests advance fake time. Both options are needed:
// - shouldAdvanceTime: Testing Library wraps each user-event call in a real
//   setTimeout(0) that it only advances under Jest; without this, clicks hang.
// - advanceTimers: lets user-event's own delays move the fake clock.
// After an action that saves, run `await act(() => vi.advanceTimersByTimeAsync(300))`.
let user;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => { vi.useRealTimers(); });

describe('DevicesGroup: Scheduled Repair', () => {
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

describe('DevicesGroup: before the config loads', () => {
  it('renders both switches disabled and off, with no hour picker, until the configs arrive', () => {
    const { update } = renderGroup(makeSetup({ retentionConfig: undefined, repairConfig: undefined }));
    for (const name of ['HomeKit auto-scan', 'Scheduled Repair']) {
      expect(screen.getByRole('switch', { name })).toBeDisabled();
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.queryByRole('combobox', { name: 'Repair hour' })).toBeNull();

    update(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.getByRole('switch', { name: 'HomeKit auto-scan' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'HomeKit auto-scan' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Scheduled Repair' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Repair hour' })).toBeEnabled();
  });
});

describe('DevicesGroup: link to Manage Accessories', () => {
  it('links to Manage Accessories', async () => {
    const onNavigate = vi.fn();
    renderGroup(makeSetup(), { onNavigate });
    await user.click(screen.getByRole('button', { name: 'Manage accessories' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('devices', { tab: 'devices' });
  });

  it('shows no link without onNavigate', () => {
    renderGroup(makeSetup());
    expect(screen.queryByRole('button', { name: 'Manage accessories' })).toBeNull();
  });
});
