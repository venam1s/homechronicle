import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import NotificationsGroup from './NotificationsGroup.jsx';

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

const rowOf = (label) => screen.getByText(label).closest('[data-testid="settings-row"]');

describe('Test toast button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pops a test toast at the currently selected position', async () => {
    renderGroup(makeSetup({
      retentionConfig: { ...makeSetup().retentionConfig, toastPosition: 'top-left' },
    }));
    expect(screen.queryByText(/test notification/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show test toast/i }));

    const toastText = await screen.findByText(/test notification/i);
    const container = toastText.closest('.fixed');
    expect(container).toHaveClass('top-20');
    expect(container).toHaveClass('left-0');
    expect(container).toHaveClass('items-start');
  });

  it('is disabled when toast notifications are turned off', () => {
    renderGroup(makeSetup({
      retentionConfig: { ...makeSetup().retentionConfig, toastsEnabled: false },
    }));
    expect(screen.getByRole('button', { name: /show test toast/i })).toBeDisabled();
  });
});

describe('NotificationsGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dims the four dependent rows when Toast notifications is off', () => {
    renderGroup(makeSetup({
      retentionConfig: { ...makeSetup().retentionConfig, toastsEnabled: false },
    }));

    const rows = screen.getAllByTestId('settings-row');
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.classList.contains('opacity-50'))).toHaveLength(4);

    expect(rowOf('Toast notifications')).not.toHaveClass('opacity-50');
    for (const label of ['Live event toasts', 'Toast position', 'Toast duration', 'Max visible toasts']) {
      expect(rowOf(label)).toHaveClass('opacity-50');
    }

    // A disabled row disables its control too.
    expect(screen.getByRole('switch', { name: 'Toast notifications' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Live event toasts' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Toast position' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Toast duration' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Max visible toasts' })).toBeDisabled();
  });

  it('dims no row while Toast notifications is on', () => {
    renderGroup(makeSetup());
    for (const row of screen.getAllByTestId('settings-row')) {
      expect(row).not.toHaveClass('opacity-50');
    }
  });

  it('warns to pick accessories when live event toasts are on and none are watched', () => {
    const warning = 'Select accessories to watch on the Manage Accessories tab.';
    const { unmount } = renderGroup(makeSetup({
      retentionConfig: { ...makeSetup().retentionConfig, liveEventToastsEnabled: true, toastAccessories: [] },
    }));
    expect(screen.getByText(warning)).toBeInTheDocument();
    unmount();

    renderGroup(makeSetup({
      retentionConfig: { ...makeSetup().retentionConfig, liveEventToastsEnabled: true, toastAccessories: ['acc-1'] },
    }));
    expect(screen.queryByText(warning)).toBeNull();
  });

  it('shows no value and disables every control until the household config loads', () => {
    renderGroup(makeSetup({ retentionConfig: undefined }));
    expect(screen.getByRole('switch', { name: 'Toast notifications' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Toast notifications' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Live event toasts' })).toBeDisabled();
    for (const name of ['Toast position', 'Toast duration', 'Max visible toasts']) {
      const select = screen.getByRole('combobox', { name });
      expect(select).toBeDisabled();
      expect(select).toHaveValue('');
    }
    expect(screen.getByRole('button', { name: /show test toast/i })).toBeDisabled();
  });
});
