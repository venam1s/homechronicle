import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock IntersectionObserver (jsdom does not implement it)
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
beforeAll(() => {
  class MockIntersectionObserver {
    constructor() {}
    observe(el) { mockObserve(el); }
    unobserve() {}
    disconnect() { mockDisconnect(); }
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  // Mock scrollTo (jsdom does not implement it)
  window.HTMLElement.prototype.scrollTo = vi.fn();
});

vi.mock('../hooks/useEvents.js', () => ({
  useEvents: vi.fn(),
}));

const { unitState } = vi.hoisted(() => ({ unitState: { unit: 'c', symbol: '°C', setUnit: () => {} } }));
vi.mock('../hooks/useTemperatureUnit.js', () => ({
  useTemperatureUnit: () => unitState,
}));

import { useEvents } from '../hooks/useEvents.js';
import ActivityFeed from './ActivityFeed.jsx';

const MOCK_EVENTS = [
  {
    id: 1,
    timestamp: new Date().toISOString(),
    accessory_id: 'acc-1',
    accessory_name: 'Living Room Light',
    characteristic: 'On',
    old_value: 'false',
    new_value: 'true',
  },
  {
    id: 2,
    timestamp: new Date().toISOString(),
    accessory_id: 'acc-2',
    accessory_name: 'Kitchen Sensor',
    characteristic: 'Temperature',
    old_value: '21.5',
    new_value: '22.0',
  },
];

function wrapper({ children }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('ActivityFeed', () => {
  it('Test 1 (WIDGET-03): renders event rows with accessory_name, characteristic, old_value, new_value', () => {
    useEvents.mockReturnValue({ data: { events: MOCK_EVENTS, total: 2 }, isLoading: false });
    render(<ActivityFeed />, { wrapper });
    expect(screen.getByText('Living Room Light')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Sensor')).toBeInTheDocument();
    // Check for characteristic and value content in same span
    expect(screen.getByText(/On.*false.*true/)).toBeInTheDocument();
    expect(screen.getByText(/Temperature.*21\.5.*22\.0/)).toBeInTheDocument();
  });

  it('Test 2 (WIDGET-03): renders "Live Activity" Card.Header title and event count badge', () => {
    useEvents.mockReturnValue({ data: { events: MOCK_EVENTS, total: 2 }, isLoading: false });
    render(<ActivityFeed />, { wrapper });
    expect(screen.getByText('Live Activity')).toBeInTheDocument();
    // Event count badge shows number of events
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('Test 3 (WIDGET-03): renders empty state with "No recent events" when events array is empty', () => {
    useEvents.mockReturnValue({ data: { events: [], total: 0 }, isLoading: false });
    render(<ActivityFeed />, { wrapper });
    expect(screen.getByText('No recent events')).toBeInTheDocument();
  });

  it('Test 4 (WIDGET-04): IntersectionObserver is constructed with sentinel ref (mock verifies observe() called)', () => {
    mockObserve.mockClear();
    useEvents.mockReturnValue({ data: { events: MOCK_EVENTS, total: 2 }, isLoading: false });
    render(<ActivityFeed />, { wrapper });
    expect(mockObserve).toHaveBeenCalled();
  });

  it('Test 5: "View all" button is rendered in Card.Header actions', () => {
    useEvents.mockReturnValue({ data: { events: MOCK_EVENTS, total: 2 }, isLoading: false });
    const onViewAll = vi.fn();
    render(<ActivityFeed onViewAll={onViewAll} />, { wrapper });
    expect(screen.getByRole('button', { name: /view all/i })).toBeInTheDocument();
  });
});

describe('ActivityFeed temperature unit', () => {
  it("shows temperature changes in the user's unit and leaves other values raw", () => {
    unitState.unit = 'f';
    unitState.symbol = '°F';
    try {
      useEvents.mockReturnValue({
        data: {
          events: [
            { id: 11, timestamp: new Date().toISOString(), accessory_id: 'acc-3', accessory_name: 'Office Sensor', characteristic: 'CurrentTemperature', old_value: '23', new_value: '24' },
            { id: 12, timestamp: new Date().toISOString(), accessory_id: 'acc-1', accessory_name: 'Living Room Light', characteristic: 'On', old_value: 'false', new_value: 'true' },
          ],
          total: 2,
        },
        isLoading: false,
      });
      render(<ActivityFeed />, { wrapper });
      expect(screen.getByText(/73\.4 °F → 75\.2 °F/)).toBeInTheDocument();
      expect(screen.getByText(/false → true/)).toBeInTheDocument();
    } finally {
      unitState.unit = 'c';
      unitState.symbol = '°C';
    }
  });
});
