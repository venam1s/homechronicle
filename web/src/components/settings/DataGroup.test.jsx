import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import { fetchJson } from '../../lib/api.js';
import DataGroup from './DataGroup.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

function makeSetup(retentionOverrides = {}) {
  return {
    retentionConfig: {
      retentionDays: 365,
      staleThresholdHours: 24,
      archiveBeforeDelete: true,
      toastsEnabled: true,
      ...retentionOverrides,
    },
    saveRetentionMutation: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  };
}

function renderGroup(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DataGroup setup={setup} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let user;

describe('DataGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJson.mockResolvedValue({});
    // shouldAdvanceTime: RTL wraps user-event in a real setTimeout(0) it only advances under Jest.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => { vi.useRealTimers(); });

  const retentionInput = () => screen.getByRole('spinbutton', { name: 'Retention cutoff' });

  it('warns "archived" when lowering retention with archive on, "permanently deleted" with it off, nothing when raising', async () => {
    const { unmount } = renderGroup(makeSetup({ archiveBeforeDelete: true }));
    await user.clear(retentionInput());
    await user.type(retentionInput(), '30');
    expect(screen.getByText('Events older than 30 days will be archived at the next sweep.')).toBeInTheDocument();
    await user.clear(retentionInput());
    await user.type(retentionInput(), '400');
    expect(screen.queryByText(/Events older than/)).toBeNull();
    unmount();

    renderGroup(makeSetup({ archiveBeforeDelete: false }));
    await user.clear(retentionInput());
    await user.type(retentionInput(), '30');
    expect(screen.getByText('Events older than 30 days will be permanently deleted at the next sweep.')).toBeInTheDocument();
  });

  it('sends retentionDays only after Apply', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    await user.clear(retentionInput());
    await user.type(retentionInput(), '30');
    await user.tab();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ retentionDays: 30 });
  });

  it('sends staleThresholdHours on Apply', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    const input = screen.getByRole('spinbutton', { name: 'Stale accessory threshold' });
    await user.clear(input);
    await user.type(input, '48{Enter}');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ staleThresholdHours: 48 });
  });

  it('saves archiveBeforeDelete when the switch is clicked', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    await user.click(screen.getByRole('switch', { name: 'Archive before delete' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ archiveBeforeDelete: false });
  });

  it('shows Download archive only when the archive count is above 0', async () => {
    fetchJson.mockResolvedValue({ count: 0 });
    const { unmount } = renderGroup(makeSetup());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchJson).toHaveBeenCalledWith('/archive/count');
    expect(screen.queryByRole('button', { name: /Download archive/ })).toBeNull();
    unmount();

    fetchJson.mockResolvedValue({ count: 1234 });
    renderGroup(makeSetup());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: /Download archive \(1,234 events\)/ })).toBeInTheDocument();
  });
});
