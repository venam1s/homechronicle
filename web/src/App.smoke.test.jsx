import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast.jsx';
import App from './App.jsx';

vi.mock('./components/Timeline.jsx', () => ({ default: () => <div>Timeline View</div> }));
vi.mock('./components/StatsCards.jsx', () => ({ default: () => <div>Stats Cards</div> }));
vi.mock('./components/ActivityChart.jsx', () => ({ default: () => <div>Activity Chart</div> }));
vi.mock('./components/TrendChart.jsx', () => ({ default: () => <div>Trend Chart</div> }));
vi.mock('./components/TopDevices.jsx', () => ({ default: () => <div>Top Devices</div> }));
vi.mock('./components/AnomalyPanel.jsx', () => ({ default: () => <div>Anomaly Panel</div> }));
vi.mock('./components/QuietHoursPanel.jsx', () => ({ default: () => <div>Quiet Hours Panel</div> }));
vi.mock('./components/HeatmapLane.jsx', () => ({ default: () => <div>Heatmap Lane</div> }));
vi.mock('./components/RoomChart.jsx', () => ({ default: () => <div>Room Chart</div> }));
vi.mock('./components/WeekdayHeatmap.jsx', () => ({ default: () => <div>Weekday Heatmap</div> }));
vi.mock('./components/MonthlyHeatmap.jsx', () => ({ default: () => <div>Monthly Heatmap</div> }));
vi.mock('./components/StaleDevicesPanel.jsx', () => ({ default: () => <div>Stale Devices Panel</div> }));
vi.mock('./components/AccessoryList.jsx', () => ({
  default: ({ onSelectAccessory }) => (
    <div>
      <div>Accessory List</div>
      <button type="button" onClick={() => onSelectAccessory?.('ACC-1')}>
        Open Accessory Detail
      </button>
    </div>
  ),
}));
vi.mock('./components/AccessoryDetail.jsx', () => ({
  default: ({ accessoryId, onBack }) => (
    <div>
      <div>{`Accessory Detail for ${accessoryId}`}</div>
      <button type="button" onClick={onBack}>Back</button>
    </div>
  ),
}));
vi.mock('./components/Setup.jsx', () => ({ default: () => <div>Manage View</div> }));
vi.mock('./hooks/useUpdateCheck.js', () => ({ useUpdateCheck: () => ({ updateAvailable: false }) }));
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

  it('renders and switches top-level tabs', () => {
    renderApp();

    expect(screen.getByRole('img', { name: /homechronicle/i })).toBeInTheDocument();
    expect(screen.getByText('Stats Cards')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /timeline/i }));
    expect(screen.getByText('Timeline View')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accessories/i }));
    expect(screen.getByText('Accessory List')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /alerts/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /manage/i }));
    expect(screen.getByText('Manage View')).toBeInTheDocument();
  });

  it('uses browser back from accessory detail to return to accessory list', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /accessories/i }));
    fireEvent.click(screen.getByRole('button', { name: /open accessory detail/i }));

    expect(screen.getByText('Accessory Detail for ACC-1')).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ hcView: 'accessory-detail', accessoryId: 'ACC-1' });

    act(() => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByText('Accessory List')).toBeInTheDocument();
    });
  });
});
