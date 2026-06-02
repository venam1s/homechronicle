import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useRetentionHealth: vi.fn(),
}));

import { useRetentionHealth } from '../hooks/useEvents.js';
import RetentionHealthPanel from './RetentionHealthPanel.jsx';

describe('RetentionHealthPanel', () => {
  beforeEach(() => {
    useRetentionHealth.mockReset();
  });

  it('shows loading state', () => {
    useRetentionHealth.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<RetentionHealthPanel />);
    expect(screen.getByText(/Loading database stats/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    useRetentionHealth.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<RetentionHealthPanel />);
    expect(screen.getByText(/Could not load database stats/i)).toBeInTheDocument();
  });

  it('renders formatted stat tiles', () => {
    useRetentionHealth.mockReturnValue({
      data: {
        totalRows: 12345,
        oldestEvent: '2026-01-01T00:00:00Z',
        newestEvent: '2026-06-01T00:00:00Z',
        avgEventsPerDay: 410,
        dbSizeBytes: 1572864, // 1.5 MB
        tableSizeBytes: 524288, // 512 KB
        retentionDays: 365,
        eventsPastRetention: 0,
        archivedRows: 100,
      },
      isLoading: false,
      isError: false,
    });
    render(<RetentionHealthPanel />);
    expect(screen.getByText('Total events')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('1.5 MB')).toBeInTheDocument();
    expect(screen.getByText('512 KB')).toBeInTheDocument();
    expect(screen.getByText('365 d')).toBeInTheDocument();
    expect(screen.getByText(/100 archived/i)).toBeInTheDocument();
  });
});
