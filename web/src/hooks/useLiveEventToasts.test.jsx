import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast.jsx';

vi.mock('../lib/api.js', () => ({
  fetchJson: vi.fn(async () => ({
    events: [
      {
        id: 1,
        accessory_id: 'a1',
        accessory_name: 'Office',
        characteristic: 'CurrentTemperature',
        new_value: '23.5',
        timestamp: '2026-11-08T00:00:00.000Z',
      },
    ],
  })),
}));

vi.mock('./useTemperatureUnit.js', () => ({
  useTemperatureUnit: () => ({ unit: 'f', symbol: '°F', setUnit: () => {} }),
}));

const { useLiveEventToasts } = await import('./useLiveEventToasts.js');

function Probe() {
  useLiveEventToasts({
    activeTab: 'dashboard',
    retentionConfig: { liveEventToastsEnabled: true, toastAccessories: ['a1'] },
  });
  return null;
}

describe('useLiveEventToasts', () => {
  it("describes the reading in the user's temperature unit", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Probe />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Office — 74.3 °F')).toBeInTheDocument();
  });
});
