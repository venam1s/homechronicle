import { render, screen, fireEvent } from '@testing-library/react';
import AccessoryDetail from './AccessoryDetail.jsx';

const { mockMutate, detail } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  detail: {
    accessory: {
      accessory_id: 'h2',
      accessory_name: 'Roomba',
      room_name: 'Hall',
      service_type: 'Switch',
      category: 'power',
      category_auto: 'power',
      category_override: null,
      protocol: 'homekit',
      health: {},
    },
    history: { total: 0, page: 1, pages: 1, events: [] },
    uptime: {},
    current_state: [],
    activity: { days: 30, daily: [] },
  },
}));

vi.mock('../hooks/useEvents.js', () => ({
  useAccessoryDetail: () => ({ data: detail, isLoading: false, isError: false }),
  useAccessoryAnomalies: () => ({ data: { outliers: [] } }),
  useCharacteristicTrend: () => ({ data: null }),
  useAccessoryHeatmap: () => ({ data: null }),
  useAccessoryStateDuration: () => ({ data: null }),
  useAccessoryCharSummary: () => ({ data: null }),
}));

vi.mock('../hooks/useTemperatureUnit.js', () => ({
  useTemperatureUnit: () => ({ unit: 'c', symbol: '°C', setUnit: vi.fn() }),
}));

vi.mock('../hooks/useCategories.js', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'security', label: 'Security' },
        { id: 'power', label: 'Switches & outlets' },
        { id: 'cleaning', label: 'Cleaning' },
      ],
      overrides: {},
    },
  }),
  useSetCategory: () => ({ mutate: mockMutate, isPending: false, isError: false }),
}));

describe('AccessoryDetail category', () => {
  beforeEach(() => mockMutate.mockReset());

  it('shows the automatic category and saves an override', () => {
    render(<AccessoryDetail accessoryId="h2" onBack={() => {}} />);
    const select = screen.getByLabelText('Category');
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Automatic (Switches & outlets)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'cleaning' } });
    expect(mockMutate).toHaveBeenCalledWith({ accessoryId: 'h2', category: 'cleaning' });
  });

  it('goes back to automatic with an empty category', () => {
    detail.accessory.category_override = 'cleaning';
    render(<AccessoryDetail accessoryId="h2" onBack={() => {}} />);
    const select = screen.getByLabelText('Category');
    expect(select.value).toBe('cleaning');
    fireEvent.change(select, { target: { value: '' } });
    expect(mockMutate).toHaveBeenCalledWith({ accessoryId: 'h2', category: '' });
    detail.accessory.category_override = null;
  });
});

describe('AccessoryDetail announced addresses', () => {
  it('shows the address in use and the other announced addresses', () => {
    detail.accessory.address = '172.16.25.26';
    detail.accessory.addresses = ['10.0.0.193', '172.16.25.26'];
    render(<AccessoryDetail accessoryId="h2" onBack={() => {}} />);
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('172.16.25.26')).toBeInTheDocument();
    expect(screen.getByText('Also announced at')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.193')).toBeInTheDocument();
    delete detail.accessory.address;
    delete detail.accessory.addresses;
  });

  it('omits the extra row when the accessory announces a single address', () => {
    detail.accessory.address = '10.0.0.5';
    detail.accessory.addresses = ['10.0.0.5'];
    render(<AccessoryDetail accessoryId="h2" onBack={() => {}} />);
    expect(screen.queryByText('Also announced at')).toBeNull();
    delete detail.accessory.address;
    delete detail.accessory.addresses;
  });
});
