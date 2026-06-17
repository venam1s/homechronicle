import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './LoginPage.jsx';

// Captured before vi.mock hoisting so the Toast mock can close over it.
const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

vi.mock('./Toast.jsx', () => ({
  useToast: () => ({ addToast }),
}));

import { fetchJson } from '../lib/api.js';

const CREDENTIAL_COPY = 'Incorrect email or password.';
const OUTAGE_COPY = 'HomeChronicle is temporarily unavailable. Please try again in a moment.';

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'somepassword' },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage — error copy distinguishes 401 from a backend outage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401: shows the non-enumerating credential message', async () => {
    const err = new Error('Invalid credentials');
    err.status = 401;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(OUTAGE_COPY, 'error');
  });

  it('502 gateway error: shows the server-unavailable copy, NOT the credential message', async () => {
    const err = new Error('HTTP 502 (Bad Gateway)');
    err.status = 502;
    fetchJson.mockRejectedValueOnce(err);

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });

  it('network failure (no status): shows the server-unavailable copy', async () => {
    fetchJson.mockRejectedValueOnce(new Error('Failed to fetch'));

    renderLogin();
    submitCredentials();

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(OUTAGE_COPY, 'error');
    });
    expect(addToast).not.toHaveBeenCalledWith(CREDENTIAL_COPY, 'error');
  });
});
