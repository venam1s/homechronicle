import { render, screen, fireEvent } from '@testing-library/react';
import CategoriesPanel from './CategoriesPanel.jsx';

const { mockStats } = vi.hoisted(() => ({ mockStats: vi.fn() }));
vi.mock('../hooks/useCategories.js', () => ({
  useCategoryStats: (days) => mockStats(days),
}));

const STATS = {
  days: 7,
  categories: [
    { id: 'security', label: 'Security', events: 120, previousEvents: 100, devices: 3, topDevices: [{ accessoryId: 'h1', name: 'Hall Motion', events: 80 }, { accessoryId: 'h2', name: 'Back Door', events: 40 }] },
    { id: 'lighting', label: 'Lighting', events: 30, previousEvents: 60, devices: 1, topDevices: [{ accessoryId: 'm1', name: 'Desk Lamp', events: 30 }] },
    { id: 'cleaning', label: 'Cleaning', events: 2, previousEvents: 0, devices: 1, topDevices: [] },
  ],
};

describe('CategoriesPanel', () => {
  beforeEach(() => mockStats.mockReset());

  it('asks for the last 7 days and lists categories with devices, events and trend', () => {
    mockStats.mockReturnValue({ data: STATS, isLoading: false, isError: false });
    render(<CategoriesPanel />);
    expect(mockStats).toHaveBeenCalledWith(7);
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('3 devices')).toBeInTheDocument();
    expect(screen.getAllByText('1 device')).toHaveLength(2);
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();   // 100 -> 120
    expect(screen.getByText('50%')).toBeInTheDocument();   // 60 -> 30
    expect(screen.getAllByText('up')).toHaveLength(1);
    expect(screen.getAllByText('down')).toHaveLength(1);
  });

  it('gives each category a fixed colour slot regardless of rank', () => {
    mockStats.mockReturnValue({ data: STATS, isLoading: false, isError: false });
    const { container } = render(<CategoriesPanel />);
    const swatches = [...container.querySelectorAll('li > div:first-child > span:first-child')];
    expect(swatches.map((s) => [...s.classList].find((c) => c.startsWith('hc-cat-')))).toEqual(['hc-cat-0', 'hc-cat-4', 'hc-cat-6']);
  });

  it('opens a device when its name is clicked', () => {
    mockStats.mockReturnValue({ data: STATS, isLoading: false, isError: false });
    const onSelectAccessory = vi.fn();
    render(<CategoriesPanel onSelectAccessory={onSelectAccessory} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back Door' }));
    expect(onSelectAccessory).toHaveBeenCalledWith('h2');
  });

  it('shows loading, error and empty states', () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { rerender } = render(<CategoriesPanel />);
    expect(screen.getByText(/Loading categories/)).toBeInTheDocument();
    mockStats.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    rerender(<CategoriesPanel />);
    expect(screen.getByText(/Could not load categories/)).toBeInTheDocument();
    mockStats.mockReturnValue({ data: { days: 7, categories: [] }, isLoading: false, isError: false });
    rerender(<CategoriesPanel />);
    expect(screen.getByText(/No device activity/)).toBeInTheDocument();
  });
});
