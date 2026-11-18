import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import AlertDefaultsGroup from './AlertDefaultsGroup.jsx';

function makeSetup(alertsOverrides = {}) {
  return {
    retentionConfig: { toastsEnabled: true },
    alertsConfig: { defaultQuietMinutes: 15, webhookTimeoutMs: 5000, webhookTimeoutFromEnv: false, ...alertsOverrides },
    saveAlertsMutation: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  };
}

function renderGroup(setup, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AlertDefaultsGroup setup={setup} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let user;

describe('AlertDefaultsGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime: RTL wraps user-event in a real setTimeout(0) it only advances under Jest.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => { vi.useRealTimers(); });

  const quietInput = () => screen.getByRole('spinbutton', { name: 'Default quiet period' });
  const timeoutInput = () => screen.getByRole('spinbutton', { name: 'Webhook timeout' });

  it('disables Webhook timeout and names the env var when set by env', () => {
    renderGroup(makeSetup({ webhookTimeoutFromEnv: true }));
    expect(timeoutInput()).toBeDisabled();
    expect(screen.getByText('Set by ALERTS_WEBHOOK_TIMEOUT_MS in .env.')).toBeInTheDocument();
  });

  it('enables Webhook timeout with the default description when not set by env', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    expect(timeoutInput()).toBeEnabled();
    expect(screen.getByText('Max wait time for webhook delivery.')).toBeInTheDocument();
    await user.clear(timeoutInput());
    await user.type(timeoutInput(), '8000{Enter}');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveAlertsMutation.mutateAsync).toHaveBeenCalledWith({ webhookTimeoutMs: 8000 });
  });

  it('sends defaultQuietMinutes on Apply, not on blur', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    await user.clear(quietInput());
    await user.type(quietInput(), '30');
    await user.tab();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveAlertsMutation.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveAlertsMutation.mutateAsync).toHaveBeenCalledWith({ defaultQuietMinutes: 30 });
  });

  it('accepts 0 for Default quiet period', async () => {
    const setup = makeSetup();
    renderGroup(setup);
    await user.clear(quietInput());
    await user.type(quietInput(), '0');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveAlertsMutation.mutateAsync).toHaveBeenCalledWith({ defaultQuietMinutes: 0 });
  });

  it('shows no number until alertsConfig loads, then the saved values', () => {
    const { unmount } = renderGroup({ ...makeSetup(), alertsConfig: undefined });
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByDisplayValue('5000')).toBeNull();
    expect(screen.queryByDisplayValue('0')).toBeNull();
    expect(screen.getAllByText('Loading…')).toHaveLength(2);
    expect(screen.getByText('Webhook timeout')).toBeInTheDocument();
    unmount();

    renderGroup(makeSetup({ defaultQuietMinutes: 45, webhookTimeoutMs: 7000 }));
    expect(quietInput()).toHaveValue(45);
    expect(timeoutInput()).toHaveValue(7000);
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('links to the Alerts page', async () => {
    const onNavigate = vi.fn();
    renderGroup(makeSetup(), { onNavigate });
    await user.click(screen.getByRole('button', { name: 'Manage rules on the Alerts page' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('alerts');
  });

  it('shows no Alerts link without onNavigate', () => {
    renderGroup(makeSetup());
    expect(screen.queryByRole('button', { name: 'Manage rules on the Alerts page' })).toBeNull();
  });
});
