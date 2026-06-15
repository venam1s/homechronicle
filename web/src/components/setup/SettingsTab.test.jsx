import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import SettingsTab from './SettingsTab.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

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
    saveRetentionMutation: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    logLevelConfig: { level: 'info' },
    saveLogLevelMutation: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    dbAccessories: [],
    deleteAccessoryMutation: { mutate: vi.fn(), isPending: false },
    paired: [],
    matterPairings: [],
    deletePairingMutation: { mutate: vi.fn(), isPending: false },
    deleteMatterPairingMutation: { mutate: vi.fn(), isPending: false },
    repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null },
    saveRepairMutation: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    ...overrides,
  };
}

function renderTab(setup, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SettingsTab setup={setup} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

// Scheduled Repair lives in the (non-default) Device Management tab; click into it first.
async function openDeviceTab() {
  await userEvent.click(screen.getByRole('tab', { name: 'Device Management' }));
}

describe('Scheduled Repair section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Scheduled Repair" label text when repairConfig is provided', async () => {
    renderTab(makeSetup());
    await openDeviceTab();
    const matches = screen.getAllByText('Scheduled Repair');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Scheduled Repair is now a card label inside Device Management, not a section heading
    expect(matches.some((el) => el.tagName === 'P')).toBe(true);
  });

  it('renders explanatory text containing "re-pairs HomeKit devices"', async () => {
    renderTab(makeSetup());
    await openDeviceTab();
    expect(screen.getByText(/re-pairs HomeKit devices/i)).toBeInTheDocument();
  });

  function getRepairCard() {
    // The explanatory text is unique to the Scheduled Repair card
    const explanatoryText = screen.getByText(/Automatically re-pairs HomeKit devices/i);
    return explanatoryText.closest('div[class*="bg-hc-panel"]');
  }

  it('renders toggle checkbox as unchecked when repairConfig.enabled is false', async () => {
    renderTab(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    await openDeviceTab();
    const card = getRepairCard();
    const repairCheckbox = within(card).getByRole('checkbox');
    expect(repairCheckbox).not.toBeChecked();
  });

  it('renders toggle checkbox as checked when repairConfig.enabled is true', async () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    await openDeviceTab();
    const card = getRepairCard();
    const repairCheckbox = within(card).getByRole('checkbox');
    expect(repairCheckbox).toBeChecked();
  });

  it('calls saveRepairMutation.mutate with { enabled: true } when toggle is clicked', async () => {
    const saveRepairMutation = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
    renderTab(makeSetup({
      repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null },
      saveRepairMutation,
    }));
    await openDeviceTab();
    const card = getRepairCard();
    const repairCheckbox = within(card).getByRole('checkbox');
    await userEvent.click(repairCheckbox);
    expect(saveRepairMutation.mutate).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows hour picker select when repairEnabled is true', async () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    await openDeviceTab();
    expect(screen.getByText('Repair Hour')).toBeInTheDocument();
  });

  it('hides hour picker select when repairEnabled is false', async () => {
    renderTab(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    await openDeviceTab();
    expect(screen.queryByText('Repair Hour')).not.toBeInTheDocument();
  });

  it('shows "No runs yet" when lastRunAt is null', async () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    await openDeviceTab();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('shows outcome counts when lastRunResult is present', async () => {
    renderTab(makeSetup({
      repairConfig: {
        enabled: true,
        hour: 3,
        lastRunAt: '2026-04-03T10:00:00Z',
        lastRunResult: { targeted: 3, repaired: 2, skipped: 1, failed: 0 },
      },
    }));
    await openDeviceTab();
    expect(screen.getByText(/2 repaired/)).toBeInTheDocument();
    expect(screen.getByText(/0 failed/)).toBeInTheDocument();
  });
});

describe('Tabbed Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the Device Management tab by default (first tab); About is not shown until selected', () => {
    renderTab(makeSetup());
    expect(screen.getByRole('tab', { name: 'Device Management' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Documentation')).not.toBeInTheDocument();
  });

  it('reveals the About tab content (Documentation link) when the About tab is selected', async () => {
    renderTab(makeSetup());
    await userEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByText('Documentation')).toBeInTheDocument();
  });

  it('reveals "Retention cutoff" after clicking the Data management tab', async () => {
    renderTab(makeSetup());
    expect(screen.queryByText('Retention cutoff')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Data management' }));
    expect(screen.getByText('Retention cutoff')).toBeInTheDocument();
  });

  it('never renders "Log level" anywhere in SettingsTab', async () => {
    renderTab(makeSetup());
    for (const name of ['About', 'Device Management', 'Data management', 'Toast']) {
      await userEvent.click(screen.getByRole('tab', { name }));
      expect(screen.queryByText('Log level')).not.toBeInTheDocument();
    }
  });

  it('never renders "Danger Zone" anywhere in SettingsTab', async () => {
    renderTab(makeSetup());
    for (const name of ['About', 'Device Management', 'Data management', 'Toast']) {
      await userEvent.click(screen.getByRole('tab', { name }));
      expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    }
  });
});

describe('Advanced tab gating (showAdvanced prop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an "Advanced" tab button when showAdvanced is true', () => {
    renderTab(makeSetup(), { showAdvanced: true });
    expect(screen.getByRole('tab', { name: 'Advanced' })).toBeInTheDocument();
  });

  it('does NOT show an "Advanced" tab button when showAdvanced is false (default)', () => {
    renderTab(makeSetup());
    expect(screen.queryByRole('tab', { name: 'Advanced' })).not.toBeInTheDocument();
  });

  it('does NOT show an "Advanced" tab button when showAdvanced is explicitly false', () => {
    renderTab(makeSetup(), { showAdvanced: false });
    expect(screen.queryByRole('tab', { name: 'Advanced' })).not.toBeInTheDocument();
  });

  it('shows "Log level" content after clicking the Advanced tab (showAdvanced=true)', async () => {
    renderTab(makeSetup(), { showAdvanced: true });
    await userEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText('Log level')).toBeInTheDocument();
  });

  it('does NOT show "Log level" while Device Management tab is active (showAdvanced=true)', async () => {
    renderTab(makeSetup(), { showAdvanced: true });
    // Device Management is the default active tab
    expect(screen.getByRole('tab', { name: 'Device Management' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Log level')).not.toBeInTheDocument();
  });

  it('does NOT show "Log level" when showAdvanced is false', () => {
    renderTab(makeSetup(), { showAdvanced: false });
    expect(screen.queryByText('Log level')).not.toBeInTheDocument();
  });

  it('does NOT show "Log level" when showAdvanced is omitted', () => {
    renderTab(makeSetup());
    expect(screen.queryByText('Log level')).not.toBeInTheDocument();
  });
});
