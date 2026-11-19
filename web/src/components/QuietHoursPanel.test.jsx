import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuietHoursPanel, { quietHoursHasActivity } from './QuietHoursPanel.jsx';

// M-9 regression: exclude writes the blob when the blob carries quietHoursEnabled, still
// PATCHes retention otherwise, and toasts on failure.

const quietHoursData = {
  enabled: true,
  quietHoursStart: 23,
  quietHoursEnd: 6,
  events: [
    {
      accessoryId: 'AA:BB',
      accessoryName: 'Hall Motion',
      room: 'Hall',
      count: 4,
      lastSeenAt: new Date().toISOString(),
    },
  ],
};

// Tests swap `quietHours.current` to drive the panel into its other states.
const quietHours = { current: quietHoursData };
vi.mock('../hooks/useEvents.js', () => ({
  useQuietHours: () => ({ data: quietHours.current, isLoading: false, isError: false }),
}));

vi.mock('../lib/api.js', () => ({ fetchJson: vi.fn() }));

vi.mock('../hooks/useAuth.js', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useUserPreferences.js', () => ({ useUserPreferences: vi.fn() }));

const addToast = vi.fn();
vi.mock('./Toast.jsx', () => ({
  useToast: () => ({ addToast, dismiss: vi.fn(), configure: vi.fn() }),
}));

import { fetchJson } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useUserPreferences } from '../hooks/useUserPreferences.js';

function renderWithClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>), queryClient };
}

describe('QuietHoursPanel exclude (M-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quietHours.current = quietHoursData;
  });

  it('blob branch: authed + blob carries quietHoursEnabled -> setPrefsBlob with all four QH keys, no retention PATCH', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { id: 1, role: 'member' } });
    useUserPreferences.mockReturnValue({
      prefs: { quietHoursEnabled: true, quietHoursStart: 23, quietHoursEnd: 6, quietHoursExcludedAccessories: [] },
      setPrefsBlob,
    });

    renderWithClient(<QuietHoursPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByTitle('Exclude Hall Motion from quiet hours'));

    await waitFor(() => expect(setPrefsBlob).toHaveBeenCalledTimes(1));
    expect(setPrefsBlob).toHaveBeenCalledWith({
      quietHoursEnabled: true,
      quietHoursStart: 23,
      quietHoursEnd: 6,
      quietHoursExcludedAccessories: ['AA:BB'],
    });
    expect(fetchJson).not.toHaveBeenCalledWith('/api/setup/retention', expect.anything());
  });

  it('retention branch: anon / blob without quietHoursEnabled -> PATCHes /api/setup/retention, no setPrefsBlob call', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: {}, setPrefsBlob });
    fetchJson.mockResolvedValue({ quietHoursExcludedAccessories: ['AA:BB'] });

    renderWithClient(<QuietHoursPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByTitle('Exclude Hall Motion from quiet hours'));

    await waitFor(() => expect(fetchJson).toHaveBeenCalledWith(
      '/api/setup/retention',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    expect(setPrefsBlob).not.toHaveBeenCalled();
  });

  it('a rejected exclude (retention branch) surfaces an error toast', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: {}, setPrefsBlob });
    fetchJson.mockRejectedValue(new Error('Forbidden'));

    renderWithClient(<QuietHoursPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByTitle('Exclude Hall Motion from quiet hours'));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(addToast.mock.calls[0][1]).toBe('error');
  });
});

// The dashboard grid collapses the panel to a single row whenever this says
// there is nothing to show, so the predicate must agree with what renders.
describe('quietHoursHasActivity', () => {
  it('is true only for an enabled window with at least one event', () => {
    expect(quietHoursHasActivity(quietHoursData)).toBe(true);
  });

  it('is false while loading, on error, when disabled, and when the night was quiet', () => {
    expect(quietHoursHasActivity(undefined)).toBe(false);
    expect(quietHoursHasActivity(null)).toBe(false);
    expect(quietHoursHasActivity({ ...quietHoursData, enabled: false })).toBe(false);
    expect(quietHoursHasActivity({ ...quietHoursData, events: [] })).toBe(false);
    expect(quietHoursHasActivity({ enabled: true })).toBe(false);
  });
});

describe('QuietHoursPanel quiet state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: null, setPrefsBlob: vi.fn() });
  });

  afterEach(() => {
    quietHours.current = quietHoursData;
  });

  it('renders the all-clear as one row: title and message side by side', () => {
    quietHours.current = { ...quietHoursData, events: [] };
    renderWithClient(<QuietHoursPanel embedded />);
    const title = screen.getByRole('heading', { name: 'Quiet Hours' });
    const message = screen.getByText(/No unexpected activity during quiet hours/);
    // Same flex row, not a header block stacked over a paragraph.
    expect(title.closest('div').parentElement).toBe(message.closest('div').parentElement);
  });

  it('keeps the activity list when there is something to report', () => {
    renderWithClient(<QuietHoursPanel embedded />);
    expect(screen.getByRole('heading', { name: 'Quiet Hours Activity' })).toBeInTheDocument();
    expect(screen.getByText('Hall Motion')).toBeInTheDocument();
  });
});
