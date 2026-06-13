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
        channel: 'webhook',
        quietMinutes: 0,
        // no targetUrl — redacted by the server
      },
    ],
    isLoading: false,
  }),
  useAlertDeliveries: () => ({ data: { deliveries: [], pages: 1 }, isLoading: false }),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@example.com', role: 'admin' },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('../lib/api.js', () => ({
  fetchJson: vi.fn(() => Promise.resolve({})),
}));

// Helper: configure fetchJson to return specific SMTP status for a render
function mockSmtpUnconfigured() {
  fetchJson.mockImplementation((url) => {
    if (url === '/api/setup/smtp') return Promise.resolve({ host: null, passwordConfigured: false });
    return Promise.resolve({});
  });
}

function mockSmtpConfigured() {
  fetchJson.mockImplementation((url) => {
    if (url === '/api/setup/smtp') return Promise.resolve({ host: 'smtp.example.com', passwordConfigured: true });
    return Promise.resolve({});
  });
}

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
    fetchJson.mockImplementation(() => Promise.resolve({}));
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

describe('Alerts edit affordance discoverability', () => {
  beforeEach(() => {
    fetchJson.mockClear();
    fetchJson.mockImplementation(() => Promise.resolve({}));
  });

  it('renders an explicit Edit button per rule row', () => {
    renderAlerts();
    // The rule name button's accessible name is 'Test Rule'; an exact /^edit$/i
    // match proves a separate, discoverable Edit affordance exists.
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('activating the Edit button enters edit mode with the form prefilled', () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('button', { name: /update rule/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Rule name').value).toBe('Test Rule');
  });
});

describe('Alerts channel picker', () => {
  beforeEach(() => {
    fetchJson.mockClear();
    fetchJson.mockImplementation(() => Promise.resolve({}));
  });

  it('renders Webhook and Email radios with Webhook selected by default and URL input visible', () => {
    renderAlerts();
    const webhookRadio = screen.getByRole('radio', { name: /webhook/i });
    const emailRadio = screen.getByRole('radio', { name: /email/i });
    expect(webhookRadio).toBeChecked();
    expect(emailRadio).not.toBeChecked();
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('Recipient email address')).not.toBeInTheDocument();
  });

  it('selecting Email reveals the recipient input and prefills admin email when blank (D-02)', async () => {
    renderAlerts();
    const emailRadio = screen.getByRole('radio', { name: /email/i });
    fireEvent.click(emailRadio);

    await waitFor(() => {
      expect(screen.getByLabelText('Recipient email address')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Recipient email address').value).toBe('admin@example.com');
  });

  it('switching back to Webhook restores the URL input', async () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Recipient email address')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('radio', { name: /webhook/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Recipient email address')).not.toBeInTheDocument();
  });

  it('shows the SMTP-unconfigured hint with role=status when channel=email and SMTP is unconfigured, and does NOT disable the submit button', async () => {
    mockSmtpUnconfigured();
    renderAlerts();
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Email delivery is inactive until SMTP is configured in Settings.')
      ).toBeInTheDocument();
    });

    const hint = screen.getByRole('status');
    expect(hint).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /create rule/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('does NOT show the SMTP hint when SMTP is configured', async () => {
    mockSmtpConfigured();
    renderAlerts();
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));

    // Wait for the recipient input to appear AND for the SMTP query to resolve
    // (smtpUnconfigured starts true while the query is in-flight; once the
    // configured response arrives the hint must disappear).
    await waitFor(() => {
      expect(screen.getByLabelText('Recipient email address')).toBeInTheDocument();
      expect(
        screen.queryByText('Email delivery is inactive until SMTP is configured in Settings.')
      ).not.toBeInTheDocument();
    });
  });
});
