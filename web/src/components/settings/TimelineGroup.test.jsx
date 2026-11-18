import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast.jsx';
import TimelineGroup from './TimelineGroup.jsx';

vi.mock('../../lib/api.js', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  API_BASE: '',
  withApiAuthHeaders: () => ({}),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

// One stable setter per preference key, so assertions survive re-renders.
const prefSetters = {};
vi.mock('../../hooks/usePreference.js', () => ({
  usePreference: vi.fn((key, defaultValue) => {
    prefSetters[key] ??= vi.fn();
    return [defaultValue, prefSetters[key]];
  }),
}));

import { useAuth } from '../../hooks/useAuth.js';

const SIGNED_IN = { user: { id: 1, role: 'member', email: 'm@example.com' } };

function makeSetup(overrides = {}) {
  return {
    retentionConfig: {
      episodeWindowMinutes: 3,
      sceneWindowSeconds: 5,
      episodeMinEventCount: 3,
      toastsEnabled: true,
    },
    saveRetentionMutation: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    ...overrides,
  };
}

function renderGroup(setup) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TimelineGroup setup={setup} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const field = (name) => screen.getByRole('spinbutton', { name });

// Household saves debounce 300ms; see DevicesGroup.test.jsx for why both options are needed.
let user;
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(prefSetters)) delete prefSetters[key];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => { vi.useRealTimers(); });

describe('TimelineGroup', () => {
  it('signed in: Apply writes the blob setter and not the household mutation', async () => {
    useAuth.mockReturnValue(SIGNED_IN);
    const setup = makeSetup();
    renderGroup(setup);

    await user.clear(field('Episode capture interval'));
    await user.type(field('Episode capture interval'), '5');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(prefSetters.episodeWindowMinutes).toHaveBeenCalledWith(5);
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setup.saveRetentionMutation.mutate).not.toHaveBeenCalled();
  });

  it('signed out: Apply sends { episodeWindowMinutes: 5 } to the household mutation', async () => {
    useAuth.mockReturnValue({ user: null });
    const setup = makeSetup();
    renderGroup(setup);

    await user.clear(field('Episode capture interval'));
    await user.type(field('Episode capture interval'), '5');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenCalledWith({ episodeWindowMinutes: 5 });
    expect(prefSetters.episodeWindowMinutes).not.toHaveBeenCalled();
  });

  it('signed out: Scene grouping window and Episode minimum events save their own keys', async () => {
    useAuth.mockReturnValue({ user: null });
    const setup = makeSetup();
    renderGroup(setup);

    await user.clear(field('Scene grouping window'));
    await user.type(field('Scene grouping window'), '10{Enter}');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenLastCalledWith({ sceneWindowSeconds: 10 });

    await user.clear(field('Episode minimum events'));
    await user.type(field('Episode minimum events'), '4{Enter}');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).toHaveBeenLastCalledWith({ episodeMinEventCount: 4 });
  });

  it('refuses 31 for Episode capture interval and 21 for Episode minimum events', async () => {
    useAuth.mockReturnValue({ user: null });
    const setup = makeSetup();
    renderGroup(setup);

    await user.clear(field('Episode capture interval'));
    await user.type(field('Episode capture interval'), '31');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 30.');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.type(field('Episode capture interval'), '{Enter}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.clear(field('Episode minimum events'));
    await user.type(field('Episode minimum events'), '21');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 20.');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.type(field('Episode minimum events'), '{Enter}');

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(setup.saveRetentionMutation.mutateAsync).not.toHaveBeenCalled();
    expect(prefSetters.episodeWindowMinutes).not.toHaveBeenCalled();
    expect(prefSetters.episodeMinEventCount).not.toHaveBeenCalled();
  });

  it('signed out: shows Loading… in place of each field until the household config loads', () => {
    useAuth.mockReturnValue({ user: null });
    renderGroup(makeSetup({ retentionConfig: undefined }));
    expect(screen.getAllByText('Loading…')).toHaveLength(3);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('signed in: shows the preference values even before the household config loads', () => {
    useAuth.mockReturnValue(SIGNED_IN);
    renderGroup(makeSetup({ retentionConfig: undefined }));
    expect(field('Episode capture interval')).toHaveValue(3);
    expect(field('Scene grouping window')).toHaveValue(5);
    expect(field('Episode minimum events')).toHaveValue(3);
  });
});
