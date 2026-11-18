import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import NotificationsGroup from './NotificationsGroup.jsx';
import { useCanManageHome } from '../../hooks/useCanManageHome.js';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

// Who may choose watched accessories; set per test (admin by default).
vi.mock('../../hooks/useCanManageHome.js', () => ({ useCanManageHome: vi.fn(() => true) }));

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

function renderGroup(setup, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NotificationsGroup setup={setup} {...props} />
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
    useCanManageHome.mockReturnValue(true);
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
    // Without onNavigate there is nothing to link to: the admin hint is plain text.
    const warning = 'Select accessories to watch in Manage Accessories.';
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

  const liveOnNoneWatched = () => makeSetup({
    retentionConfig: { ...makeSetup().retentionConfig, liveEventToastsEnabled: true, toastAccessories: [] },
  });

  it('admin: the watch-list hint is a link to Manage Accessories', async () => {
    useCanManageHome.mockReturnValue(true);
    const onNavigate = vi.fn();
    renderGroup(liveOnNoneWatched(), { onNavigate });
    await userEvent.click(screen.getByRole('button', { name: 'Select accessories to watch in Manage Accessories' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('devices', { tab: 'devices' });
    expect(screen.queryByText('An admin chooses which accessories are watched.')).toBeNull();
  });

  it('member: the watch-list hint is plain text naming an admin', () => {
    useCanManageHome.mockReturnValue(false);
    const onNavigate = vi.fn();
    renderGroup(liveOnNoneWatched(), { onNavigate });
    expect(screen.getByText('An admin chooses which accessories are watched.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select accessories to watch in Manage Accessories' })).toBeNull();
    expect(screen.queryByText(/Select accessories to watch/)).toBeNull();
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
