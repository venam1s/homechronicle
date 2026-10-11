import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const anomalies = vi.fn();
vi.mock('../hooks/useEvents.js', () => ({
  useAnomalies: () => anomalies(),
  useAccessories: () => ({ data: [] }),
}));

const { default: AnomalyPanel, describeOutlier } = await import('./AnomalyPanel.jsx');

// What the listener returns: `hour` is a UTC hour and `message` is
// pre-formatted in UTC ("device activity drop-off at 12pm UTC").
const DROP = {
  scopeType: 'device',
  scopeName: 'ZVille OWM · HumiditySensor',
  hour: 12,
  kind: 'dropoff',
  severity: 'medium',
  score: 3,
  eventCount: 0,
  baselineAvg: 4.37,
  message: 'device activity drop-off at 12pm UTC',
};

describe('AnomalyPanel', () => {
  beforeEach(() => {
    // EDT: UTC-4.
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(240);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Every other time on the dashboard is local; the outlier hour was the one
  // place a UTC hour reached the screen.
  it('describes the outlier hour in local time', () => {
    expect(describeOutlier(DROP)).toBe('device activity drop-off at 8 AM');
    expect(describeOutlier({ ...DROP, kind: 'spike', hour: 2, scopeType: 'room' })).toBe('room activity spike at 10 PM');
  });

  it('falls back to the server message when the row has no usable hour', () => {
    expect(describeOutlier({ ...DROP, hour: undefined })).toBe(DROP.message);
  });

  it('never renders UTC', () => {
    anomalies.mockReturnValue({ data: { devices: [DROP], rooms: [] }, isLoading: false, isError: false });
    render(<AnomalyPanel />);
    expect(screen.getByText(/drop-off at 8 AM/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/UTC/);
  });
});
