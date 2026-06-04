import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Alerts from './Alerts.jsx';
import { fetchJson } from '../lib/api.js';

// targetUrl is redacted from GET /api/alerts/rules (secret webhook URLs are not
// disclosed over unauthenticated reads), so the rules list never carries it.
vi.mock('../hooks/useAlerts.js', () => ({
  useAlertRules: () => ({
    data: [
      {
        id: 7,
        name: 'Test Rule',
        enabled: true,
        scopeType: 'all',
        scopeValue: '',
        characteristic: '',
        operator: 'equals',
        matchValue: '1',
        quietMinutes: 0,
        // no targetUrl — redacted by the server
      },
    ],
    isLoading: false,
  }),
  useAlertDeliveries: () => ({ data: { deliveries: [], pages: 1 }, isLoading: false }),
}));

vi.mock('../lib/api.js', () => ({
  fetchJson: vi.fn(() => Promise.resolve({})),
}));

function renderAlerts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Alerts />
    </QueryClientProvider>
  );
}

function lastPatchBody() {
  const calls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
  const [, opts] = calls[calls.length - 1];
  return JSON.parse(opts.body);
}

describe('Alerts edit flow with redacted targetUrl', () => {
  beforeEach(() => {
    fetchJson.mockClear();
  });

  it('does not require the webhook URL when editing an existing rule', () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('button', { name: 'Test Rule' }));
    const urlInput = screen.getByLabelText('Webhook URL');
    expect(urlInput).not.toBeRequired();
    expect(urlInput.value).toBe('');
  });

  it('omits targetUrl from the PATCH so the existing webhook URL is preserved', async () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('button', { name: 'Test Rule' }));
    fireEvent.click(screen.getByRole('button', { name: /update rule/i }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith('/api/alerts/rules/7', expect.objectContaining({ method: 'PATCH' }));
    });
    expect('targetUrl' in lastPatchBody()).toBe(false);
  });

  it('sends targetUrl on the PATCH when the user enters a replacement URL', async () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('button', { name: 'Test Rule' }));
    fireEvent.change(screen.getByLabelText('Webhook URL'), {
      target: { value: 'https://hooks.example.com/new' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update rule/i }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith('/api/alerts/rules/7', expect.objectContaining({ method: 'PATCH' }));
    });
    expect(lastPatchBody().targetUrl).toBe('https://hooks.example.com/new');
  });
});
