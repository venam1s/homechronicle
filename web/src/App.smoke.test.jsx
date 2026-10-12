import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast.jsx';
import App from './App.jsx';

vi.mock('./components/Masthead.jsx', () => ({
  default: ({ onNavigate }) => (
    <nav data-testid="masthead">
      {['dashboard', 'devices', 'timeline', 'alerts', 'settings'].map(id => (
        <button key={id} type="button" onClick={() => onNavigate(id)}>
          {id.charAt(0).toUpperCase() + id.slice(1)}
        </button>
      ))}
    </nav>
  ),
}));
vi.mock('./pages/DashboardPage.jsx', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('./pages/TimelinePage.jsx', () => ({ default: () => <div>Timeline Page</div> }));
vi.mock('./pages/DevicesPage.jsx', () => ({ default: () => <div>Devices Page</div> }));
vi.mock('./pages/AlertsPage.jsx', () => ({ default: () => <div>Alerts Page</div> }));
vi.mock('./pages/SettingsPage.jsx', () => ({ default: () => <div>Settings Page</div> }));
vi.mock('./components/AccessoryDetail.jsx', () => ({
  default: ({ accessoryId, onBack }) => (
    <div>
      <div>{`Accessory Detail for ${accessoryId}`}</div>
      <button type="button" onClick={onBack}>Back</button>
    </div>
  ),
}));
vi.mock('./hooks/useUpdateCheck.js', () => ({ useUpdateCheck: () => ({ update: null, latest: null, status: 'current', dismiss: () => {} }) }));
vi.mock('./hooks/useLiveEventToasts.js', () => ({ useLiveEventToasts: () => {} }));
// The real hook needs a router; the smoke test renders App without one.
const mockSignOut = vi.fn();
vi.mock('./hooks/useSignOut.js', () => ({
  useSignOut: () => ({ signOut: mockSignOut, isPending: false, available: true }),
}));
const mockUseMediaQuery = vi.fn(() => false);
vi.mock('./hooks/useMediaQuery.js', () => ({
  useMediaQuery: (...args) => mockUseMediaQuery(...args),
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('App smoke', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders the masthead and navigates between pages', () => {
    renderApp();

    expect(screen.getByTestId('masthead')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /timeline/i }));
    expect(screen.getByText('Timeline Page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /devices/i }));
    expect(screen.getByText('Devices Page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /alerts/i }));
    expect(screen.getByText('Alerts Page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });

  it('shows accessory detail and supports browser back', async () => {
    renderApp();

    // Simulate navigating to an accessory detail via history state
    act(() => {
      window.history.pushState({ hcView: 'accessory-detail', accessoryId: 'ACC-1' }, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { hcView: 'accessory-detail', accessoryId: 'ACC-1' } }));
    });

    await waitFor(() => {
      expect(screen.getByText('Accessory Detail for ACC-1')).toBeInTheDocument();
    });
  });

  // The FAB is fixed bottom-left over the scrolling <main>. Without bottom
  // padding, whatever ends up under it at the end of the page can never be
  // scrolled clear (at 390px it covered the last dashboard panel).
  it('pads the content so the floating nav never covers the end of the page', () => {
    mockUseMediaQuery.mockImplementation((query) => query === '(max-width: 767px)');
    const { unmount } = renderApp();
    expect(screen.getByRole('main').style.paddingBottom).toMatch(/88px/);
    unmount();

    mockUseMediaQuery.mockImplementation(() => false);
    renderApp();
    expect(screen.getByRole('main').style.paddingBottom).toBe('');
  });

  it('renders the floating nav (not the masthead) on mobile and navigates', () => {
    // Override for this test only
    mockUseMediaQuery.mockImplementation((query) => {
      if (query === '(max-width: 767px)') return true;
      return false;
    });

    renderApp();

    // Masthead is replaced by the floating FAB below 1024px
    expect(screen.queryByTestId('masthead')).not.toBeInTheDocument();
    const fab = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(fab).toBeInTheDocument();

    // Collapsed by default — page links hidden until the FAB is tapped
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();

    fireEvent.click(fab);
    fireEvent.click(screen.getByText('Timeline'));
    expect(screen.getByText('Timeline Page')).toBeInTheDocument();

    // The account menu lives in the masthead, so phones get Sign out here.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Reset mock
    mockUseMediaQuery.mockImplementation(() => false);
  });
});
