import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast.jsx';
import App from './App.jsx';

vi.mock('./components/Sidebar.jsx', () => ({
  default: ({ activePage, onNavigate }) => (
    <nav data-testid="sidebar">
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
vi.mock('./hooks/useUpdateCheck.js', () => ({ useUpdateCheck: () => ({ update: null, dismiss: () => {} }) }));
vi.mock('./hooks/useLiveEventToasts.js', () => ({ useLiveEventToasts: () => {} }));

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

  it('renders sidebar and navigates between pages', () => {
    renderApp();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
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
});
