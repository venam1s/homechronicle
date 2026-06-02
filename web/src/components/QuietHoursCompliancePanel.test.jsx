import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useQuietHours: vi.fn(),
}));

import { useQuietHours } from '../hooks/useEvents.js';
import QuietHoursCompliancePanel from './QuietHoursCompliancePanel.jsx';

function makeData(opts = {}) {
  return {
    enabled: true,
    quietHoursStart: 23,
    quietHoursEnd: 6,
    events: opts.events ?? [],
    ...opts,
  };
}

describe('QuietHoursCompliancePanel', () => {
  beforeEach(() => {
    useQuietHours.mockReturnValue({ data: makeData(), isLoading: false, isError: false });
  });

  it('renders the Quiet Hours Score header', () => {
    render(<QuietHoursCompliancePanel />);
    expect(screen.getByText('Quiet Hours Score')).toBeInTheDocument();
  });

  it('shows configure copy when feature is disabled', () => {
    useQuietHours.mockReturnValue({
      data: { enabled: false, quietHoursStart: 23, quietHoursEnd: 6, events: [] },
      isLoading: false,
      isError: false,
    });
    render(<QuietHoursCompliancePanel />);
    expect(screen.getByText(/Configure quiet hours in Settings/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    useQuietHours.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<QuietHoursCompliancePanel />);
    expect(screen.getByText(/Checking compliance/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    useQuietHours.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<QuietHoursCompliancePanel />);
    expect(screen.getByText(/Could not load quiet hours data/i)).toBeInTheDocument();
  });

  it('data-level="success" when compliance >= 80 (0 violation events)', () => {
    useQuietHours.mockReturnValue({
      data: makeData({ events: [] }),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<QuietHoursCompliancePanel />);
    expect(container.querySelector('.hc-gauge')).toHaveAttribute('data-level', 'success');
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('data-level="warning" when compliance is 40-79 (10 violation events => 50%)', () => {
    useQuietHours.mockReturnValue({
      data: makeData({ events: [{ hour: 23, count: '10' }] }),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<QuietHoursCompliancePanel />);
    expect(container.querySelector('.hc-gauge')).toHaveAttribute('data-level', 'warning');
    expect(screen.getByText('Fair')).toBeInTheDocument();
  });

  it('data-level="danger" when compliance < 40 (16 violation events => 20%)', () => {
    useQuietHours.mockReturnValue({
      data: makeData({ events: [{ hour: 23, count: '16' }] }),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<QuietHoursCompliancePanel />);
    expect(container.querySelector('.hc-gauge')).toHaveAttribute('data-level', 'danger');
    expect(screen.getByText('Poor')).toBeInTheDocument();
  });

  it('data-level="success" when compliance === 80 (4 violation events => 80%)', () => {
    useQuietHours.mockReturnValue({
      data: makeData({ events: [{ hour: 23, count: '4' }] }),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<QuietHoursCompliancePanel />);
    expect(container.querySelector('.hc-gauge')).toHaveAttribute('data-level', 'success');
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('does not use inline style color on the status label', () => {
    const { container } = render(<QuietHoursCompliancePanel />);
    const statusLabel = container.querySelector('.hc-gauge ~ div span');
    // Tailwind class should drive color, not inline style
    expect(statusLabel?.style?.color ?? '').toBe('');
  });
});
