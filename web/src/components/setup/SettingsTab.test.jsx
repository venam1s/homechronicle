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

function renderTab(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SettingsTab setup={setup} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Scheduled Repair section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Scheduled Repair" label text when repairConfig is provided', () => {
    renderTab(makeSetup());
    const matches = screen.getAllByText('Scheduled Repair');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Scheduled Repair is now a card label inside Device Management, not a section heading
    expect(matches.some((el) => el.tagName === 'P')).toBe(true);
  });

  it('renders explanatory text containing "re-pairs HomeKit devices"', () => {
    renderTab(makeSetup());
    expect(screen.getByText(/re-pairs HomeKit devices/i)).toBeInTheDocument();
  });

  function getRepairCard() {
    // The explanatory text is unique to the Scheduled Repair card
    const explanatoryText = screen.getByText(/Automatically re-pairs HomeKit devices/i);
    return explanatoryText.closest('div[class*="bg-hc-panel"]');
  }

  it('renders toggle checkbox as unchecked when repairConfig.enabled is false', () => {
    renderTab(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    const card = getRepairCard();
    const repairCheckbox = within(card).getByRole('checkbox');
    expect(repairCheckbox).not.toBeChecked();
  });

  it('renders toggle checkbox as checked when repairConfig.enabled is true', () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
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
    const card = getRepairCard();
    const repairCheckbox = within(card).getByRole('checkbox');
    await userEvent.click(repairCheckbox);
    expect(saveRepairMutation.mutate).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows hour picker select when repairEnabled is true', () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.getByText('Repair Hour')).toBeInTheDocument();
  });

  it('hides hour picker select when repairEnabled is false', () => {
    renderTab(makeSetup({ repairConfig: { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.queryByText('Repair Hour')).not.toBeInTheDocument();
  });

  it('shows "No runs yet" when lastRunAt is null', () => {
    renderTab(makeSetup({ repairConfig: { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null } }));
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('shows outcome counts when lastRunResult is present', () => {
    renderTab(makeSetup({
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
});
