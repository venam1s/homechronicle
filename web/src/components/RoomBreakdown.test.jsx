import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../hooks/useEvents.js', () => ({
  useAccessories: vi.fn(),
}));

import { useAccessories } from '../hooks/useEvents.js';
import RoomBreakdown from './RoomBreakdown.jsx';

const MOCK_ACCESSORIES = [
  { accessory_id: 'a1', accessory_name: 'Light 1', room_name: 'Living Room', category: 14, health: { status: 'online' } },
  { accessory_id: 'a2', accessory_name: 'Light 2', room_name: 'Living Room', category: 14, health: { status: 'online' } },
  { accessory_id: 'a3', accessory_name: 'Sensor 1', room_name: 'Kitchen', category: 10, health: { status: 'stale' } },
  { accessory_id: 'a4', accessory_name: 'Sensor 2', room_name: 'Kitchen', category: 10, health: { status: 'online' } },
  { accessory_id: 'a5', accessory_name: 'Outlet', room_name: 'Bedroom', category: 7, health: { status: 'offline' } },
  { accessory_id: 'a6', accessory_name: 'No Room', room_name: null, category: 14, health: { status: 'online' } },
  // Bridge parent — should be excluded from counts
  { accessory_id: 'aa:bb:cc:dd:ee:ff', accessory_name: 'Bridge', room_name: 'Living Room', category: 2, health: { status: 'online' } },
];

function wrapper({ children }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('RoomBreakdown', () => {
  it('Test 1 (WIDGET-05): renders room cards with room names from accessories grouped by room_name', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Bedroom')).toBeInTheDocument();
  });

  it('Test 2 (WIDGET-05): displays correct device count per room', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    // Living Room has 2 devices (bridge parent excluded), Kitchen has 2, Bedroom has 1, Unassigned has 1
    // Multiple rooms may show same count so use getAllByText
    expect(screen.getAllByText('2 devices').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 device').length).toBeGreaterThan(0);
  });

  it('Test 3 (WIDGET-05): shows green "All online" badge when all devices in a room are online', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    // Living Room has 2 online devices (bridge excluded)
    expect(screen.getAllByText('All online').length).toBeGreaterThan(0);
  });

  it('Test 4 (WIDGET-05): shows red "N offline" badge when any device in a room is offline', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    // Bedroom has 1 offline device
    expect(screen.getByText('1 offline')).toBeInTheDocument();
  });

  it('Test 5 (WIDGET-05): shows yellow "N stale" badge when some devices are stale but none offline', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    // Kitchen has 1 stale, 1 online — no offline
    expect(screen.getByText('1 stale')).toBeInTheDocument();
  });

  it('Test 6: accessories without room_name are grouped under "Unassigned"', () => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('Test 7: bridge parent accessories (category=2, 6-part id) are excluded from counts', () => {
    // Living Room has a1, a2, and the bridge parent aa:bb:cc:dd:ee:ff
    // After bridge filter, Living Room should show 2 devices, not 3
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    // If bridge was included, Living Room would show 3 devices
    const deviceCounts = screen.getAllByText(/\d+ devices?/);
    const livingRoomCard = screen.getByText('Living Room').closest('[role="button"]');
    expect(livingRoomCard).not.toBeNull();
    expect(livingRoomCard.textContent).toContain('2 devices');
  });

  it('Test 8: empty state shows "No rooms configured" when no accessories', () => {
    useAccessories.mockReturnValue({ data: [], isLoading: false });
    render(<RoomBreakdown />, { wrapper });
    expect(screen.getByText('No rooms configured')).toBeInTheDocument();
  });
});
