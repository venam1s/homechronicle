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

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    user: { id: 1, email: 'admin@example.com', role: 'admin' },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => mockUseAuth(),
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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

describe('Alerts SMTP-unconfigured Email channel disable (MALERT-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmtpUnconfigured();
  });

  it('disables the Email radio when SMTP is unconfigured', async () => {
    renderAlerts();
    await waitFor(() => {
      const emailRadio = screen.getByRole('radio', { name: /email/i });
      expect(emailRadio).toBeDisabled();
    });
  });

  it('shows "Email not configured — ask an admin to set up SMTP" message when SMTP unconfigured', async () => {
    renderAlerts();
    await waitFor(() => {
      expect(
        screen.getByText('Email not configured — ask an admin to set up SMTP')
      ).toBeInTheDocument();
    });
  });

  it('does NOT disable the Email radio when SMTP is configured', async () => {
    mockSmtpConfigured();
    renderAlerts();
    await waitFor(() => {
      const emailRadio = screen.getByRole('radio', { name: /email/i });
      expect(emailRadio).not.toBeDisabled();
    });
  });
});

describe('Alerts member recipient read-only lock (MALERT-05)', () => {
  const memberUser = { user: { id: 2, email: 'member@example.com', role: 'member' }, isLoading: false, isError: false };
  const adminUser = { user: { id: 1, email: 'admin@example.com', role: 'admin' }, isLoading: false, isError: false };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchJson.mockImplementation(() => Promise.resolve({}));
    // Reset to default admin user after each test
    mockUseAuth.mockImplementation(() => adminUser);
  });

  it('member recipient input is disabled and prefilled with account email', async () => {
    mockUseAuth.mockImplementation(() => memberUser);
    renderAlerts();
    // fireEvent.click fires regardless of disabled state in jsdom
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));

    await waitFor(() => {
      const recipientInput = screen.getByLabelText('Recipient email address');
      expect(recipientInput).toBeDisabled();
      expect(recipientInput).toHaveAttribute('readonly');
      expect(recipientInput.value).toBe('member@example.com');
    });
  });

  it('admin recipient input is editable', async () => {
    mockSmtpConfigured();
    mockUseAuth.mockImplementation(() => adminUser);
    renderAlerts();
    // Wait for SMTP to resolve (radio not disabled)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /email/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));

    await waitFor(() => {
      const recipientInput = screen.getByLabelText('Recipient email address');
      expect(recipientInput).not.toBeDisabled();
      expect(recipientInput).not.toHaveAttribute('readonly');
    });
  });
});

// The quiet-period field defaults to 0, so its placeholder never showed and
// sighted users saw a bare, unexplained "0" (its name existed only in aria-label).
describe('Alerts quiet-period field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJson.mockImplementation(() => Promise.resolve({}));
  });

  it('has a visible label and unit, not just an aria-label', () => {
    renderAlerts();
    const input = screen.getByRole('spinbutton', { name: /quiet period/i });
    expect(input).not.toHaveAttribute('aria-label');
    const label = input.closest('label');
    expect(label).not.toBeNull();
    expect(label.textContent).toMatch(/Quiet period/);
    expect(label.textContent).toMatch(/min/);
  });
});

describe('Alerts threshold operators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJson.mockImplementation(() => Promise.resolve({}));
  });

  it('offers "Rises above" and "Drops below" operators', () => {
    renderAlerts();
    const select = screen.getByLabelText('Match operator');
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Rises above', 'Drops below']));
  });

  it('switches the value field to a threshold with a crossing hint and requires a characteristic', () => {
    renderAlerts();
    fireEvent.change(screen.getByLabelText('Match operator'), { target: { value: 'above' } });
    const threshold = screen.getByLabelText('Threshold');
    expect(threshold).toHaveAttribute('inputmode', 'decimal');
    expect(threshold).toHaveAccessibleDescription(/crosses this number/);
    expect(screen.getByLabelText('Characteristic filter')).toBeRequired();
  });

  it('does not require a characteristic filter when scoped by characteristic', () => {
    renderAlerts();
    fireEvent.change(screen.getByLabelText('Scope type'), { target: { value: 'characteristic' } });
    fireEvent.change(screen.getByLabelText('Match operator'), { target: { value: 'below' } });
    expect(screen.getByLabelText('Characteristic filter')).not.toBeRequired();
  });

  it('sends the operator and threshold when creating a rule', async () => {
    renderAlerts();
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Freezer warm' } });
    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://hooks.example.com/x' } });
    fireEvent.change(screen.getByLabelText('Characteristic filter'), { target: { value: 'CurrentTemperature' } });
    fireEvent.change(screen.getByLabelText('Match operator'), { target: { value: 'above' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '-10' } });
    fireEvent.click(screen.getByRole('button', { name: /create rule/i }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith('/api/alerts/rules', expect.objectContaining({ method: 'POST' }));
    });
    const [, opts] = fetchJson.mock.calls.find(([url, o]) => url === '/api/alerts/rules' && o?.method === 'POST');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ operator: 'above', matchValue: '-10', characteristic: 'CurrentTemperature' });
  });
});

describe('Alerts goes-quiet operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJson.mockImplementation(() => Promise.resolve({}));
  });

  it('turns the value field into hours with a hint and hides the quiet period', () => {
    renderAlerts();
    fireEvent.change(screen.getByLabelText('Match operator'), { target: { value: 'silent_for' } });
    const hours = screen.getByLabelText('Hours without events');
    expect(hours).toHaveAccessibleDescription(/nothing in this scope reports/);
    expect(screen.getByLabelText('Characteristic filter')).not.toBeRequired();
    expect(screen.queryByRole('spinbutton', { name: /quiet period/i })).toBeNull();
  });

  it('sends silent_for with the hours on create', async () => {
    renderAlerts();
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Freezer offline' } });
    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://hooks.example.com/x' } });
    fireEvent.change(screen.getByLabelText('Scope type'), { target: { value: 'accessory' } });
    fireEvent.change(screen.getByLabelText('Scope value'), { target: { value: 'Freezer' } });
    fireEvent.change(screen.getByLabelText('Match operator'), { target: { value: 'silent_for' } });
    fireEvent.change(screen.getByLabelText('Hours without events'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /create rule/i }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith('/api/alerts/rules', expect.objectContaining({ method: 'POST' }));
    });
    const [, opts] = fetchJson.mock.calls.find(([url, o]) => url === '/api/alerts/rules' && o?.method === 'POST');
    expect(JSON.parse(opts.body)).toMatchObject({ operator: 'silent_for', matchValue: '6', scopeValue: 'Freezer' });
  });
});
